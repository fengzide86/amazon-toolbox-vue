"""Deterministic internal fixtures contain no default staff credential."""
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from domains.catalog.seed_service import INTERNAL_ORDER_PREFIX, _seed_internal_validation_data
from models import KnowledgeBase, Order, Plan, ProfitRecord, StaffUser


@pytest.mark.asyncio
async def test_internal_seed_is_idempotent_and_balanced(db_session):
    db_session.add(
        Plan(
            name="内测套餐",
            price=Decimal("99.01"),
            duration_days=30,
            status="active",
            product_type="consumer",
            entitlements="{}",
        )
    )
    await db_session.commit()

    await _seed_internal_validation_data(db_session)
    await db_session.commit()
    await _seed_internal_validation_data(db_session)
    await db_session.commit()

    order_count = (
        await db_session.execute(
            select(func.count(Order.id)).where(Order.order_no.like(f"{INTERNAL_ORDER_PREFIX}%"))
        )
    ).scalar()
    assert order_count == 4
    assert (await db_session.execute(select(func.count(ProfitRecord.id)))).scalar() == 2
    assert (await db_session.execute(select(func.count(KnowledgeBase.id)))).scalar() == 3
    assert (await db_session.execute(select(func.count(StaffUser.id)))).scalar() == 0

    records = (await db_session.execute(select(ProfitRecord))).scalars().all()
    for record in records:
        total = sum((
            record.tech_share,
            record.market_share,
            record.product_share,
            record.service_share,
            record.coordination_share,
            record.record_share,
        ), Decimal("0"))
        assert total == record.order_amount_snapshot
    assert {record.status for record in records} == {"active", "reversed"}
