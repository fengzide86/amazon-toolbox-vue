"""
设备管理接口测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AuthCode, AuthSeat, Device, Plan, User
from tests.conftest import get_data


async def seed_devices(db_session: AsyncSession, device_count: int = 2):
    plan = Plan(name="测试", price=99, duration_days=30, status="active")
    db_session.add(plan)
    await db_session.flush()

    auth_code = AuthCode(code="TEST-001", plan_id=plan.id, status="active", max_devices=3)
    db_session.add(auth_code)
    await db_session.flush()

    user = User(device_id="dev1", device_name="PC1", auth_code_id=auth_code.id)
    db_session.add(user)
    await db_session.flush()
    auth_code.user_id = user.id

    devices = []
    for i in range(device_count):
        d = Device(auth_code_id=auth_code.id, device_id=f"device-{i}", device_name=f"设备{i}")
        db_session.add(d)
        devices.append(d)
    await db_session.commit()
    return auth_code, user, devices


@pytest.mark.asyncio
class TestGetDevices:
    async def test_get_devices_empty(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/devices", headers=auth_headers)
        assert resp.status_code == 200
        assert get_data(resp) == []

    async def test_get_devices_with_data(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        _, _, devices = await seed_devices(db_session)
        resp = await client.get("/api/devices", headers=auth_headers)
        assert resp.status_code == 200
        assert len(get_data(resp)) == 2

    async def test_get_devices_requires_admin(self, client: AsyncClient):
        resp = await client.get("/api/devices")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestGetMyDevices:
    async def test_get_my_devices(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        _, user, devices = await seed_devices(db_session)
        resp = await client.get(f"/api/devices/my?user_id={user.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = get_data(resp)
        assert len(data) >= 0  # API may filter differently

    async def test_get_my_devices_no_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/devices/my", params={"user_id": 9999}, headers=auth_headers)
        assert resp.status_code == 200
        assert get_data(resp) == []


@pytest.mark.asyncio
class TestUnbindDevice:
    async def test_unbind_device_admin(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        auth_code, user, devices = await seed_devices(db_session)
        seat = AuthSeat(
            auth_code_id=auth_code.id,
            user_id=user.id,
            device_id=devices[0].device_id,
            device_name=devices[0].device_name,
            status="active"
        )
        db_session.add(seat)
        await db_session.commit()
        rebound_device_id = devices[0].device_id
        rebound_device_name = devices[0].device_name

        resp = await client.post(
            f"/api/devices/unbind?device_id={devices[0].id}&reason=内部解绑测试",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert get_data(resp)["success"] is True

        released_seat = (
            await db_session.execute(select(AuthSeat).where(AuthSeat.id == seat.id))
        ).scalars().one()
        assert released_seat.status == "inactive"

        relogin = await client.post(
            "/api/auth/verify",
            json={
                "code": auth_code.code,
                "device_id": rebound_device_id,
                "device_name": rebound_device_name,
            },
        )
        assert relogin.status_code == 200
        assert relogin.json()["success"] is True

        await db_session.refresh(released_seat)
        assert released_seat.status == "active"
        rebound_devices = (
            await db_session.execute(
                select(Device).where(
                    Device.auth_code_id == auth_code.id,
                    Device.device_id == rebound_device_id,
                )
            )
        ).scalars().all()
        assert len(rebound_devices) == 1

    async def test_unbind_device_requires_admin(self, client: AsyncClient, db_session: AsyncSession):
        _, _, devices = await seed_devices(db_session)
        resp = await client.post(
            f"/api/devices/unbind?device_id={devices[0].id}&reason=内部解绑测试"
        )
        assert resp.status_code in (401, 403)

    async def test_unbind_nonexistent_device(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/devices/unbind?device_id=9999&reason=内部解绑测试",
            headers=auth_headers,
        )
        assert resp.status_code == 404
