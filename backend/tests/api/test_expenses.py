from __future__ import annotations

from datetime import date, timedelta

import pytest

from domains.commerce import validate_expense_attachment_storage
from models import ExpenseRenewal, StaffRole


async def _category_id(client, headers, code: str = "development") -> int:
    response = await client.get("/api/expenses/categories", headers=headers)
    assert response.status_code == 200, response.text
    return next(item["id"] for item in response.json()["data"] if item["code"] == code)


@pytest.mark.asyncio
async def test_expense_crud_summary_void_and_export(client, auth_headers):
    category_id = await _category_id(client, auth_headers)
    today = date.today()
    created = await client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "amount": "128.50",
            "expense_date": today.isoformat(),
            "title": "云服务器续费",
            "category_id": category_id,
            "payee": "云服务商",
            "note": "生产环境",
        },
    )
    assert created.status_code == 201, created.text
    expense_id = created.json()["data"]["id"]
    assert created.json()["data"]["category_name"] == "开发"

    summary = await client.get(f"/api/expenses/summary?month={today:%Y-%m}", headers=auth_headers)
    assert summary.status_code == 200
    assert summary.json()["data"]["total"] == "128.50"
    assert summary.json()["data"]["count"] == 1

    updated = await client.patch(
        f"/api/expenses/{expense_id}",
        headers=auth_headers,
        json={"amount": "138.50", "title": "云服务器续费（调整）"},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["amount"] == "138.50"

    exported = await client.get(f"/api/expenses/export?month={today:%Y-%m}", headers=auth_headers)
    assert exported.status_code == 200
    assert "云服务器续费（调整）" in exported.content.decode("utf-8-sig")

    voided = await client.post(
        f"/api/expenses/{expense_id}/void",
        headers=auth_headers,
        json={"reason": "重复记账"},
    )
    assert voided.status_code == 200
    assert voided.json()["data"]["status"] == "voided"
    summary_after = await client.get(f"/api/expenses/summary?month={today:%Y-%m}", headers=auth_headers)
    assert summary_after.json()["data"]["total"] == "0.00"
    assert summary_after.json()["data"]["count"] == 0


@pytest.mark.asyncio
async def test_categories_are_customizable_only_by_super_admin(client, auth_headers, staff_headers_factory):
    created = await client.post(
        "/api/expenses/categories",
        headers=auth_headers,
        json={"name": "招聘", "sort_order": 80},
    )
    assert created.status_code == 201
    category_id = created.json()["data"]["id"]
    expense = await client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "amount": "50.00",
            "expense_date": date.today().isoformat(),
            "title": "历史分类支出",
            "category_id": category_id,
        },
    )
    assert expense.status_code == 201
    archived = await client.patch(
        f"/api/expenses/categories/{category_id}",
        headers=auth_headers,
        json={"status": "archived"},
    )
    assert archived.status_code == 200
    assert archived.json()["data"]["status"] == "archived"
    history = await client.get(f"/api/expenses?category_id={category_id}", headers=auth_headers)
    assert history.json()["data"][0]["category_name"] == "招聘"
    blocked = await client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "amount": "10.00",
            "expense_date": date.today().isoformat(),
            "title": "停用分类不应继续记账",
            "category_id": category_id,
        },
    )
    assert blocked.status_code == 409

    operator = await staff_headers_factory(StaffRole.OPERATOR, "expense-operator-category")
    denied = await client.post(
        "/api/expenses/categories",
        headers=operator,
        json={"name": "运营自建"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_renewal_confirm_skip_and_month_end_anchor(client, auth_headers):
    category_id = await _category_id(client, auth_headers, "tool_membership")
    created = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": "设计工具会员",
            "vendor": "Design SaaS",
            "default_amount": "99.00",
            "category_id": category_id,
            "cycle": "monthly",
            "next_due_on": "2027-01-31",
            "reminder_days": 7,
        },
    )
    assert created.status_code == 201, created.text
    renewal_id = created.json()["data"]["id"]

    confirmed = await client.post(
        f"/api/expenses/renewals/{renewal_id}/confirm",
        headers=auth_headers,
        json={"due_on": "2027-01-31", "amount": "109.00", "expense_date": date.today().isoformat()},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["expense"]["amount"] == "109.00"
    assert confirmed.json()["data"]["renewal"]["next_due_on"] == "2027-02-28"

    skipped = await client.post(
        f"/api/expenses/renewals/{renewal_id}/skip",
        headers=auth_headers,
        json={"due_on": "2027-02-28", "note": "二月暂停使用"},
    )
    assert skipped.status_code == 200
    assert skipped.json()["data"]["next_due_on"] == "2027-03-31"
    detail = await client.get(f"/api/expenses/renewals/{renewal_id}", headers=auth_headers)
    assert [item["status"] for item in detail.json()["data"]["occurrences"]] == ["skipped", "paid"]


@pytest.mark.asyncio
async def test_renewal_transitions_and_duplicate_cycle_protection(client, auth_headers):
    category_id = await _category_id(client, auth_headers, "server_cloud")
    next_due = date.today() + timedelta(days=3)
    created = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": "对象存储",
            "default_amount": "45.00",
            "category_id": category_id,
            "cycle": "quarterly",
            "next_due_on": next_due.isoformat(),
            "reminder_days": 7,
        },
    )
    renewal_id = created.json()["data"]["id"]
    summary = await client.get("/api/expenses/summary", headers=auth_headers)
    assert summary.json()["data"]["upcoming_renewals"] == 1
    action_center = await client.get("/api/admin/action-center", headers=auth_headers)
    assert action_center.status_code == 200
    assert action_center.json()["data"]["summary"]["expense_renewals_due"] == 1
    assert action_center.json()["data"]["expense_renewals"][0]["id"] == renewal_id

    paused = await client.post(f"/api/expenses/renewals/{renewal_id}/pause", headers=auth_headers)
    assert paused.json()["data"]["status"] == "paused"
    resumed_due = date.today() + timedelta(days=5)
    resumed = await client.post(
        f"/api/expenses/renewals/{renewal_id}/resume",
        headers=auth_headers,
        json={"next_due_on": resumed_due.isoformat()},
    )
    assert resumed.json()["data"]["next_due_on"] == resumed_due.isoformat()
    ended = await client.post(f"/api/expenses/renewals/{renewal_id}/end", headers=auth_headers)
    assert ended.json()["data"]["status"] == "ended"
    denied = await client.post(
        f"/api/expenses/renewals/{renewal_id}/confirm",
        headers=auth_headers,
        json={"due_on": resumed_due.isoformat()},
    )
    assert denied.status_code == 409


