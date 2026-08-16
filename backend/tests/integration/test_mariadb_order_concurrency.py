import asyncio
import os
import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.security import hash_password
from database import Base, get_db
from main import app
from models import (
    AuditLog,
    AuthCode,
    AuthSeat,
    Device,
    ExpenseAttachment,
    ExpenseCategory,
    ExpenseRecord,
    ExpenseRenewal,
    ExpenseRenewalOccurrence,
    Order,
    Plan,
    ProfitRecord,
    StaffRole,
    StaffStatus,
    StaffUser,
    User,
)
from services.staff_service import create_staff_access_token


def _mariadb_test_url() -> str:
    raw_url = os.getenv("MARIADB_TEST_URL", "").strip()
    if not raw_url:
        if os.getenv("REQUIRE_MARIADB_TEST") == "1":
            pytest.fail("MARIADB_TEST_URL is required for this verification run")
        pytest.skip("MARIADB_TEST_URL is not configured; real row-lock test skipped")

    url = make_url(raw_url)
    if url.drivername in {"mysql", "mysql+pymysql", "mariadb", "mariadb+pymysql"}:
        url = url.set(drivername="mysql+aiomysql")
    if not url.drivername.startswith(("mysql+aiomysql", "mariadb+aiomysql")):
        pytest.fail("MARIADB_TEST_URL must use a real MariaDB/MySQL database with the aiomysql driver")
    return url.render_as_string(hide_password=False)


