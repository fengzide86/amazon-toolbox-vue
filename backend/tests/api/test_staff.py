import pytest
from sqlalchemy import select

from core.security import hash_password
from models import StaffRole, StaffStatus, StaffUser
from services.staff_service import create_staff_access_token


@pytest.mark.asyncio
async def test_staff_login_and_me(client, db_session):
    staff = StaffUser(
        username="operator1",
        display_name="运营一号",
        password_hash=hash_password("Operator-123"),
        role=StaffRole.OPERATOR,
        status=StaffStatus.ACTIVE,
        token_version=1,
        force_password_reset=False,
    )
    db_session.add(staff)
    await db_session.commit()

    response = await client.post(
        "/api/staff/auth/login",
        json={"username": "OPERATOR1", "password": "Operator-123"},
    )
    assert response.status_code == 200
    token = response.json()["data"]["token"]
    me = await client.get(
        "/api/staff/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["data"]["role"] == StaffRole.OPERATOR


@pytest.mark.asyncio
async def test_only_super_admin_can_manage_accounts(
    client, auth_headers, staff_headers_factory
):
    support_headers = await staff_headers_factory(StaffRole.SUPPORT, "support1")
    denied = await client.get("/api/staff/accounts", headers=support_headers)
    assert denied.status_code == 403

    created = await client.post(
        "/api/staff/accounts",
        headers=auth_headers,
        json={
            "username": "operator2",
            "display_name": "运营二号",
            "password": "Temporary-123",
            "role": StaffRole.OPERATOR,
        },
    )
    assert created.status_code == 201
    assert created.json()["data"]["force_password_reset"] is True


@pytest.mark.asyncio
async def test_forced_password_change_rotates_token(client, auth_headers):
    created = await client.post(
        "/api/staff/accounts",
        headers=auth_headers,
        json={
            "username": "support2",
            "display_name": "客服二号",
            "password": "Temporary-123",
            "role": StaffRole.SUPPORT,
        },
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/staff/auth/login",
        json={"username": "support2", "password": "Temporary-123"},
    )
    old_token = login.json()["data"]["token"]
    old_headers = {"Authorization": f"Bearer {old_token}"}
    blocked = await client.get("/api/orders", headers=old_headers)
    assert blocked.status_code == 403

    changed = await client.post(
        "/api/staff/auth/change-password",
        headers=old_headers,
        json={"current_password": "Temporary-123", "new_password": "Permanent-456"},
    )
    assert changed.status_code == 200
    new_headers = {"Authorization": f"Bearer {changed.json()['data']['token']}"}
    assert (await client.get("/api/orders", headers=new_headers)).status_code == 200
    assert (await client.get("/api/orders", headers=old_headers)).status_code == 401


@pytest.mark.asyncio
async def test_cannot_disable_last_active_super_admin(client, auth_headers, db_session):
    result = await db_session.execute(select(StaffUser).where(StaffUser.username == "admin"))
    admin = result.scalar_one()
    response = await client.patch(
        f"/api/staff/accounts/{admin.id}",
        headers=auth_headers,
        json={"status": StaffStatus.DISABLED},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_role_change_invalidates_existing_token(client, auth_headers, db_session):
    target = StaffUser(
        username="rolechange",
        display_name="变更角色",
        password_hash=hash_password("Role-change-123"),
        role=StaffRole.OPERATOR,
        status=StaffStatus.ACTIVE,
        token_version=1,
        force_password_reset=False,
    )
    db_session.add(target)
    await db_session.commit()
    await db_session.refresh(target)
    old_headers = {"Authorization": f"Bearer {create_staff_access_token(target)}"}

    response = await client.patch(
        f"/api/staff/accounts/{target.id}",
        headers=auth_headers,
        json={"role": StaffRole.SUPPORT},
    )
    assert response.status_code == 200
    assert (await client.get("/api/orders", headers=old_headers)).status_code == 401
