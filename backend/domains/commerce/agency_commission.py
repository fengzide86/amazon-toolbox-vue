"""Opt-in partner commission ledger and owner-confirmed monthly settlement."""

from __future__ import annotations

import hashlib
import json
import re
from calendar import monthrange
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.response import paginated_response
from core.timestamps import utc_now
from models import Agency, AgencyCommissionEntry, AgencyCommissionSettlement, Order
from schemas.agency_commission import CommissionSettlementConfirm

CENT = Decimal("0.01")


def _month_end(month: str) -> datetime:
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(422, "结算月份格式应为 YYYY-MM")
    year, number = (int(value) for value in month.split("-"))
    if year < 1 or month > utc_now().strftime("%Y-%m"):
        raise HTTPException(422, "结算月份无效或尚未到来")
    return datetime(year, number, monthrange(year, number)[1], 23, 59, 59, 999999)


class AgencyCommissionService:
    def __init__(self, db: AsyncSession, actor: dict[str, Any]) -> None:
        self.db = db
        self.actor = actor

    def _owner(self) -> None:
        if self.actor.get("role") != "super_admin":
            raise HTTPException(403, "该操作仅平台负责人可执行")

    async def _agency(self, agency_id: int, *, lock: bool = False) -> Agency:
        if self.actor.get("role") not in {"super_admin", "agent"}:
            raise HTTPException(403, "当前账号无代理工作台权限")
        if self.actor.get("role") == "agent" and self.actor.get("agency_id") != agency_id:
            raise HTTPException(403, "不能访问其他代理的数据")
        query = select(Agency).where(Agency.id == agency_id)
        if lock:
            # All ledger writers and settlement confirmation take this lock.
            # SQLite ignores FOR UPDATE; its no-op UPDATE acquires the write
            # lock instead, without changing the configured policy.
            if self.db.get_bind().dialect.name == "sqlite":
                await self.db.execute(update(Agency).where(Agency.id == agency_id).values(commission_rate=Agency.commission_rate))
            query = query.with_for_update().execution_options(populate_existing=True)
        agency = (await self.db.execute(query)).scalar_one_or_none()
        if not agency:
            raise HTTPException(404, "代理主体不存在")
        return agency

    async def policy(self, agency_id: int) -> dict[str, Any]:
        agency = await self._agency(agency_id)
        return {"agency_id": agency.id, "rate": agency.commission_rate}

    async def update_policy(self, agency_id: int, rate: Decimal | None, expected_rate: Decimal | None) -> dict[str, Any]:
        self._owner()
        agency = await self._agency(agency_id, lock=True)
        current = Decimal(str(agency.commission_rate)) if agency.commission_rate is not None else None
        if expected_rate != current:
            raise HTTPException(409, "代理比例已被其他操作修改，请刷新后重试")
        agency.commission_rate = rate
        await self.db.commit()
        await self.db.refresh(agency)
        return {"agency_id": agency.id, "rate": agency.commission_rate}

    async def record_accrual(self, order: Order, actor_id: int | None = None) -> AgencyCommissionEntry | None:
        if order.agency_id is None:
            return None
        self._owner()
        agency = await self._agency(order.agency_id, lock=True)
        if agency.commission_rate is None:
            return None
        exists = (await self.db.execute(select(AgencyCommissionEntry).where(AgencyCommissionEntry.order_id == order.id, AgencyCommissionEntry.kind == "accrual").with_for_update())).scalar_one_or_none()
        if exists:
            return exists
        rate = Decimal(str(agency.commission_rate))
        amount = (Decimal(str(order.amount)) * rate).quantize(CENT, rounding=ROUND_HALF_UP)
        entry = AgencyCommissionEntry(
            agency_id=agency.id, order_id=order.id, order_no=order.order_no, kind="accrual",
            amount=amount, rate_snapshot=rate, order_amount_snapshot=Decimal(str(order.amount)),
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def record_refund(self, order: Order) -> AgencyCommissionEntry | None:
        # Ordinary (non-agency) commerce orders do not participate in this
        # ledger and remain refundable by the existing commerce roles.
        if order.agency_id is None:
            return None
        self._owner()
        accrual = (await self.db.execute(select(AgencyCommissionEntry).where(AgencyCommissionEntry.order_id == order.id, AgencyCommissionEntry.kind == "accrual"))).scalar_one_or_none()
        if not accrual:
            return None
        # Customer transfers do not transfer a paid order's commission. The
        # refund always reverses the original agency's immutable snapshot.
        await self._agency(accrual.agency_id, lock=True)
        exists = (await self.db.execute(select(AgencyCommissionEntry).where(AgencyCommissionEntry.order_id == order.id, AgencyCommissionEntry.kind == "refund").with_for_update())).scalar_one_or_none()
        if exists:
            return exists
        entry = AgencyCommissionEntry(
            agency_id=accrual.agency_id, order_id=order.id, order_no=order.order_no, kind="refund",
            amount=-abs(Decimal(str(accrual.amount))), rate_snapshot=accrual.rate_snapshot,
            order_amount_snapshot=accrual.order_amount_snapshot,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def entries(self, agency_id: int, page: int, page_size: int, settled: bool | None = None) -> dict[str, Any]:
        await self._agency(agency_id)
        query = select(AgencyCommissionEntry).where(AgencyCommissionEntry.agency_id == agency_id)
        if settled is True:
            query = query.where(AgencyCommissionEntry.settlement_id.is_not(None))
        elif settled is False:
            query = query.where(AgencyCommissionEntry.settlement_id.is_(None))
        total = int((await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one())
        rows = (await self.db.execute(query.order_by(AgencyCommissionEntry.occurred_at.desc(), AgencyCommissionEntry.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        return paginated_response(rows, total, page, page_size)

    async def summary(self, agency_id: int) -> dict[str, Any]:
        await self._agency(agency_id)
        async def total(where: Any) -> Decimal:
            value = (await self.db.execute(select(func.coalesce(func.sum(AgencyCommissionEntry.amount), 0)).where(AgencyCommissionEntry.agency_id == agency_id, where))).scalar_one()
            return Decimal(str(value or 0)).quantize(CENT)
        accrued = await total(AgencyCommissionEntry.kind == "accrual")
        refunded = await total(AgencyCommissionEntry.kind == "refund")
        settled = await total(AgencyCommissionEntry.settlement_id.is_not(None))
        pending = await total(AgencyCommissionEntry.settlement_id.is_(None))
        return {"pending_amount": pending, "settled_amount": settled, "accrued_amount": accrued, "refunded_amount": refunded}

    async def _preview(self, agency_id: int, month: str, *, lock: bool = False) -> tuple[AgencyCommissionSettlement | None, list[AgencyCommissionEntry], Decimal, str]:
        end = _month_end(month)
        await self._agency(agency_id)
        settlement_query = select(AgencyCommissionSettlement).where(AgencyCommissionSettlement.agency_id == agency_id, AgencyCommissionSettlement.month == month)
        entries_query = select(AgencyCommissionEntry).where(AgencyCommissionEntry.agency_id == agency_id, AgencyCommissionEntry.settlement_id.is_(None), AgencyCommissionEntry.occurred_at <= end).order_by(AgencyCommissionEntry.id)
        if lock:
            # Use current reads after the agency lock, including on databases
            # whose default isolation level preserves an earlier read snapshot.
            settlement_query = settlement_query.with_for_update().execution_options(populate_existing=True)
            entries_query = entries_query.with_for_update().execution_options(populate_existing=True)
        existing = (await self.db.execute(settlement_query)).scalar_one_or_none()
        entries = (await self.db.execute(entries_query)).scalars().all()
        digest = hashlib.sha256(json.dumps([(row.id, str(row.amount)) for row in entries], separators=(",", ":")).encode()).hexdigest()
        amount = sum((Decimal(str(row.amount)) for row in entries), Decimal("0")).quantize(CENT)
        return existing, entries, amount, digest

    async def settlement_preview(self, agency_id: int, month: str) -> dict[str, Any]:
        self._owner()
        existing, entries, amount, digest = await self._preview(agency_id, month)
        return {"agency_id": agency_id, "month": month, "amount": max(amount, Decimal("0.00")), "count": len(entries), "revision": digest, "existing_settlement": existing}

    async def settlements(self, agency_id: int, page: int, page_size: int) -> dict[str, Any]:
        await self._agency(agency_id)
        query = select(AgencyCommissionSettlement).where(AgencyCommissionSettlement.agency_id == agency_id)
        total = int((await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one())
        rows = (await self.db.execute(query.order_by(AgencyCommissionSettlement.month.desc(), AgencyCommissionSettlement.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        return paginated_response(rows, total, page, page_size)

    async def confirm_settlement(self, agency_id: int, payload: CommissionSettlementConfirm) -> AgencyCommissionSettlement:
        self._owner()
        _month_end(payload.month)
        await self._agency(agency_id, lock=True)
        existing, entries, amount, digest = await self._preview(agency_id, payload.month, lock=True)
        if existing:
            raise HTTPException(409, "该月份已确认线下结算，不能重复确认")
        if digest != payload.expected_revision:
            raise HTTPException(409, "待结算记录发生变化，请重新预览")
        if amount <= 0 or not entries:
            raise HTTPException(409, "本月没有可确认的正向佣金")
        settlement = AgencyCommissionSettlement(agency_id=agency_id, month=payload.month, amount=amount, count=len(entries), revision=digest, note=payload.note, confirmed_by_staff_id=self.actor["staff_id"])
        try:
            self.db.add(settlement)
            await self.db.flush()
            for row in entries:
                row.settlement_id = settlement.id
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise HTTPException(409, "该月份已被其他操作确认，请刷新") from error
        await self.db.refresh(settlement)
        return settlement