@pytest.mark.asyncio
async def test_twenty_concurrent_manual_paid_transitions_create_one_profit_record():
    engine = create_async_engine(
        _mariadb_test_url(),
        pool_size=20,
        max_overflow=5,
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:12]
    staff_id: int | None = None
    plan_id: int | None = None
    order_id: int | None = None

    async def override_get_db():
        async with sessions() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    await session.rollback()

    previous_override = app.dependency_overrides.get(get_db)
    try:
        async with engine.begin() as connection:
            assert connection.dialect.name in {"mysql", "mariadb"}
            await connection.run_sync(Base.metadata.create_all)

        async with sessions() as session:
            staff = StaffUser(
                username=f"concurrency-{suffix}",
                display_name="MariaDB concurrency test",
                password_hash=hash_password(f"Concurrency-{suffix}"),
                role=StaffRole.SUPER_ADMIN,
                status=StaffStatus.ACTIVE,
                token_version=1,
                force_password_reset=False,
            )
            plan = Plan(
                name=f"MariaDB concurrency plan {suffix}",
                price=Decimal("99.99"),
                duration_days=30,
                status="active",
                product_type="consumer",
            )
            session.add_all([staff, plan])
            await session.flush()
            order = Order(
                order_no=f"ORD-CONCURRENCY-{suffix}",
                plan_id=plan.id,
                plan_name_snapshot=plan.name,
                plan_price_snapshot=plan.price,
                plan_duration_days_snapshot=plan.duration_days,
                amount=plan.price,
                status="pending",
                created_by_staff_id=staff.id,
                updated_by_staff_id=staff.id,
            )
            session.add(order)
            await session.flush()
            staff_id, plan_id, order_id = staff.id, plan.id, order.id
            await session.commit()
            await session.refresh(staff)
            await session.refresh(order)
            token = create_staff_access_token(staff)

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://mariadb-test") as client:
            responses = await asyncio.gather(*[
                client.post(
                    f"/api/orders/{order_id}/mark-paid",
                    headers={"Authorization": f"Bearer {token}"},
                )
                for _ in range(20)
            ])

        statuses = [response.status_code for response in responses]
        assert statuses.count(200) == 1, [response.text for response in responses]
        assert statuses.count(409) == 19, [response.text for response in responses]

        async with sessions() as session:
            persisted_order = (
                await session.execute(select(Order).where(Order.id == order_id))
            ).scalar_one()
            profit_count = (
                await session.execute(
                    select(func.count(ProfitRecord.id)).where(ProfitRecord.order_id == order_id)
                )
            ).scalar_one()
            assert persisted_order.status == "paid"
            assert profit_count == 1
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override

        if any(identifier is not None for identifier in (staff_id, plan_id, order_id)):
            async with sessions() as session:
                if staff_id is not None:
                    await session.execute(delete(AuditLog).where(AuditLog.user_id == staff_id))
                if order_id is not None:
                    await session.execute(delete(ProfitRecord).where(ProfitRecord.order_id == order_id))
                    await session.execute(delete(Order).where(Order.id == order_id))
                if plan_id is not None:
                    await session.execute(delete(Plan).where(Plan.id == plan_id))
                if staff_id is not None:
                    await session.execute(delete(StaffUser).where(StaffUser.id == staff_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_renewal_confirmation_creates_one_expense_for_due_cycle():
    engine = create_async_engine(
        _mariadb_test_url(),
        pool_size=20,
        max_overflow=5,
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:12]
    staff_id: int | None = None
    category_id: int | None = None
    renewal_id: int | None = None
    due_on = date(2027, 1, 31)

    async def override_get_db():
        async with sessions() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    await session.rollback()

    previous_override = app.dependency_overrides.get(get_db)
    try:
        async with engine.begin() as connection:
            assert connection.dialect.name in {"mysql", "mariadb"}
            await connection.run_sync(Base.metadata.create_all)

        async with sessions() as session:
            staff = StaffUser(
                username=f"renewal-concurrency-{suffix}",
                display_name="Renewal concurrency test",
                password_hash=hash_password(f"Concurrency-{suffix}"),
                role=StaffRole.SUPER_ADMIN,
                status=StaffStatus.ACTIVE,
                token_version=1,
                force_password_reset=False,
            )
            category = ExpenseCategory(
                code=f"concurrency_{suffix}",
                name=f"并发测试 {suffix}",
                status="active",
                sort_order=999,
                is_system=False,
            )
            session.add_all([staff, category])
            await session.flush()
            renewal = ExpenseRenewal(
                name=f"并发续费 {suffix}",
                vendor="Test vendor",
                default_amount=Decimal("88.00"),
                category_id=category.id,
                cycle="monthly",
                next_due_on=due_on,
                reminder_days=7,
                anchor_day=31,
                anchor_month_end=True,
                status="active",
                created_by_staff_id=staff.id,
                updated_by_staff_id=staff.id,
            )
            session.add(renewal)
            await session.flush()
            staff_id, category_id, renewal_id = staff.id, category.id, renewal.id
            await session.commit()
            token = create_staff_access_token(staff)

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://mariadb-test") as client:
            responses = await asyncio.gather(*[
                client.post(
                    f"/api/expenses/renewals/{renewal_id}/confirm",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"due_on": due_on.isoformat(), "expense_date": date.today().isoformat()},
                )
                for _ in range(20)
            ])

        statuses = [response.status_code for response in responses]
        assert statuses.count(200) == 1, [response.text for response in responses]
        assert statuses.count(409) == 19, [response.text for response in responses]

        async with sessions() as session:
            expense_count = (
                await session.execute(
                    select(func.count(ExpenseRecord.id)).where(
                        ExpenseRecord.renewal_id == renewal_id,
                        ExpenseRecord.renewal_due_on == due_on,
                    )
                )
            ).scalar_one()
            occurrence_count = (
                await session.execute(
                    select(func.count(ExpenseRenewalOccurrence.id)).where(
                        ExpenseRenewalOccurrence.renewal_id == renewal_id,
                        ExpenseRenewalOccurrence.due_on == due_on,
                    )
                )
            ).scalar_one()
            assert expense_count == 1
            assert occurrence_count == 1
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override

        if any(identifier is not None for identifier in (staff_id, category_id, renewal_id)):
            async with sessions() as session:
                if staff_id is not None:
                    await session.execute(delete(AuditLog).where(AuditLog.user_id == staff_id))
                if renewal_id is not None:
                    await session.execute(delete(ExpenseRenewalOccurrence).where(ExpenseRenewalOccurrence.renewal_id == renewal_id))
                    await session.execute(delete(ExpenseRecord).where(ExpenseRecord.renewal_id == renewal_id))
                    await session.execute(delete(ExpenseRenewal).where(ExpenseRenewal.id == renewal_id))
                if category_id is not None:
                    await session.execute(delete(ExpenseCategory).where(ExpenseCategory.id == category_id))
                if staff_id is not None:
                    await session.execute(delete(StaffUser).where(StaffUser.id == staff_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_twenty_concurrent_first_activations_do_not_oversell_seats_or_devices():
    engine = create_async_engine(
        _mariadb_test_url(),
        pool_size=20,
        max_overflow=5,
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:12]
    plan_id: int | None = None
    auth_code_id: int | None = None

    async def override_get_db():
        async with sessions() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    await session.rollback()

    previous_override = app.dependency_overrides.get(get_db)
    try:
        async with engine.begin() as connection:
            assert connection.dialect.name in {"mysql", "mariadb"}
            await connection.run_sync(Base.metadata.create_all)

        code_value = f"AUTH-CONCURRENCY-{suffix}"
        async with sessions() as session:
            plan = Plan(
                name=f"Activation concurrency {suffix}",
                price=Decimal("19.00"),
                duration_days=30,
                status="active",
                product_type="consumer",
            )
            session.add(plan)
            await session.flush()
            auth_code = AuthCode(
                code=code_value,
                plan_id=plan.id,
                max_devices=1,
                seat_limit=1,
                status="unused",
            )
            session.add(auth_code)
            await session.flush()
            plan_id, auth_code_id = plan.id, auth_code.id
            await session.commit()

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://mariadb-test") as client:
            responses = await asyncio.gather(*[
                client.post(
                    "/api/auth/verify",
                    json={
                        "code": code_value,
                        "device_id": f"device-{suffix}-{index}",
                        "device_name": f"desktop-{suffix}-{index}",
                    },
                )
                for index in range(20)
            ])

        bodies = [response.json() for response in responses]
        assert sum(body["success"] is True for body in bodies) == 1, bodies
        assert sum(body["success"] is False for body in bodies) == 19, bodies

        async with sessions() as session:
            user_count = int((await session.execute(
                select(func.count(User.id)).where(User.auth_code_id == auth_code_id)
            )).scalar_one())
            seat_count = int((await session.execute(
                select(func.count(AuthSeat.id)).where(
                    AuthSeat.auth_code_id == auth_code_id,
                    AuthSeat.status == "active",
                )
            )).scalar_one())
            device_count = int((await session.execute(
                select(func.count(Device.id)).where(Device.auth_code_id == auth_code_id)
            )).scalar_one())
            assert (user_count, seat_count, device_count) == (1, 1, 1)
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override

        if auth_code_id is not None or plan_id is not None:
            async with sessions() as session:
                if auth_code_id is not None:
                    await session.execute(
                        update(AuthCode).where(AuthCode.id == auth_code_id).values(user_id=None)
                    )
                    await session.execute(delete(AuthSeat).where(AuthSeat.auth_code_id == auth_code_id))
                    await session.execute(delete(Device).where(Device.auth_code_id == auth_code_id))
                    await session.execute(delete(User).where(User.auth_code_id == auth_code_id))
                    await session.execute(delete(AuthCode).where(AuthCode.id == auth_code_id))
                if plan_id is not None:
                    await session.execute(delete(Plan).where(Plan.id == plan_id))
                await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_attachment_uploads_enforce_five_file_limit(tmp_path, monkeypatch):
    engine = create_async_engine(
        _mariadb_test_url(),
        pool_size=10,
        max_overflow=2,
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    suffix = uuid.uuid4().hex[:12]
    staff_id: int | None = None
    category_id: int | None = None
    expense_id: int | None = None
    monkeypatch.setenv("EXPENSE_ATTACHMENT_DIR", str(tmp_path))

    async def override_get_db():
        async with sessions() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    await session.rollback()

    previous_override = app.dependency_overrides.get(get_db)
    try:
        async with engine.begin() as connection:
            assert connection.dialect.name in {"mysql", "mariadb"}
            await connection.run_sync(Base.metadata.create_all)

        async with sessions() as session:
            staff = StaffUser(
                username=f"attachment-concurrency-{suffix}",
                display_name="Attachment concurrency test",
                password_hash=hash_password(f"Concurrency-{suffix}"),
                role=StaffRole.SUPER_ADMIN,
                status=StaffStatus.ACTIVE,
                token_version=1,
                force_password_reset=False,
            )
            category = ExpenseCategory(
                code=f"attachment_{suffix}",
                name=f"附件并发测试 {suffix}",
                status="active",
                sort_order=999,
                is_system=False,
            )
            session.add_all([staff, category])
            await session.flush()
            expense = ExpenseRecord(
                amount=Decimal("12.34"),
                currency="CNY",
                expense_date=date.today(),
                title=f"附件并发测试 {suffix}",
                category_id=category.id,
                status="active",
                created_by_staff_id=staff.id,
                updated_by_staff_id=staff.id,
            )
            session.add(expense)
            await session.flush()
            staff_id, category_id, expense_id = staff.id, category.id, expense.id
            await session.commit()
            token = create_staff_access_token(staff)

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://mariadb-test") as client:
            responses = await asyncio.gather(*[
                client.post(
                    f"/api/expenses/{expense_id}/attachments",
                    headers={"Authorization": f"Bearer {token}"},
                    files={
                        "file": (
                            f"receipt-{index}.png",
                            b"\x89PNG\r\n\x1a\n" + bytes([index]),
                            "image/png",
                        )
                    },
                )
                for index in range(10)
            ])

        statuses = [response.status_code for response in responses]
        assert statuses.count(201) == 5, [response.text for response in responses]
        assert statuses.count(409) == 5, [response.text for response in responses]

        async with sessions() as session:
            attachment_count = int((await session.execute(
                select(func.count(ExpenseAttachment.id)).where(
                    ExpenseAttachment.expense_id == expense_id
                )
            )).scalar_one())
            assert attachment_count == 5
        assert len(list(tmp_path.rglob("*.png"))) == 5
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override

        if any(identifier is not None for identifier in (staff_id, category_id, expense_id)):
            async with sessions() as session:
                if staff_id is not None:
                    await session.execute(delete(AuditLog).where(AuditLog.user_id == staff_id))
                if expense_id is not None:
                    await session.execute(
                        delete(ExpenseAttachment).where(
                            ExpenseAttachment.expense_id == expense_id
                        )
                    )
                    await session.execute(delete(ExpenseRecord).where(ExpenseRecord.id == expense_id))
                if category_id is not None:
                    await session.execute(delete(ExpenseCategory).where(ExpenseCategory.id == category_id))
                if staff_id is not None:
                    await session.execute(delete(StaffUser).where(StaffUser.id == staff_id))
                await session.commit()
        await engine.dispose()
