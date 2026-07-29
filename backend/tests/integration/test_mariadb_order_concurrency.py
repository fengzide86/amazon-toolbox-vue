import asyncio
import os
import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.security import hash_password
from database import Base, get_db
from main import app
from models import AuditLog, Order, Plan, ProfitRecord, StaffRole, StaffStatus, StaffUser
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
