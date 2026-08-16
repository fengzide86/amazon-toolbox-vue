from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from core.response import APIResponse


class UpdateFileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    size: int
    sha512: str | None = None


class UpdateReleaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str
    status: str
    files: list[UpdateFileResponse]
    manifest: dict[str, object] | None = None
    staged_at: str | None = None
    published_at: str | None = None
    is_latest: bool | None = None


UpdateReleaseEnvelope = APIResponse[UpdateReleaseResponse]
UpdateReleaseListResponse = APIResponse[list[UpdateReleaseResponse]]
UpdateFileListResponse = APIResponse[list[UpdateFileResponse]]
UpdateDeleteResponse = APIResponse[None]
