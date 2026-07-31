"""Business rules for company expenses, categories, attachments and renewals."""

from __future__ import annotations

import calendar
import hashlib
import os
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

from fastapi import Request, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.exceptions import ConflictException, NotFoundException, ValidationException
from models import (
    ExpenseAttachment,
    ExpenseCategory,
    ExpenseCategoryStatus,
    ExpenseOccurrenceStatus,
    ExpenseRecord,
    ExpenseRecordStatus,
    ExpenseRenewal,
    ExpenseRenewalCycle,
    ExpenseRenewalOccurrence,
    ExpenseRenewalStatus,
    StaffUser,
)
from schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseRecordCreate,
    ExpenseRecordUpdate,
    ExpenseRenewalConfirmRequest,
    ExpenseRenewalCreate,
    ExpenseRenewalSkipRequest,
    ExpenseRenewalUpdate,
)

CENT = Decimal("0.01")
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
DEFAULT_CATEGORIES = (
    ("development", "开发", 10),
    ("marketing", "市场", 20),
    ("tool_membership", "工具会员", 30),
    ("server_cloud", "服务器/云服务", 40),
    ("operations", "日常运营", 50),
    ("tax_fees", "税费", 60),
    ("other", "其他", 70),
)
CYCLE_MONTHS = {
    ExpenseRenewalCycle.MONTHLY: 1,
    ExpenseRenewalCycle.QUARTERLY: 3,
    ExpenseRenewalCycle.SEMIANNUAL: 6,
    ExpenseRenewalCycle.ANNUAL: 12,
}
ALLOWED_ATTACHMENTS = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
}


def _money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _month_start(value: str | None) -> date:
    if not value:
        today = date.today()
        return today.replace(day=1)
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise ValidationException("月份格式必须为 YYYY-MM")
    try:
        return date.fromisoformat(f"{value}-01")
    except ValueError as error:
        raise ValidationException("月份无效") from error