@pytest.mark.asyncio
async def test_renewal_reminder_window_is_applied_consistently(client, auth_headers):
    category_id = await _category_id(client, auth_headers, "tool_membership")
    today = date.today()
    included = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": "提前十四天提醒",
            "default_amount": "20.00",
            "category_id": category_id,
            "cycle": "monthly",
            "next_due_on": (today + timedelta(days=10)).isoformat(),
            "reminder_days": 14,
        },
    )
    excluded = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": "只提前三天提醒",
            "default_amount": "30.00",
            "category_id": category_id,
            "cycle": "monthly",
            "next_due_on": (today + timedelta(days=5)).isoformat(),
            "reminder_days": 3,
        },
    )
    assert included.status_code == 201
    assert excluded.status_code == 201

    summary = await client.get("/api/expenses/summary", headers=auth_headers)
    action_center = await client.get("/api/admin/action-center", headers=auth_headers)
    upcoming = await client.get(
        "/api/expenses/renewals?due_state=upcoming&page_size=100",
        headers=auth_headers,
    )

    assert summary.json()["data"]["upcoming_renewals"] == 1
    assert action_center.json()["data"]["summary"]["expense_renewals_due"] == 1
    assert [item["id"] for item in action_center.json()["data"]["expense_renewals"]] == [
        included.json()["data"]["id"]
    ]
    assert [item["id"] for item in upcoming.json()["data"]] == [included.json()["data"]["id"]]


