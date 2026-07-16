"""安全的桌面更新发布路由。"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.staticfiles import StaticFiles

from core.dependencies import get_current_admin
from core.deprecation import log_deprecated_api_call
from core.response import success_response
from domains.updates.service import UpdateReleaseService

router = APIRouter()
UPDATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "updates")
release_service = UpdateReleaseService(UPDATES_DIR)


def get_static_files() -> StaticFiles:
    return StaticFiles(directory=UPDATES_DIR)


@router.post("/releases/stage")
async def stage_release(
    version: str | None = Form(None),
    files: list[UploadFile] = File(...),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    return success_response(data=await release_service.stage(version, files), message="更新版本已暂存并校验")


@router.post("/releases/{version}/publish")
async def publish_release(version: str, _admin: dict[str, object] = Depends(get_current_admin)) -> object:
    return success_response(data=release_service.publish(version), message="更新版本已原子发布")


@router.get("/releases")
async def list_releases(_admin: dict[str, object] = Depends(get_current_admin)) -> object:
    return success_response(data=release_service.list_releases())


@router.delete("/releases/{version}/staged")
async def delete_staged_release(version: str, _admin: dict[str, object] = Depends(get_current_admin)) -> object:
    release_service.delete_staged(version)
    return success_response(message="暂存版本已删除")


@router.post("/upload")
async def upload_update(
    request: Request,
    file: UploadFile = File(...),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    """旧管理员客户端兼容入口；新界面不再使用。"""
    log_deprecated_api_call(request, "/api/updates/upload")
    return success_response(data=await release_service.legacy_upload(file))


@router.get("/list")
async def list_updates(_admin: dict[str, object] = Depends(get_current_admin)) -> object:
    files = [
        {"name": name, "size": os.path.getsize(os.path.join(UPDATES_DIR, name))}
        for name in os.listdir(UPDATES_DIR)
        if os.path.isfile(os.path.join(UPDATES_DIR, name))
    ]
    return success_response(data=files)
