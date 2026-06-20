"""
分润计算测试
测试分润记录的 CRUD、汇总计算、平台过滤等核心逻辑
"""
import pytest
from sqlalchemy import select
from models import Order, Plan, ProfitRecord
from tests.conftest import get_data


@pytest.mark.asyncio
async def test_get_profit_records_empty(client, auth_headers):
    """测试空分润记录列表"""
    response = await client.get("/api/profit", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_get_profit_summary_empty(client, auth_headers):
    """测试空分润汇总"""
    response = await client.get("/api/profit/summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_tech"] == 0
    assert data["total_market"] == 0
    assert data["total_product"] == 0
    assert data["total_service"] == 0
    assert data["total_coordination"] == 0
    assert data["total_record"] == 0
    assert data["grand_total"] == 0


@pytest.mark.asyncio
async def test_profit_summary_calculation(client, auth_headers, db_session):
    """测试分润汇总计算是否正确
    
    创建订单和分润记录，验证汇总金额计算
    """
    # 创建套餐
    plan = Plan(name="测试套餐", price=100, duration_days=30, status="active")
    db_session.add(plan)
    await db_session.flush()
    
    # 创建订单
    order = Order(
        order_no="ORD-TEST-001",
        plan_id=plan.id,
        amount=100.0,
        channel="微信",
        responsible="张三",
        status="paid",
    )
    db_session.add(order)
    await db_session.flush()
    
    # 创建分润记录（按默认比例 30/25/15/15/10/5）
    profit = ProfitRecord(
        order_id=order.id,
        amount=100.0,
        tech_share=30.0,       # 30%
        market_share=25.0,     # 25%
        product_share=15.0,    # 15%
        service_share=15.0,    # 15%
        coordination_share=10.0,  # 10%
        record_share=5.0,      # 5%
    )
    db_session.add(profit)
    await db_session.commit()
    
    # 验证汇总
    response = await client.get("/api/profit/summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    
    assert data["total_tech"] == 30.0
    assert data["total_market"] == 25.0
    assert data["total_product"] == 15.0
    assert data["total_service"] == 15.0
    assert data["total_coordination"] == 10.0
    assert data["total_record"] == 5.0
    assert data["grand_total"] == 100.0


@pytest.mark.asyncio
async def test_profit_summary_multiple_records(client, auth_headers, db_session):
    """测试多条分润记录的汇总"""
    # 创建两个订单和分润记录
    for i, amount in enumerate([100, 200]):
        plan = Plan(name=f"套餐{i}", price=amount, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.flush()
        
        order = Order(
            order_no=f"ORD-MULTI-{i:03d}",
            plan_id=plan.id,
            amount=float(amount),
            channel="微信",
            responsible="张三",
            status="paid",
        )
        db_session.add(order)
        await db_session.flush()
        
        # 分润：tech=30%, 其他=0
        profit = ProfitRecord(
            order_id=order.id,
            amount=float(amount),
            tech_share=amount * 0.3,
            market_share=0,
            product_share=0,
            service_share=0,
            coordination_share=0,
            record_share=0,
        )
        db_session.add(profit)
    
    await db_session.commit()
    
    # 验证汇总：100*0.3 + 200*0.3 = 30 + 60 = 90
    response = await client.get("/api/profit/summary", headers=auth_headers)
    data = response.json()
    assert data["total_tech"] == 90.0
    assert data["grand_total"] == 90.0


@pytest.mark.asyncio
async def test_profit_records_pagination(client, auth_headers, db_session):
    """测试分润记录分页"""
    # 创建 5 条分润记录
    for i in range(5):
        plan = Plan(name=f"分页套餐{i}", price=50, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.flush()
        
        order = Order(
            order_no=f"ORD-PAGE-{i:03d}",
            plan_id=plan.id,
            amount=50.0,
            channel="微信",
            responsible="张三",
            status="paid",
        )
        db_session.add(order)
        await db_session.flush()
        
        profit = ProfitRecord(
            order_id=order.id,
            amount=50.0,
            tech_share=15.0,
            market_share=12.5,
            product_share=7.5,
            service_share=7.5,
            coordination_share=5.0,
            record_share=2.5,
        )
        db_session.add(profit)
    
    await db_session.commit()
    
    # 第一页，每页 2 条
    response = await client.get("/api/profit?page=1&page_size=2", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    
    # 第三页，每页 2 条（应该只有 1 条）
    response = await client.get("/api/profit?page=3&page_size=2", headers=auth_headers)
    data = response.json()
    assert len(data) == 1


@pytest.mark.asyncio
async def test_profit_summary_requires_auth(client):
    """测试分润汇总需要认证"""
    response = await client.get("/api/profit/summary")
    assert response.status_code == 401