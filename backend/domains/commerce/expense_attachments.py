"""Persistent receipt and invoice attachment handling for company expenses."""

from __future__ import annotations

import hashlib
import os
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import Request, UploadFile
from sqlalchemy import func, select

from core.config import settings
from core.exceptions import ConflictException, NotFoundException, ValidationException
from models import ExpenseAttachment, ExpenseRecordStatus

from .expense_common import ExpenseServiceBase, actor_id

MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_ATTACHMENTS = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
}


def attachment_root() -> Path:
    """Resolve and create the configured persistent attachment directory."""
    configured = os.getenv("EXPENSE_ATTACHMENT_DIR", "").strip()
    if configured:
        root = Path(configured).expanduser().resolve()
    else:
        runtime_root = os.getenv("TOOLBOX_RUNTIME_DIR", "").strip()
        if runtime_root:
            root = (Path(runtime_root).expanduser() / "expense-attachments").resolve()
        elif settings.DB_TYPE == "sqlite":
            root = (Path(settings.DB_PATH).resolve().parent / "expense-attachments").resolve()
        else:
            raise RuntimeError(
                "未配置公账凭证持久目录：请设置 EXPENSE_ATTACHMENT_DIR 或 TOOLBOX_RUNTIME_DIR"
            )
    root.mkdir(parents=True, exist_ok=True)
    return root


def validate_expense_attachment_storage() -> Path:
    """Resolve the persistent attachment root and prove it is writable."""
    root = attachment_root()
    probe = root / f".write-probe-{uuid.uuid4().hex}"
    try:
        with probe.open("xb") as output:
            output.write(b"ok")
    except OSError as error:
        raise RuntimeError(f"公账凭证目录不可写: {root}") from error
    finally:
        probe.unlink(missing_ok=True)
    return root


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


class ExpenseAttachmentService(ExpenseServiceBase):
    """Write, resolve and remove persisted expense attachments."""

    async def add_attachment(
        self,
        expense_id: int,
        upload: UploadFile,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        # Locking the expense serializes the per-record count check for concurrent uploads.
        record = await self._expense(expense_id, lock=True)
        if record.status != ExpenseRecordStatus.ACTIVE:
            raise ConflictException("已作废的支出不能新增凭证")
        attachment_count = int(
            (
                await self.db.execute(
                    select(func.count(ExpenseAttachment.id)).where(
                        ExpenseAttachment.expense_id == expense_id
                    )
                )
            ).scalar()
            or 0
        )
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

        root = attachment_root()
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
                uploaded_by_staff_id=actor_id(actor),
            )
            self.db.add(attachment)
            await self.db.flush()
            await self._audit(
                "expense_attachment_add",
                "expense_attachment",
                attachment.id,
                actor,
                request,
                {"expense_id": expense_id, "name": safe_name},
            )
            await self.db.commit()
            return serialize_attachment(attachment)
        except Exception:
            target.unlink(missing_ok=True)
            raise

    async def attachment_file(
        self,
        expense_id: int,
        attachment_id: int,
    ) -> tuple[Path, ExpenseAttachment]:
        attachment = (
            await self.db.execute(
                select(ExpenseAttachment).where(
                    ExpenseAttachment.id == attachment_id,
                    ExpenseAttachment.expense_id == expense_id,
                )
            )
        ).scalar_one_or_none()
        if attachment is None:
            raise NotFoundException("支出凭证不存在")
        root = attachment_root()
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
        await self._audit(
            "expense_attachment_delete",
            "expense_attachment",
            attachment.id,
            actor,
            request,
            {"expense_id": expense_id, "name": attachment.original_name},
        )
        await self.db.commit()
        path.unlink(missing_ok=True)

    @staticmethod
    def serialize_attachment(attachment: ExpenseAttachment) -> dict[str, Any]:
        """Compatibility method retained for the original aggregate service."""
        return serialize_attachment(attachment)


__all__ = [
    "ALLOWED_ATTACHMENTS",
    "MAX_ATTACHMENT_BYTES",
    "MAX_ATTACHMENTS",
    "ExpenseAttachmentService",
    "attachment_root",
    "serialize_attachment",
    "validate_expense_attachment_storage",
]
