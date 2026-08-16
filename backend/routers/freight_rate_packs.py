"""Freight-rate draft, publish, artifact and rollback endpoints."""
from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, JsonValue
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_user
from core.response import success_response
from database import get_db
from services.freight_rate_service import (
    canonical_pack,
    create_rate_draft,
    current_rate_release,
    load_rate_releases,
    public_release,
    publish_rate_release,
    rollback_rate_releases,
    save_rate_releases,
)

router = APIRouter()
ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


class FreightRateManifestResponse(BaseModel):
    """Integrity metadata attached to a versioned freight-rate artifact."""

    model_config = ConfigDict(extra="allow")

    schemaVersion: int
    resourceType: str
    packId: JsonValue
    version: JsonValue
    artifactSha256: str
    artifactUrl: str


class FreightRateReleaseResponse(BaseModel):
    """Public release metadata; the potentially large rate pack is excluded."""

    model_config = ConfigDict(extra="allow")

    pack_id: JsonValue
    version: JsonValue
    name: JsonValue
    status: str
    created_at: str
    source_file_name: JsonValue | None = None
    source_hash: JsonValue | None = None
    manifest: FreightRateManifestResponse
    signature: str | None = None
    signing_key_id: str | None = None
    published_at: str | None = None


class FreightRateReleaseEnvelope(BaseModel):
    success: Literal[True]
    message: str
    data: FreightRateReleaseResponse


class FreightRateReleaseListEnvelope(BaseModel):
    success: Literal[True]
    message: str
    data: list[FreightRateReleaseResponse]


@router.get("", response_model=FreightRateReleaseListEnvelope)
async def list_rate_releases(
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    return success_response([public_release(item) for item in await load_rate_releases(db)])


@router.post("/drafts", response_model=FreightRateReleaseEnvelope)
async def create_draft(
    payload: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    pack = payload.get("pack")
    try:
        draft = create_rate_draft(pack, payload.get("source_file_name"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not ID_PATTERN.fullmatch(str(draft["pack_id"])) or not ID_PATTERN.fullmatch(str(draft["version"])):
        raise HTTPException(status_code=400, detail="pack_id/version 只能包含字母、数字、点、下划线和连字符")
    releases = await load_rate_releases(db)
    if any(item.get("pack_id") == draft["pack_id"] and item.get("version") == draft["version"] for item in releases):
        raise HTTPException(status_code=409, detail="该费率版本已存在")
    releases.append(draft)
    await save_rate_releases(db, releases)
    return success_response(public_release(draft), "费率草稿已保存")


@router.post("/{pack_id}/{version}/publish", response_model=FreightRateReleaseEnvelope)
async def publish_rate_pack(
    pack_id: str,
    version: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    releases = await load_rate_releases(db)
    try:
        target = publish_rate_release(releases, pack_id, version)
    except ValueError as error:
        status = 503 if "TOOL_SIGNING_PRIVATE_KEY_B64" in str(error) else 404
        raise HTTPException(status_code=status, detail=str(error)) from error
    await save_rate_releases(db, releases)
    return success_response(public_release(target), "费率版本已签名发布")


@router.post("/{pack_id}/rollback", response_model=FreightRateReleaseEnvelope)
async def rollback_rate_pack(
    pack_id: str,
    payload: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    target_version = str(payload.get("target_version") or "")
    if not target_version:
        raise HTTPException(status_code=400, detail="缺少 target_version")
    releases = await load_rate_releases(db)
    try:
        target = rollback_rate_releases(releases, pack_id, target_version)
    except ValueError as error:
        status = 503 if "TOOL_SIGNING_PRIVATE_KEY_B64" in str(error) else 404
        raise HTTPException(status_code=status, detail=str(error)) from error
    await save_rate_releases(db, releases)
    return success_response(public_release(target), "费率版本已回退并重新签名")


@router.get("/current", response_model=FreightRateReleaseEnvelope)
async def get_current_rate_pack(
    pack_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    release = current_rate_release(await load_rate_releases(db), pack_id)
    if not release:
        raise HTTPException(status_code=404, detail="当前没有已发布费率包")
    return success_response(public_release(release))


@router.get(
    "/{pack_id}/{version}/artifact",
    response_model=None,
    responses={
        200: {
            "description": "Canonical signed freight-rate pack artifact",
            "content": {"application/json": {"schema": {"type": "string", "format": "binary"}}},
        },
    },
)
async def get_rate_artifact(
    pack_id: str,
    version: str,
    db: AsyncSession = Depends(get_db),
    _user: dict[str, Any] = Depends(get_current_user),
) -> Response:
    release = next((
        item for item in await load_rate_releases(db)
        if item.get("pack_id") == pack_id and item.get("version") == version and item.get("status") == "published"
    ), None)
    if not release:
        raise HTTPException(status_code=404, detail="费率包不存在或尚未发布")
    return Response(
        content=canonical_pack(release["pack"]),
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=300, immutable",
            "ETag": f'"{release["manifest"]["artifactSha256"]}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