@pytest.mark.asyncio
async def test_action_center_summary_is_not_capped_by_preview_limit(
    client, auth_headers, db_session
):
    category_id = await _category_id(client, auth_headers, "tool_membership")
    due_on = date.today() + timedelta(days=1)
    db_session.add_all([
        ExpenseRenewal(
            name=f"批量提醒 {index}",
            default_amount="10.00",
            category_id=category_id,
            cycle="monthly",
            next_due_on=due_on,
            reminder_days=7,
            anchor_day=due_on.day,
            anchor_month_end=False,
            status="active",
        )
        for index in range(25)
    ])
    await db_session.commit()

    response = await client.get("/api/admin/action-center", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["data"]["summary"]["expense_renewals_due"] == 25
    assert len(response.json()["data"]["expense_renewals"]) == 20


@pytest.mark.asyncio
async def test_voided_renewal_expense_can_be_reconfirmed_without_advancing_twice(
    client, auth_headers
):
    category_id = await _category_id(client, auth_headers, "tool_membership")
    due_on = date.today()
    created = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": "可冲正会员",
            "default_amount": "99.00",
            "category_id": category_id,
            "cycle": "monthly",
            "next_due_on": due_on.isoformat(),
            "reminder_days": 7,
        },
    )
    renewal_id = created.json()["data"]["id"]
    first = await client.post(
        f"/api/expenses/renewals/{renewal_id}/confirm",
        headers=auth_headers,
        json={"due_on": due_on.isoformat(), "amount": "99.00"},
    )
    first_expense_id = first.json()["data"]["expense"]["id"]
    next_due_on = first.json()["data"]["renewal"]["next_due_on"]

    voided = await client.post(
        f"/api/expenses/{first_expense_id}/void",
        headers=auth_headers,
        json={"reason": "金额录入错误"},
    )
    detail = await client.get(f"/api/expenses/renewals/{renewal_id}", headers=auth_headers)
    assert voided.status_code == 200
    assert detail.json()["data"]["occurrences"][0]["status"] == "reversed"

    reconfirmed = await client.post(
        f"/api/expenses/renewals/{renewal_id}/confirm",
        headers=auth_headers,
        json={"due_on": due_on.isoformat(), "amount": "109.00"},
    )
    body = reconfirmed.json()["data"]
    assert reconfirmed.status_code == 200, reconfirmed.text
    assert body["expense"]["id"] != first_expense_id
    assert body["expense"]["amount"] == "109.00"
    assert body["renewal"]["next_due_on"] == next_due_on
    assert body["renewal"]["occurrences"][0]["status"] == "paid"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("cycle", "due_on", "expected"),
    [
        ("quarterly", "2027-11-30", "2028-02-29"),
        ("semiannual", "2027-08-31", "2028-02-29"),
        ("annual", "2028-02-29", "2029-02-28"),
    ],
)
async def test_renewal_cycles_keep_month_end_alignment(client, auth_headers, cycle, due_on, expected):
    category_id = await _category_id(client, auth_headers, "tool_membership")
    created = await client.post(
        "/api/expenses/renewals",
        headers=auth_headers,
        json={
            "name": f"{cycle} 周期项目",
            "default_amount": "20.00",
            "category_id": category_id,
            "cycle": cycle,
            "next_due_on": due_on,
            "reminder_days": 7,
        },
    )
    renewal_id = created.json()["data"]["id"]
    skipped = await client.post(
        f"/api/expenses/renewals/{renewal_id}/skip",
        headers=auth_headers,
        json={"due_on": due_on},
    )
    assert skipped.status_code == 200
    assert skipped.json()["data"]["next_due_on"] == expected


@pytest.mark.asyncio
async def test_expense_attachment_upload_download_and_delete(client, auth_headers, monkeypatch, tmp_path):
    monkeypatch.setenv("EXPENSE_ATTACHMENT_DIR", str(tmp_path))
    category_id = await _category_id(client, auth_headers)
    created = await client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "amount": "20.00",
            "expense_date": date.today().isoformat(),
            "title": "测试凭证",
            "category_id": category_id,
        },
    )
    expense_id = created.json()["data"]["id"]
    uploaded = await client.post(
        f"/api/expenses/{expense_id}/attachments",
        headers=auth_headers,
        files={"file": ("receipt.png", b"png-test-content", "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["data"]["id"]
    downloaded = await client.get(
        f"/api/expenses/{expense_id}/attachments/{attachment_id}",
        headers=auth_headers,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"png-test-content"
    deleted = await client.delete(
        f"/api/expenses/{expense_id}/attachments/{attachment_id}",
        headers=auth_headers,
    )
    assert deleted.status_code == 200

    invalid = await client.post(
        f"/api/expenses/{expense_id}/attachments",
        headers=auth_headers,
        files={"file": ("receipt.exe", b"not-allowed", "application/octet-stream")},
    )
    assert invalid.status_code == 422

    oversized = await client.post(
        f"/api/expenses/{expense_id}/attachments",
        headers=auth_headers,
        files={"file": ("large.pdf", b"x" * (10 * 1024 * 1024 + 1), "application/pdf")},
    )
    assert oversized.status_code == 422

    for index in range(5):
        response = await client.post(
            f"/api/expenses/{expense_id}/attachments",
            headers=auth_headers,
            files={"file": (f"receipt-{index}.png", b"png", "image/png")},
        )
        assert response.status_code == 201
    sixth = await client.post(
        f"/api/expenses/{expense_id}/attachments",
        headers=auth_headers,
        files={"file": ("receipt-6.png", b"png", "image/png")},
    )
    assert sixth.status_code == 409


def test_attachment_storage_defaults_to_runtime_directory(monkeypatch, tmp_path):
    monkeypatch.delenv("EXPENSE_ATTACHMENT_DIR", raising=False)
    monkeypatch.setenv("TOOLBOX_RUNTIME_DIR", str(tmp_path))

    root = validate_expense_attachment_storage()

    assert root == (tmp_path / "expense-attachments").resolve()
    assert root.is_dir()
    assert not list(root.glob(".write-probe-*"))


@pytest.mark.asyncio
async def test_expense_permissions(client, staff_headers_factory):
    operator = await staff_headers_factory(StaffRole.OPERATOR, "expense-operator")
    support = await staff_headers_factory(StaffRole.SUPPORT, "expense-support")
    assert (await client.get("/api/expenses", headers=operator)).status_code == 200
    assert (await client.get("/api/expenses", headers=support)).status_code == 403
    assert (await client.get("/api/expenses")).status_code == 401
