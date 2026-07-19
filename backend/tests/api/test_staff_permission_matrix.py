import pytest

from models import AuthCode, AuthSeat, Device, StaffRole


@pytest.mark.asyncio
async def test_operator_announcements_read_only_and_control_modules_blocked(
    client, staff_headers_factory
):
    headers = await staff_headers_factory(StaffRole.OPERATOR, "matrix-operator")
    assert (await client.get("/api/announcements", headers=headers)).status_code == 200
    denied = await client.post(
        "/api/announcements",
        headers=headers,
        json={"title": "运营越权", "content": "不应创建"},
    )
    assert denied.status_code == 403
    assert (await client.get("/api/settings", headers=headers)).status_code == 403
    assert (await client.get("/api/updates/releases", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_support_can_manage_announcements(client, staff_headers_factory):
    headers = await staff_headers_factory(StaffRole.SUPPORT, "matrix-support")
    created = await client.post(
        "/api/announcements",
        headers=headers,
        json={"title": "客服公告", "content": "内部测试公告"},
    )
    assert created.status_code == 200
    announcement_id = created.json()["data"]["id"]
    updated = await client.put(
        f"/api/announcements/{announcement_id}",
        headers=headers,
        json={"content": "内部测试公告已更新"},
    )
    assert updated.status_code == 200


@pytest.mark.asyncio
async def test_support_can_manage_rules_support(client, staff_headers_factory):
    headers = await staff_headers_factory(StaffRole.SUPPORT, "rules-support")
    updated = await client.put(
        "/api/ai-chat/admin/config",
        headers=headers,
        json={"welcome_message": "规则客服内部验证"},
    )
    assert updated.status_code == 200
    assert (await client.get("/api/ai-chat/admin/config", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_support_device_unbind_requires_reason(
    client, db_session, staff_headers_factory
):
    code = AuthCode(code="MATRIX-DEVICE", status="active")
    db_session.add(code)
    await db_session.flush()
    device = Device(auth_code_id=code.id, device_id="MATRIX-DEVICE-ID", device_name="客服解绑设备")
    seat = AuthSeat(
        auth_code_id=code.id,
        device_id=device.device_id,
        device_name=device.device_name,
        seat_no=1,
        status="active",
    )
    db_session.add_all([device, seat])
    await db_session.commit()
    await db_session.refresh(device)
    headers = await staff_headers_factory(StaffRole.SUPPORT, "device-support")

    missing_reason = await client.post(
        f"/api/devices/unbind?device_id={device.id}",
        headers=headers,
    )
    assert missing_reason.status_code == 422
    success = await client.post(
        f"/api/devices/unbind?device_id={device.id}&reason=客户确认解绑",
        headers=headers,
    )
    assert success.status_code == 200


@pytest.mark.asyncio
async def test_operator_can_update_and_delete_auth_code(client, db_session, staff_headers_factory):
    code = AuthCode(code="MATRIX-AUTH-CODE", status="unused")
    db_session.add(code)
    await db_session.commit()
    headers = await staff_headers_factory(StaffRole.OPERATOR, "authcode-operator")
    updated = await client.put(
        f"/api/auth-codes/{code.id}",
        headers=headers,
        json={"status": "frozen"},
    )
    assert updated.status_code == 200
    response = await client.delete(f"/api/auth-codes/{code.id}", headers=headers)
    assert response.status_code == 200
