"""安全的桌面更新发布路由。"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.dependencies import require_super_admin
from core.response import success_response
from database import get_db
from domains.updates.service import UpdateReleaseService, get_update_releases_dir

router = APIRouter()
UPDATES_DIR = str(get_update_releases_dir())
release_service = UpdateReleaseService(UPDATES_DIR)


def get_static_files() -> StaticFiles:
    return StaticFiles(directory=UPDATES_DIR)


def _release_snapshot(release: dict[str, object] | None) -> dict[str, object] | None:
    if release is None:
        return None
    return {
        "version": release.get("version"),
        "status": release.get("status"),
        "is_latest": release.get("is_latest"),
        "files": release.get("files", []),
    }


def _release_before(version: str) -> dict[str, object] | None:
    return next(
        (release for release in release_service.list_releases() if release.get("version") == version),
        None,
    )


def _audit_detail(
    admin: dict[str, object],
    *,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
) -> dict[str, object]:
    return {
        "role": admin.get("role"),
        "before": _release_snapshot(before),
        "after": _release_snapshot(after),
        "reason": None,
    }


@router.post("/releases/stage")
async def stage_release(
    request: Request,
    version: str | None = Form(None),
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    admin: dict[str, object] = Depends(require_super_admin),
) -> object:
    release = await release_service.stage(version, files)
    await log_admin_action(
        db,
        user_id=admin.get("staff_id"),
        user_name=admin.get("username", "admin"),
        action="stage_update_release",
        target_type="update_release",
        target_id=str(release["version"]),
        detail=_audit_detail(admin, before=None, after=release),
        request=request,
    )
    await db.commit()
    return success_response(data=release, message="更新版本已暂存并校验")


@router.post("/releases/{version}/publish")
async def publish_release(
    version: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict[str, object] = Depends(require_super_admin),
) -> object:
    before = _release_before(version)
    release = release_service.publish(version)
    await log_admin_action(
        db,
        user_id=admin.get("staff_id"),
        user_name=admin.get("username", "admin"),
        action="publish_update_release",
        target_type="update_release",
        target_id=version,
        detail=_audit_detail(admin, before=before, after=release),
        request=request,
    )
    await db.commit()
    return success_response(data=release, message="更新版本已原子发布")


@router.get("/releases")
async def list_releases(_admin: dict[str, object] = Depends(require_super_admin)) -> object:
    return success_response(data=release_service.list_releases())


@router.delete("/releases/{version}/staged")
async def delete_staged_release(
    version: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict[str, object] = Depends(require_super_admin),
) -> object:
    before = _release_before(version)
    release_service.delete_staged(version)
    await log_admin_action(
        db,
        user_id=admin.get("staff_id"),
        user_name=admin.get("username", "admin"),
        action="delete_staged_update_release",
        target_type="update_release",
        target_id=version,
        detail=_audit_detail(admin, before=before, after=None),
        request=request,
    )
    await db.commit()
    return success_response(message="暂存版本已删除")


@router.get("/list")
async def list_updates(_admin: dict[str, object] = Depends(require_super_admin)) -> object:
    files = [
        {"name": name, "size": os.path.getsize(os.path.join(UPDATES_DIR, name))}
        for name in os.listdir(UPDATES_DIR)
        if os.path.isfile(os.path.join(UPDATES_DIR, name))
    ]
    return success_response(data=files)