def _shift_month(value: date, months: int) -> date:
    zero_based = value.year * 12 + value.month - 1 + months
    return date(zero_based // 12, zero_based % 12 + 1, 1)


def _is_month_end(value: date) -> bool:
    return value.day == calendar.monthrange(value.year, value.month)[1]


def _advance_due(renewal: ExpenseRenewal) -> date:
    months = CYCLE_MONTHS[renewal.cycle]
    first = _shift_month(renewal.next_due_on.replace(day=1), months)
    last_day = calendar.monthrange(first.year, first.month)[1]
    day = last_day if renewal.anchor_month_end else min(renewal.anchor_day, last_day)
    return first.replace(day=day)


def _attachment_root() -> Path:
    configured = os.getenv("EXPENSE_ATTACHMENT_DIR", "").strip()
    if configured:
        root = Path(configured).expanduser().resolve()
    else:
        root = (Path(__file__).resolve().parents[2] / "data" / "expense-attachments").resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _actor_id(actor: dict[str, Any]) -> int | None:
    value = actor.get("staff_id")
    return int(value) if value is not None else None


def _actor_name(actor: dict[str, Any]) -> str:
    return str(actor.get("username") or actor.get("display_name") or "staff")


class ExpenseService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_default_categories(self) -> None:
        count = int((await self.db.execute(select(func.count(ExpenseCategory.id)))).scalar() or 0)
        if count:
            return
        for code, name, order in DEFAULT_CATEGORIES:
            self.db.add(
                ExpenseCategory(
                    code=code,
                    name=name,
                    sort_order=order,
                    is_system=True,
                    status=ExpenseCategoryStatus.ACTIVE,
                )
            )
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()

    async def list_categories(self, include_archived: bool = True) -> list[dict[str, Any]]:
        await self.ensure_default_categories()
        query = select(ExpenseCategory)
        if not include_archived:
            query = query.where(ExpenseCategory.status == ExpenseCategoryStatus.ACTIVE)
        result = await self.db.execute(query.order_by(ExpenseCategory.sort_order, ExpenseCategory.id))
        return [self.serialize_category(category) for category in result.scalars().all()]

    async def create_category(
        self,
        payload: ExpenseCategoryCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self.ensure_default_categories()
        duplicate = await self.db.execute(
            select(ExpenseCategory.id).where(func.lower(ExpenseCategory.name) == payload.name.casefold())
        )
        if duplicate.scalar_one_or_none() is not None:
            raise ConflictException("支出分类名称已存在")
        category = ExpenseCategory(
            code=f"custom_{uuid.uuid4().hex[:16]}",
            name=payload.name,
            sort_order=payload.sort_order,
            status=ExpenseCategoryStatus.ACTIVE,
            is_system=False,
            created_by_staff_id=_actor_id(actor),
        )
        self.db.add(category)
        await self.db.flush()
        await self._audit("expense_category_create", "expense_category", category.id, actor, request, {"name": category.name})
        await self.db.commit()
        return self.serialize_category(category)

    async def update_category(
        self,
        category_id: int,
        payload: ExpenseCategoryUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        category = await self._category(category_id)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if "name" in changes:
            duplicate = await self.db.execute(
                select(ExpenseCategory.id).where(
                    func.lower(ExpenseCategory.name) == str(changes["name"]).casefold(),
                    ExpenseCategory.id != category.id,
                )
            )
            if duplicate.scalar_one_or_none() is not None:
                raise ConflictException("支出分类名称已存在")
        before = self.serialize_category(category)
        for field, value in changes.items():
            setattr(category, field, value)
        await self._audit("expense_category_update", "expense_category", category.id, actor, request, {"before": before, "after": changes})
        await self.db.commit()
        await self.db.refresh(category)
        return self.serialize_category(category)

    async def list_expenses(
        self,
        page: int,
        page_size: int,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> dict[str, Any]:
        filters = self._expense_filters(month, category_id, status, keyword)
        count = int((await self.db.execute(select(func.count(ExpenseRecord.id)).where(*filters))).scalar() or 0)
        query = self._expense_row_query().where(*filters).order_by(ExpenseRecord.expense_date.desc(), ExpenseRecord.id.desc())
        rows = (await self.db.execute(query.offset((page - 1) * page_size).limit(page_size))).all()
        return {
            "success": True,
            "message": "ok",
            "data": [self._serialize_expense_row(row) for row in rows],
            "total": count,
            "page": page,
            "page_size": page_size,
            "total_pages": (count + page_size - 1) // page_size,
        }

    async def export_expenses(
        self,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> list[dict[str, Any]]:
        rows = (await self.db.execute(
            self._expense_row_query()
            .where(*self._expense_filters(month, category_id, status, keyword))
            .order_by(ExpenseRecord.expense_date.desc(), ExpenseRecord.id.desc())
            .limit(10000)
        )).all()
        return [self._serialize_expense_row(row) for row in rows]

    async def get_expense(self, expense_id: int) -> dict[str, Any]:
        row = (await self.db.execute(self._expense_row_query().where(ExpenseRecord.id == expense_id))).one_or_none()
        if row is None:
            raise NotFoundException("支出记录不存在")
        attachments = (await self.db.execute(
            select(ExpenseAttachment)
            .where(ExpenseAttachment.expense_id == expense_id)
            .order_by(ExpenseAttachment.created_at, ExpenseAttachment.id)
        )).scalars().all()
        return self._serialize_expense_row(row, attachments)

    async def create_expense(
        self,
        payload: ExpenseRecordCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self._active_category(payload.category_id)
        record = ExpenseRecord(
            amount=_money(payload.amount),
            currency="CNY",
            expense_date=payload.expense_date,
            title=payload.title,
            category_id=payload.category_id,
            payee=payload.payee,
            note=payload.note,
            status=ExpenseRecordStatus.ACTIVE,
            created_by_staff_id=_actor_id(actor),
            updated_by_staff_id=_actor_id(actor),
        )
        self.db.add(record)
        await self.db.flush()
        await self._audit("expense_create", "expense", record.id, actor, request, {"amount": str(record.amount), "title": record.title})
        await self.db.commit()
        return await self.get_expense(record.id)

    async def update_expense(
        self,
        expense_id: int,
        payload: ExpenseRecordUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        record = await self._expense(expense_id, lock=True)
        if record.status != ExpenseRecordStatus.ACTIVE:
            raise ConflictException("已作废的支出不能修改")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if changes.get("category_id") is not None:
            await self._active_category(int(changes["category_id"]))
        before = {field: str(getattr(record, field)) for field in changes}
        for field, value in changes.items():
            setattr(record, field, _money(value) if field == "amount" else value)
        record.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_update", "expense", record.id, actor, request, {"before": before, "after": {key: str(value) for key, value in changes.items()}})
        await self.db.commit()
        return await self.get_expense(record.id)

    async def void_expense(
        self,
        expense_id: int,
        reason: str,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        record = await self._expense(expense_id, lock=True)
        if record.status == ExpenseRecordStatus.VOIDED:
            raise ConflictException("该支出已经作废")
        record.status = ExpenseRecordStatus.VOIDED
        record.void_reason = reason
        record.voided_at = datetime.utcnow()
        record.voided_by_staff_id = _actor_id(actor)
        record.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_void", "expense", record.id, actor, request, {"reason": reason})
        await self.db.commit()
        return await self.get_expense(record.id)

    async def summary(self, month: str | None = None) -> dict[str, Any]:
        start = _month_start(month)
        end = _shift_month(start, 1)
        previous = _shift_month(start, -1)

        async def total_between(begin: date, finish: date) -> tuple[Decimal, int]:
            row = (await self.db.execute(
                select(func.coalesce(func.sum(ExpenseRecord.amount), 0), func.count(ExpenseRecord.id)).where(
                    ExpenseRecord.status == ExpenseRecordStatus.ACTIVE,
                    ExpenseRecord.expense_date >= begin,
                    ExpenseRecord.expense_date < finish,
                )
            )).one()
            return _money(row[0]), int(row[1] or 0)

        total, count = await total_between(start, end)
        previous_total, _ = await total_between(previous, start)
        if previous_total == 0:
            change = Decimal("0") if total == 0 else Decimal("100")
        else:
            change = ((total - previous_total) / previous_total * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)

        category_rows = (await self.db.execute(
            select(ExpenseCategory.id, ExpenseCategory.name, func.coalesce(func.sum(ExpenseRecord.amount), 0))
            .join(ExpenseRecord, ExpenseRecord.category_id == ExpenseCategory.id)
            .where(
                ExpenseRecord.status == ExpenseRecordStatus.ACTIVE,
                ExpenseRecord.expense_date >= start,
                ExpenseRecord.expense_date < end,
            )
            .group_by(ExpenseCategory.id, ExpenseCategory.name)
            .order_by(func.sum(ExpenseRecord.amount).desc())
        )).all()
        categories = []
        for category_id, name, value in category_rows:
            category_total = _money(value)
            percentage = Decimal("0") if total == 0 else (category_total / total * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
            categories.append({"category_id": category_id, "category_name": name, "total": category_total, "percentage": percentage})

        trend = []
        for offset in range(-5, 1):
            trend_start = _shift_month(start, offset)
            trend_end = _shift_month(trend_start, 1)
            trend_total, _ = await total_between(trend_start, trend_end)
            trend.append({"month": trend_start.strftime("%Y-%m"), "total": trend_total})

        today = date.today()
        due_limit = today + timedelta(days=7)
        upcoming = int((await self.db.execute(select(func.count(ExpenseRenewal.id)).where(
            ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
            ExpenseRenewal.next_due_on >= today,
            ExpenseRenewal.next_due_on <= due_limit,
        ))).scalar() or 0)
        overdue = int((await self.db.execute(select(func.count(ExpenseRenewal.id)).where(
            ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
            ExpenseRenewal.next_due_on < today,
        ))).scalar() or 0)
        return {
            "month": start.strftime("%Y-%m"),
            "total": total,
            "previous_total": previous_total,
            "change_percent": change,
            "count": count,
            "upcoming_renewals": upcoming,
            "overdue_renewals": overdue,
            "trend": trend,
            "categories": categories,
        }

    async def add_attachment(
        self,
        expense_id: int,
        upload: UploadFile,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        record = await self._expense(expense_id)
        if record.status != ExpenseRecordStatus.ACTIVE:
            raise ConflictException("已作废的支出不能新增凭证")
        attachment_count = int((await self.db.execute(select(func.count(ExpenseAttachment.id)).where(
            ExpenseAttachment.expense_id == expense_id
        ))).scalar() or 0)
        if attachment_count >= MAX_ATTACHMENTS:
            raise ConflictException(f"每笔支出最多上传 {MAX_ATTACHMENTS} 个凭证")
        filename = (upload.filename or "").strip()
        safe_name = Path(filename).name
        if not safe_name or safe_name != filename:
            raise ValidationException("凭证文件名无效")
        suffix = Path(safe_name).suffix.lower()
        allowed_mimes = ALLOWED_ATTACHMENTS.get(suffix)
        if not allowed_mimes or upload.content_type not in allowed_mimes:
            raise ValidationException("凭证仅支持 JPG、PNG、WebP 或 PDF")

        root = _attachment_root()
        storage_key = f"{date.today():%Y/%m}/{uuid.uuid4().hex}{suffix}"
        target = (root / storage_key).resolve()
        if root != target and root not in target.parents:
            raise ValidationException("凭证存储路径无效")
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size = 0
        try:
            with target.open("wb") as output:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_ATTACHMENT_BYTES:
                        raise ValidationException("单个凭证不能超过 10MB")
                    digest.update(chunk)
                    output.write(chunk)
            if size <= 0:
                raise ValidationException("凭证文件不能为空")
            attachment = ExpenseAttachment(
                expense_id=expense_id,
                storage_key=storage_key,
                original_name=safe_name,
                mime_type=upload.content_type or "application/octet-stream",
                size_bytes=size,
                sha256=digest.hexdigest(),
                uploaded_by_staff_id=_actor_id(actor),
            )
            self.db.add(attachment)
            await self.db.flush()
            await self._audit("expense_attachment_add", "expense_attachment", attachment.id, actor, request, {"expense_id": expense_id, "name": safe_name})
            await self.db.commit()
            return self.serialize_attachment(attachment)
        except Exception:
            target.unlink(missing_ok=True)
            raise

    async def attachment_file(self, expense_id: int, attachment_id: int) -> tuple[Path, ExpenseAttachment]:
        attachment = (await self.db.execute(select(ExpenseAttachment).where(
            ExpenseAttachment.id == attachment_id,
            ExpenseAttachment.expense_id == expense_id,
        ))).scalar_one_or_none()
        if attachment is None:
            raise NotFoundException("支出凭证不存在")
        root = _attachment_root()
        path = (root / attachment.storage_key).resolve()
        if root != path and root not in path.parents:
            raise NotFoundException("支出凭证不存在")
        if not path.is_file():
            raise NotFoundException("支出凭证文件已丢失")
        return path, attachment

    async def delete_attachment(
        self,
        expense_id: int,
        attachment_id: int,
        actor: dict[str, Any],
        request: Request,
    ) -> None:
        record = await self._expense(expense_id)
        if record.status != ExpenseRecordStatus.ACTIVE:
            raise ConflictException("已作废支出的凭证不能删除")
        path, attachment = await self.attachment_file(expense_id, attachment_id)
        await self.db.delete(attachment)
        await self._audit("expense_attachment_delete", "expense_attachment", attachment.id, actor, request, {"expense_id": expense_id, "name": attachment.original_name})
        await self.db.commit()
        path.unlink(missing_ok=True)

    async def list_renewals(
        self,
        page: int,
        page_size: int,
        status: str | None,
        due_state: str | None,
        keyword: str | None,
    ) -> dict[str, Any]:
        filters = self._renewal_filters(status, due_state, keyword)
        total = int((await self.db.execute(select(func.count(ExpenseRenewal.id)).where(*filters))).scalar() or 0)
        rows = (await self.db.execute(
            self._renewal_row_query().where(*filters).order_by(ExpenseRenewal.next_due_on, ExpenseRenewal.id)
            .offset((page - 1) * page_size).limit(page_size)
        )).all()
        return {
            "success": True,
            "message": "ok",
            "data": [self._serialize_renewal_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
        }

    async def get_renewal(self, renewal_id: int) -> dict[str, Any]:
        row = (await self.db.execute(self._renewal_row_query().where(ExpenseRenewal.id == renewal_id))).one_or_none()
        if row is None:
            raise NotFoundException("续费项目不存在")
        occurrences = (await self.db.execute(
            select(ExpenseRenewalOccurrence)
            .where(ExpenseRenewalOccurrence.renewal_id == renewal_id)
            .order_by(ExpenseRenewalOccurrence.due_on.desc(), ExpenseRenewalOccurrence.id.desc())
            .limit(24)
        )).scalars().all()
        return self._serialize_renewal_row(row, occurrences)

    async def create_renewal(
        self,
        payload: ExpenseRenewalCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self._active_category(payload.category_id)
        renewal = ExpenseRenewal(
            name=payload.name,
            vendor=payload.vendor,
            default_amount=_money(payload.default_amount),
            category_id=payload.category_id,
            cycle=payload.cycle,
            next_due_on=payload.next_due_on,
            reminder_days=payload.reminder_days,
            anchor_day=payload.next_due_on.day,
            anchor_month_end=_is_month_end(payload.next_due_on),
            status=ExpenseRenewalStatus.ACTIVE,
            note=payload.note,
            created_by_staff_id=_actor_id(actor),
            updated_by_staff_id=_actor_id(actor),
        )
        self.db.add(renewal)
        await self.db.flush()
        await self._audit("expense_renewal_create", "expense_renewal", renewal.id, actor, request, {"name": renewal.name, "next_due_on": renewal.next_due_on})
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def update_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status == ExpenseRenewalStatus.ENDED:
            raise ConflictException("已结束的续费项目不能修改")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if changes.get("category_id") is not None:
            await self._active_category(int(changes["category_id"]))
        if "default_amount" in changes:
            changes["default_amount"] = _money(changes["default_amount"])
        if "next_due_on" in changes:
            next_due = changes["next_due_on"]
            renewal.anchor_day = next_due.day
            renewal.anchor_month_end = _is_month_end(next_due)
        for field, value in changes.items():
            setattr(renewal, field, value)
        renewal.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_renewal_update", "expense_renewal", renewal.id, actor, request, {"changes": {key: str(value) for key, value in changes.items()}})
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def pause_renewal(self, renewal_id: int, actor: dict[str, Any], request: Request) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("只有进行中的续费项目可以暂停")
        renewal.status = ExpenseRenewalStatus.PAUSED
        renewal.paused_at = datetime.utcnow()
        renewal.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_renewal_pause", "expense_renewal", renewal.id, actor, request)
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def resume_renewal(
        self,
        renewal_id: int,
        next_due_on: date,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.PAUSED:
            raise ConflictException("只有已暂停的续费项目可以恢复")
        renewal.status = ExpenseRenewalStatus.ACTIVE
        renewal.next_due_on = next_due_on
        renewal.anchor_day = next_due_on.day
        renewal.anchor_month_end = _is_month_end(next_due_on)
        renewal.paused_at = None
        renewal.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_renewal_resume", "expense_renewal", renewal.id, actor, request, {"next_due_on": next_due_on})
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def end_renewal(self, renewal_id: int, actor: dict[str, Any], request: Request) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status == ExpenseRenewalStatus.ENDED:
            raise ConflictException("续费项目已经结束")
        renewal.status = ExpenseRenewalStatus.ENDED
        renewal.ended_at = datetime.utcnow()
        renewal.updated_by_staff_id = _actor_id(actor)
        await self._audit("expense_renewal_end", "expense_renewal", renewal.id, actor, request)
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def confirm_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalConfirmRequest,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("当前续费项目不能确认入账")
        due_on = renewal.next_due_on
        if payload.due_on != due_on:
            raise ConflictException("续费周期已经变化，请刷新后重试")
        await self._assert_occurrence_available(renewal.id, due_on)
        expense = ExpenseRecord(
            amount=_money(payload.amount if payload.amount is not None else renewal.default_amount),
            currency="CNY",
            expense_date=payload.expense_date or date.today(),
            title=renewal.name,
            category_id=renewal.category_id,
            payee=renewal.vendor,
            note=payload.note or renewal.note,
            status=ExpenseRecordStatus.ACTIVE,
            renewal_id=renewal.id,
            renewal_due_on=due_on,
            created_by_staff_id=_actor_id(actor),
            updated_by_staff_id=_actor_id(actor),
        )
        self.db.add(expense)
        try:
            await self.db.flush()
            self.db.add(ExpenseRenewalOccurrence(
                renewal_id=renewal.id,
                due_on=due_on,
                status=ExpenseOccurrenceStatus.PAID,
                expense_id=expense.id,
                note=payload.note,
                processed_by_staff_id=_actor_id(actor),
            ))
            renewal.next_due_on = _advance_due(renewal)
            renewal.updated_by_staff_id = _actor_id(actor)
            await self._audit("expense_renewal_confirm", "expense_renewal", renewal.id, actor, request, {"due_on": due_on, "expense_id": expense.id, "amount": str(expense.amount)})
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("该续费周期已经处理，请刷新后重试") from error
        return {"renewal": await self.get_renewal(renewal.id), "expense": await self.get_expense(expense.id)}

    async def skip_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalSkipRequest,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("当前续费项目不能跳过")
        due_on = renewal.next_due_on
        if payload.due_on != due_on:
            raise ConflictException("续费周期已经变化，请刷新后重试")
        await self._assert_occurrence_available(renewal.id, due_on)
        self.db.add(ExpenseRenewalOccurrence(
            renewal_id=renewal.id,
            due_on=due_on,
            status=ExpenseOccurrenceStatus.SKIPPED,
            note=payload.note,
            processed_by_staff_id=_actor_id(actor),
        ))
        renewal.next_due_on = _advance_due(renewal)
        renewal.updated_by_staff_id = _actor_id(actor)
        try:
            await self._audit("expense_renewal_skip", "expense_renewal", renewal.id, actor, request, {"due_on": due_on, "note": payload.note})
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("该续费周期已经处理，请刷新后重试") from error
        return await self.get_renewal(renewal.id)

    async def due_items(self, limit: int = 20, window_days: int = 7) -> list[dict[str, Any]]:
        today = date.today()
        rows = (await self.db.execute(
            self._renewal_row_query().where(
                ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                ExpenseRenewal.next_due_on <= today + timedelta(days=window_days),
            ).order_by(ExpenseRenewal.next_due_on, ExpenseRenewal.id).limit(limit)
        )).all()
        return [self._serialize_renewal_row(row) for row in rows]

    def _expense_filters(
        self,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> list[Any]:
        filters: list[Any] = []
        if month:
            start = _month_start(month)
            filters.extend([ExpenseRecord.expense_date >= start, ExpenseRecord.expense_date < _shift_month(start, 1)])
        if category_id:
            filters.append(ExpenseRecord.category_id == category_id)
        if status:
            if status not in ExpenseRecordStatus.ALL:
                raise ValidationException("支出状态无效")
            filters.append(ExpenseRecord.status == status)
        if keyword and keyword.strip():
            value = f"%{keyword.strip()}%"
            filters.append(or_(ExpenseRecord.title.ilike(value), ExpenseRecord.payee.ilike(value), ExpenseRecord.note.ilike(value)))
        return filters

    def _renewal_filters(self, status: str | None, due_state: str | None, keyword: str | None) -> list[Any]:
        filters: list[Any] = []
        if status:
            if status not in ExpenseRenewalStatus.ALL:
                raise ValidationException("续费状态无效")
            filters.append(ExpenseRenewal.status == status)
        today = date.today()
        if due_state:
            if due_state == "overdue":
                filters.extend([ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE, ExpenseRenewal.next_due_on < today])
            elif due_state == "due":
                filters.extend([ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE, ExpenseRenewal.next_due_on == today])
            elif due_state == "upcoming":
                filters.extend([
                    ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                    ExpenseRenewal.next_due_on > today,
                    ExpenseRenewal.next_due_on <= today + timedelta(days=7),
                ])
            else:
                raise ValidationException("续费到期筛选无效")
        if keyword and keyword.strip():
            value = f"%{keyword.strip()}%"
            filters.append(or_(ExpenseRenewal.name.ilike(value), ExpenseRenewal.vendor.ilike(value)))
        return filters

    @staticmethod
    def _expense_row_query() -> Any:
        return (
            select(ExpenseRecord, ExpenseCategory.name, StaffUser.display_name, ExpenseRenewal.name)
            .join(ExpenseCategory, ExpenseRecord.category_id == ExpenseCategory.id)
            .outerjoin(StaffUser, ExpenseRecord.created_by_staff_id == StaffUser.id)
            .outerjoin(ExpenseRenewal, ExpenseRecord.renewal_id == ExpenseRenewal.id)
        )

    @staticmethod
    def _renewal_row_query() -> Any:
        return select(ExpenseRenewal, ExpenseCategory.name).join(ExpenseCategory, ExpenseRenewal.category_id == ExpenseCategory.id)

    def _serialize_expense_row(self, row: Any, attachments: list[ExpenseAttachment] | None = None) -> dict[str, Any]:
        record, category_name, creator_name, renewal_name = row
        return {
            "id": record.id,
            "amount": _money(record.amount),
            "currency": "CNY",
            "expense_date": record.expense_date,
            "title": record.title,
            "category_id": record.category_id,
            "category_name": category_name,
            "payee": record.payee,
            "note": record.note,
            "status": record.status,
            "renewal_id": record.renewal_id,
            "renewal_name": renewal_name,
            "renewal_due_on": record.renewal_due_on,
            "created_by_staff_id": record.created_by_staff_id,
            "created_by_name": creator_name,
            "updated_by_staff_id": record.updated_by_staff_id,
            "voided_by_staff_id": record.voided_by_staff_id,
            "voided_at": record.voided_at,
            "void_reason": record.void_reason,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "attachments": [self.serialize_attachment(item) for item in attachments or []],
        }

    def _serialize_renewal_row(
        self,
        row: Any,
        occurrences: list[ExpenseRenewalOccurrence] | None = None,
    ) -> dict[str, Any]:
        renewal, category_name = row
        return {
            "id": renewal.id,
            "name": renewal.name,
            "vendor": renewal.vendor,
            "default_amount": _money(renewal.default_amount),
            "category_id": renewal.category_id,
            "category_name": category_name,
            "cycle": renewal.cycle,
            "next_due_on": renewal.next_due_on,
            "reminder_days": renewal.reminder_days,
            "status": renewal.status,
            "due_state": self._due_state(renewal),
            "note": renewal.note,
            "created_by_staff_id": renewal.created_by_staff_id,
            "updated_by_staff_id": renewal.updated_by_staff_id,
            "paused_at": renewal.paused_at,
            "ended_at": renewal.ended_at,
            "created_at": renewal.created_at,
            "updated_at": renewal.updated_at,
            "occurrences": [self.serialize_occurrence(item) for item in occurrences or []],
        }

    @staticmethod
    def _due_state(renewal: ExpenseRenewal) -> str:
        if renewal.status == ExpenseRenewalStatus.PAUSED:
            return "paused"
        if renewal.status == ExpenseRenewalStatus.ENDED:
            return "ended"
        today = date.today()
        if renewal.next_due_on < today:
            return "overdue"
        if renewal.next_due_on == today:
            return "due"
        if renewal.next_due_on <= today + timedelta(days=renewal.reminder_days):
            return "upcoming"
        return "scheduled"

    async def _category(self, category_id: int) -> ExpenseCategory:
        category = (await self.db.execute(select(ExpenseCategory).where(ExpenseCategory.id == category_id))).scalar_one_or_none()
        if category is None:
            raise NotFoundException("支出分类不存在")
        return category

    async def _active_category(self, category_id: int) -> ExpenseCategory:
        category = await self._category(category_id)
        if category.status != ExpenseCategoryStatus.ACTIVE:
            raise ConflictException("该支出分类已停用")
        return category

    async def _expense(self, expense_id: int, lock: bool = False) -> ExpenseRecord:
        query = select(ExpenseRecord).where(ExpenseRecord.id == expense_id)
        if lock:
            query = query.with_for_update()
        record = (await self.db.execute(query)).scalar_one_or_none()
        if record is None:
            raise NotFoundException("支出记录不存在")
        return record

    async def _renewal(self, renewal_id: int, lock: bool = False) -> ExpenseRenewal:
        query = select(ExpenseRenewal).where(ExpenseRenewal.id == renewal_id)
        if lock:
            query = query.with_for_update()
        renewal = (await self.db.execute(query)).scalar_one_or_none()
        if renewal is None:
            raise NotFoundException("续费项目不存在")
        return renewal

    async def _assert_occurrence_available(self, renewal_id: int, due_on: date) -> None:
        existing = (await self.db.execute(select(ExpenseRenewalOccurrence.id).where(
            ExpenseRenewalOccurrence.renewal_id == renewal_id,
            ExpenseRenewalOccurrence.due_on == due_on,
        ))).scalar_one_or_none()
        if existing is not None:
            raise ConflictException("该续费周期已经处理")

    async def _audit(
        self,
        action: str,
        target_type: str,
        target_id: int,
        actor: dict[str, Any],
        request: Request,
        detail: dict[str, Any] | None = None,
    ) -> None:
        await log_admin_action(
            self.db,
            user_id=_actor_id(actor),
            user_name=_actor_name(actor),
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            request=request,
        )

    @staticmethod
    def serialize_category(category: ExpenseCategory) -> dict[str, Any]:
        return {
            "id": category.id,
            "code": category.code,
            "name": category.name,
            "status": category.status,
            "sort_order": category.sort_order,
            "is_system": bool(category.is_system),
            "created_at": category.created_at,
            "updated_at": category.updated_at,
        }

    @staticmethod
    def serialize_attachment(attachment: ExpenseAttachment) -> dict[str, Any]:
        return {
            "id": attachment.id,
            "expense_id": attachment.expense_id,
            "original_name": attachment.original_name,
            "mime_type": attachment.mime_type,
            "size_bytes": attachment.size_bytes,
            "sha256": attachment.sha256,
            "created_at": attachment.created_at,
        }

    @staticmethod
    def serialize_occurrence(occurrence: ExpenseRenewalOccurrence) -> dict[str, Any]:
        return {
            "id": occurrence.id,
            "renewal_id": occurrence.renewal_id,
            "due_on": occurrence.due_on,
            "status": occurrence.status,
            "expense_id": occurrence.expense_id,
            "note": occurrence.note,
            "processed_by_staff_id": occurrence.processed_by_staff_id,
            "processed_at": occurrence.processed_at,
        }
