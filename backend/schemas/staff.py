"""Request and response schemas for fixed-role staff accounts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.response import APIResponse

StaffRoleValue = Literal["super_admin", "operator", "support"]
StaffStatusValue = Literal["active", "disabled"]


class StaffLogin(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class StaffAccountCreate(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_.-]{2,49}$")
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=10, max_length=128)
    role: StaffRoleValue

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return value.strip()


class StaffAccountUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    role: StaffRoleValue | None = None
    status: StaffStatusValue | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class StaffPasswordReset(BaseModel):
    new_password: str = Field(min_length=10, max_length=128)


class StaffPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class StaffAccountResponse(BaseModel):
    id: int
    username: str
    display_name: str
    role: StaffRoleValue
    status: StaffStatusValue
    force_password_reset: bool
    last_login_at: datetime | None = None
    created_by_staff_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class StaffContextResponse(BaseModel):
    staff_id: int
    user_id: int
    username: str
    name: str
    display_name: str
    role: StaffRoleValue
    status: StaffStatusValue
    token_version: int
    force_password_reset: bool
    auth_code_id: None = None
    device_id: None = None


class StaffSessionResponse(StaffContextResponse):
    token: str


class StaffSessionEnvelope(APIResponse[StaffSessionResponse]):
    pass


class StaffMeEnvelope(APIResponse[StaffContextResponse]):
    pass


class StaffAccountEnvelope(APIResponse[StaffAccountResponse]):
    pass


class StaffAccountListEnvelope(APIResponse[list[StaffAccountResponse]]):
    pass


class StaffOperationEnvelope(APIResponse[None]):
    pass
