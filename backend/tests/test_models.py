"""
数据模型单元测试
测试 SQLAlchemy ORM 模型的定义和关系
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Setting, Plan, AuthCode, Device, Order, 
    User, RunLog, Feedback, ProfitRecord,
    AuthCodeStatus, OrderStatus, PlanStatus, 
    FeedbackStatus, LogStatus
)


class TestSettingModel:
    """Setting 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_setting(self, db_session: AsyncSession):
        """测试创建设置记录"""
        setting = Setting(
            key="test_key",
            value="test_value",
            description="测试设置"
        )
        db_session.add(setting)
        await db_session.commit()
        
        result = await db_session.execute(
            select(Setting).where(Setting.key == "test_key")
        )
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.key == "test_key"
        assert saved.value == "test_value"
        assert saved.description == "测试设置"
        assert saved.created_at is not None


class TestPlanModel:
    """Plan 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_plan(self, db_session: AsyncSession):
        """测试创建套餐"""
        plan = Plan(
            name="月度套餐",
            price=99.00,
            duration_days=30,
            features='["功能1", "功能2"]',
            status=PlanStatus.ACTIVE
        )
        db_session.add(plan)
        await db_session.commit()
        
        result = await db_session.execute(select(Plan))
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.name == "月度套餐"
        assert float(saved.price) == 99.00
        assert saved.duration_days == 30
        assert saved.status == PlanStatus.ACTIVE
    
    @pytest.mark.asyncio
    async def test_plan_price_precision(self, db_session: AsyncSession):
        """测试套餐价格精度"""
        plan = Plan(
            name="精确价格套餐",
            price=199.99,
            duration_days=90,
            status=PlanStatus.ACTIVE
        )
        db_session.add(plan)
        await db_session.commit()
        
        result = await db_session.execute(select(Plan))
        saved = result.scalar_one()
        
        assert float(saved.price) == 199.99


class TestAuthCodeModel:
    """AuthCode 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_auth_code(self, db_session: AsyncSession):
        """测试创建授权码"""
        # 先创建套餐
        plan = Plan(name="测试套餐", price=99.00, duration_days=30, status=PlanStatus.ACTIVE)
        db_session.add(plan)
        await db_session.commit()
        
        auth_code = AuthCode(
            code="TEST-ABCD-1234",
            plan_id=plan.id,
            max_devices=3,
            status=AuthCodeStatus.UNUSED
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        result = await db_session.execute(
            select(AuthCode).where(AuthCode.code == "TEST-ABCD-1234")
        )
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.code == "TEST-ABCD-1234"
        assert saved.plan_id == plan.id
        assert saved.max_devices == 3
        assert saved.status == AuthCodeStatus.UNUSED
    
    @pytest.mark.asyncio
    async def test_auth_code_with_devices(self, db_session: AsyncSession):
        """测试授权码与设备的关联关系"""
        # 创建套餐和授权码
        plan = Plan(name="测试套餐", price=99.00, duration_days=30, status=PlanStatus.ACTIVE)
        db_session.add(plan)
        await db_session.commit()
        
        auth_code = AuthCode(
            code="TEST-WITH-DEVICES",
            plan_id=plan.id,
            max_devices=2,
            status=AuthCodeStatus.ACTIVE
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        # 添加设备
        device1 = Device(
            auth_code_id=auth_code.id,
            device_id="device-001",
            device_name="设备1"
        )
        device2 = Device(
            auth_code_id=auth_code.id,
            device_id="device-002",
            device_name="设备2"
        )
        db_session.add_all([device1, device2])
        await db_session.commit()
        
        # 验证关联关系
        result = await db_session.execute(
            select(AuthCode).where(AuthCode.code == "TEST-WITH-DEVICES")
        )
        saved = result.scalar_one()
        
        assert len(saved.devices) == 2
        assert saved.devices[0].device_id == "device-001"
        assert saved.devices[1].device_id == "device-002"
    
    @pytest.mark.asyncio
    async def test_auth_code_status_transitions(self, db_session: AsyncSession):
        """测试授权码状态转换"""
        auth_code = AuthCode(
            code="STATUS-TEST-001",
            status=AuthCodeStatus.UNUSED
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        # UNUSED -> ACTIVE
        auth_code.status = AuthCodeStatus.ACTIVE
        await db_session.commit()
        
        result = await db_session.execute(
            select(AuthCode).where(AuthCode.code == "STATUS-TEST-001")
        )
        saved = result.scalar_one()
        assert saved.status == AuthCodeStatus.ACTIVE
        
        # ACTIVE -> FROZEN
        auth_code.status = AuthCodeStatus.FROZEN
        await db_session.commit()
        
        await db_session.refresh(auth_code)
        assert auth_code.status == AuthCodeStatus.FROZEN
        
        # FROZEN -> EXPIRED
        auth_code.status = AuthCodeStatus.EXPIRED
        await db_session.commit()
        
        await db_session.refresh(auth_code)
        assert auth_code.status == AuthCodeStatus.EXPIRED


class TestOrderModel:
    """Order 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_order(self, db_session: AsyncSession):
        """测试创建订单"""
        order = Order(
            order_no="ORD-2024-TEST-001",
            amount=199.00,
            channel="微信支付",
            responsible="张三",
            status=OrderStatus.PENDING
        )
        db_session.add(order)
        await db_session.commit()
        
        result = await db_session.execute(
            select(Order).where(Order.order_no == "ORD-2024-TEST-001")
        )
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.order_no == "ORD-2024-TEST-001"
        assert float(saved.amount) == 199.00
        assert saved.channel == "微信支付"
        assert saved.status == OrderStatus.PENDING
        assert saved.paid_at is None
    
    @pytest.mark.asyncio
    async def test_order_status_transitions(self, db_session: AsyncSession):
        """测试订单状态转换"""
        order = Order(
            order_no="ORD-STATUS-TEST",
            amount=99.00,
            status=OrderStatus.PENDING
        )
        db_session.add(order)
        await db_session.commit()
        
        # PENDING -> PAID
        order.status = OrderStatus.PAID
        order.paid_at = datetime.now()
        await db_session.commit()
        
        await db_session.refresh(order)
        assert order.status == OrderStatus.PAID
        assert order.paid_at is not None
        
        # PAID -> REFUNDED
        order.status = OrderStatus.REFUNDED
        order.refund_amount = 50.00
        await db_session.commit()
        
        await db_session.refresh(order)
        assert order.status == OrderStatus.REFUNDED
        assert float(order.refund_amount) == 50.00


class TestUserModel:
    """User 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_user(self, db_session: AsyncSession):
        """测试创建用户"""
        user = User(
            name="测试用户",
            phone="13800138000",
            device_id="device-001",
            device_name="测试设备",
            total_seats=1,
            extra_devices=0
        )
        db_session.add(user)
        await db_session.commit()
        
        result = await db_session.execute(select(User))
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.name == "测试用户"
        assert saved.phone == "13800138000"
        assert saved.device_id == "device-001"
        assert saved.total_seats == 1


class TestRunLogModel:
    """RunLog 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_run_log(self, db_session: AsyncSession):
        """测试创建运行日志"""
        log = RunLog(
            user_id=1,
            device_id="device-001",
            tool_name="订单查询工具",
            module="订单模块",
            status=LogStatus.SUCCESS,
            detail="成功查询 100 条订单"
        )
        db_session.add(log)
        await db_session.commit()
        
        result = await db_session.execute(select(RunLog))
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.tool_name == "订单查询工具"
        assert saved.module == "订单模块"
        assert saved.status == LogStatus.SUCCESS
    
    @pytest.mark.asyncio
    async def test_create_failed_log(self, db_session: AsyncSession):
        """测试创建失败日志"""
        log = RunLog(
            user_id=1,
            device_id="device-001",
            tool_name="发货工具",
            status=LogStatus.FAILED,
            error_code="NETWORK_ERROR",
            detail="网络连接超时"
        )
        db_session.add(log)
        await db_session.commit()
        
        result = await db_session.execute(select(RunLog))
        saved = result.scalar_one()
        
        assert saved.status == LogStatus.FAILED
        assert saved.error_code == "NETWORK_ERROR"


class TestFeedbackModel:
    """Feedback 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_feedback(self, db_session: AsyncSession):
        """测试创建工单"""
        feedback = Feedback(
            user_id=1,
            title="无法登录",
            content="输入授权码后提示无效",
            status=FeedbackStatus.PENDING
        )
        db_session.add(feedback)
        await db_session.commit()
        
        result = await db_session.execute(select(Feedback))
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert saved.title == "无法登录"
        assert saved.status == FeedbackStatus.PENDING
        assert saved.admin_reply is None
    
    @pytest.mark.asyncio
    async def test_feedback_with_reply(self, db_session: AsyncSession):
        """测试工单回复"""
        feedback = Feedback(
            user_id=1,
            title="功能建议",
            content="希望能增加批量导出功能",
            status=FeedbackStatus.PENDING
        )
        db_session.add(feedback)
        await db_session.commit()
        
        # 管理员回复
        feedback.status = FeedbackStatus.RESOLVED
        feedback.admin_reply = "感谢反馈，已加入开发计划"
        await db_session.commit()
        
        await db_session.refresh(feedback)
        assert feedback.status == FeedbackStatus.RESOLVED
        assert feedback.admin_reply == "感谢反馈，已加入开发计划"


class TestProfitRecordModel:
    """ProfitRecord 模型测试"""
    
    @pytest.mark.asyncio
    async def test_create_profit_record(self, db_session: AsyncSession):
        """测试创建分润记录"""
        record = ProfitRecord(
            order_id=1,
            tech_share=30.00,
            market_share=25.00,
            product_share=20.00,
            service_share=15.00,
            coordination_share=5.00,
            record_share=5.00
        )
        db_session.add(record)
        await db_session.commit()
        
        result = await db_session.execute(select(ProfitRecord))
        saved = result.scalar_one()
        
        assert saved.id is not None
        assert float(saved.tech_share) == 30.00
        assert float(saved.market_share) == 25.00
        assert float(saved.product_share) == 20.00
        assert float(saved.service_share) == 15.00
        assert float(saved.coordination_share) == 5.00
        assert float(saved.record_share) == 5.00
        
        # 验证总分润
        total = (
            float(saved.tech_share) + 
            float(saved.market_share) + 
            float(saved.product_share) + 
            float(saved.service_share) + 
            float(saved.coordination_share) + 
            float(saved.record_share)
        )
        assert total == 100.00


class TestStatusConstants:
    """状态常量测试"""
    
    def test_auth_code_status_values(self):
        """测试授权码状态常量"""
        assert AuthCodeStatus.UNUSED == "unused"
        assert AuthCodeStatus.ACTIVE == "active"
        assert AuthCodeStatus.FROZEN == "frozen"
        assert AuthCodeStatus.EXPIRED == "expired"
        assert AuthCodeStatus.DELETED == "deleted"
    
    def test_order_status_values(self):
        """测试订单状态常量"""
        assert OrderStatus.PENDING == "pending"
        assert OrderStatus.PAID == "paid"
        assert OrderStatus.REFUNDED == "refunded"
    
    def test_plan_status_values(self):
        """测试套餐状态常量"""
        assert PlanStatus.ACTIVE == "active"
        assert PlanStatus.DISABLED == "disabled"
        assert PlanStatus.DELETED == "deleted"
    
    def test_feedback_status_values(self):
        """测试工单状态常量"""
        assert FeedbackStatus.PENDING == "pending"
        assert FeedbackStatus.PROCESSING == "processing"
        assert FeedbackStatus.RESOLVED == "resolved"
    
    def test_log_status_values(self):
        """测试日志状态常量"""
        assert LogStatus.SUCCESS == "success"
        assert LogStatus.FAILED == "failed"