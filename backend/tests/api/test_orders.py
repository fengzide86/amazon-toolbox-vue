"""
订单管理 API 集成测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Order, Plan, Setting, ProfitRecord


class TestGetOrders:
    """获取订单列表测试"""
    
    @pytest.mark.asyncio
    async def test_get_orders_empty(self, client: AsyncClient):
        """测试获取空订单列表"""
        response = await client.get("/api/orders")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    @pytest.mark.asyncio
    async def test_get_orders_with_data(self, client: AsyncClient, db_session: AsyncSession):
        """测试获取订单列表（有数据）"""
        order1 = Order(order_no="ORD-001", amount=99.00, status="pending")
        order2 = Order(order_no="ORD-002", amount=199.00, status="paid")
        db_session.add_all([order1, order2])
        await db_session.commit()
        
        response = await client.get("/api/orders")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
    
    @pytest.mark.asyncio
    async def test_get_orders_pagination(self, client: AsyncClient, db_session: AsyncSession):
        """测试订单分页"""
        # 创建多个订单
        for i in range(10):
            order = Order(order_no=f"ORD-{i:03d}", amount=99.00, status="pending")
            db_session.add(order)
        await db_session.commit()
        
        # 获取第一页
        response = await client.get("/api/orders?page=1&page_size=5")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5


class TestCreateOrder:
    """创建订单测试"""
    
    @pytest.mark.asyncio
    async def test_create_order_pending(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试创建待付款订单"""
        order_data = {
            "amount": 99.00,
            "channel": "微信支付",
            "responsible": "张三",
            "status": "pending"
        }
        
        response = await client.post("/api/orders", json=order_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert float(data["amount"]) == 99.00
        assert data["status"] == "pending"
        assert data["order_no"].startswith("ORD-")
    
    @pytest.mark.asyncio
    async def test_create_order_paid(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试创建已付款订单（自动生成分润记录）"""
        # 设置分润比例
        setting2 = Setting(key="profit_ratios", value='{"tech": 0.30, "market": 0.25, "product": 0.15, "service": 0.15, "coordination": 0.10, "record": 0.05}')
        db_session.add(setting2)
        await db_session.commit()
        
        order_data = {
            "amount": 100.00,
            "status": "paid"
        }
        
        response = await client.post("/api/orders", json=order_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paid"
        assert data["paid_at"] is not None


class TestUpdateOrder:
    """更新订单测试"""
    
    @pytest.mark.asyncio
    async def test_update_order_status(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试更新订单状态"""
        # 设置分润比例
        setting2 = Setting(key="profit_ratios", value='{"tech": 0.30, "market": 0.25, "product": 0.15, "service": 0.15, "coordination": 0.10, "record": 0.05}')
        db_session.add(setting2)
        await db_session.commit()
        
        # 创建订单
        order = Order(order_no="ORD-UPDATE-001", amount=99.00, status="pending")
        db_session.add(order)
        await db_session.commit()
        
        # 更新为已付款
        update_data = {"status": "paid"}
        response = await client.put(f"/api/orders/{order.id}", json=update_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paid"
        assert data["paid_at"] is not None
    
    @pytest.mark.asyncio
    async def test_update_order_not_found(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试更新不存在的订单"""
        response = await client.put("/api/orders/99999", json={"status": "paid"}, headers=auth_headers)
        
        assert response.status_code == 404


class TestRefundOrder:
    """订单退款测试"""
    
    @pytest.mark.asyncio
    async def test_refund_order_success(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试订单退款成功"""
        # 创建已付款订单
        order = Order(order_no="ORD-REFUND-001", amount=99.00, status="paid")
        db_session.add(order)
        await db_session.commit()
        
        response = await client.post(f"/api/orders/{order.id}/refund", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["order_no"] == "ORD-REFUND-001"
        
        # 验证订单状态
        await db_session.refresh(order)
        assert order.status == "refunded"
        assert float(order.refund_amount) == 99.00
    
    @pytest.mark.asyncio
    async def test_refund_order_deletes_profit_record(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试退款时删除分润记录"""
        # 创建已付款订单和分润记录
        order = Order(order_no="ORD-REFUND-002", amount=100.00, status="paid")
        db_session.add(order)
        await db_session.flush()
        
        profit = ProfitRecord(
            order_id=order.id,
            tech_share=30.00,
            market_share=25.00,
            product_share=15.00,
            service_share=15.00,
            coordination_share=10.00,
            record_share=5.00
        )
        db_session.add(profit)
        await db_session.commit()
        
        # 退款
        response = await client.post(f"/api/orders/{order.id}/refund", headers=auth_headers)
        
        assert response.status_code == 200
        
        # 验证分润记录已删除
        from sqlalchemy import select
        result = await db_session.execute(
            select(ProfitRecord).where(ProfitRecord.order_id == order.id)
        )
        deleted_profit = result.scalars().first()
        assert deleted_profit is None
    
    @pytest.mark.asyncio
    async def test_refund_order_not_found(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试退款不存在的订单"""
        response = await client.post("/api/orders/99999/refund", headers=auth_headers)
        
        assert response.status_code == 404