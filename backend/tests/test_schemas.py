"""
Pydantic Schema 单元测试
测试请求/响应数据模型的验证逻辑
"""
import pytest
from datetime import datetime
from pydantic import ValidationError

from schemas import (
    # Auth
    VerifyRequest, AdminLoginRequest, VerifyResponse, AdminLoginResponse,
    # Plans
    PlanCreate, PlanUpdate, PlanResponse,
    # Auth Codes
    AuthCodeGenerate, AuthCodeUpdate, AuthCodeResponse, DeviceResponse,
    # Orders
    OrderCreate, OrderUpdate, OrderResponse,
    # Users
    UserUpdate, UserResponse,
    # Logs
    LogCreate, LogResponse,
    # Feedback
    FeedbackCreate, FeedbackUpdate, FeedbackResponse,
    # Profit
    ProfitRecordResponse,
    # Settings
    SettingUpdate, SettingResponse,
    # Dashboard
    DashboardData
)


class TestVerifyRequest:
    """VerifyRequest Schema 测试"""
    
    def test_valid_request(self):
        """测试有效的验证请求"""
        request = VerifyRequest(
            code="TEST-ABCD-1234",
            device_id="device-001",
            device_name="我的电脑"
        )
        assert request.code == "TEST-ABCD-1234"
        assert request.device_id == "device-001"
        assert request.device_name == "我的电脑"
    
    def test_missing_code(self):
        """测试缺少授权码"""
        with pytest.raises(ValidationError):
            VerifyRequest(device_id="device-001", device_name="我的电脑")
    
    def test_missing_device_id(self):
        """测试缺少设备ID"""
        with pytest.raises(ValidationError):
            VerifyRequest(code="TEST-ABCD-1234", device_name="我的电脑")
    
    def test_missing_device_name(self):
        """测试缺少设备名称"""
        with pytest.raises(ValidationError):
            VerifyRequest(code="TEST-ABCD-1234", device_id="device-001")


class TestAdminLoginRequest:
    """AdminLoginRequest Schema 测试"""
    
    def test_valid_login(self):
        """测试有效的登录请求"""
        request = AdminLoginRequest(password="admin123")
        assert request.password == "admin123"
    
    def test_empty_password(self):
        """测试空密码（Pydantic 允许空字符串，业务层处理）"""
        request = AdminLoginRequest(password="")
        assert request.password == ""
    
    def test_missing_password(self):
        """测试缺少密码"""
        with pytest.raises(ValidationError):
            AdminLoginRequest()


class TestPlanCreate:
    """PlanCreate Schema 测试"""
    
    def test_valid_plan(self):
        """测试有效的套餐创建"""
        plan = PlanCreate(
            name="月度套餐",
            price=99.00,
            duration_days=30,
            features='["功能1", "功能2"]',
            status="active"
        )
        assert plan.name == "月度套餐"
        assert plan.price == 99.00
        assert plan.duration_days == 30
        assert plan.status == "active"
    
    def test_plan_with_defaults(self):
        """测试套餐默认值"""
        plan = PlanCreate(
            name="基础套餐",
            price=49.00,
            duration_days=7
        )
        assert plan.features is None
        assert plan.status == "active"
    
    def test_plan_negative_price(self):
        """测试负数价格（应该允许，业务层处理）"""
        plan = PlanCreate(
            name="测试套餐",
            price=-10.00,
            duration_days=30
        )
        assert plan.price == -10.00
    
    def test_plan_zero_duration(self):
        """测试零天数"""
        plan = PlanCreate(
            name="测试套餐",
            price=0.00,
            duration_days=0
        )
        assert plan.duration_days == 0


class TestPlanUpdate:
    """PlanUpdate Schema 测试"""
    
    def test_partial_update(self):
        """测试部分更新"""
        update = PlanUpdate(name="新名称")
        assert update.name == "新名称"
        assert update.price is None
        assert update.duration_days is None
    
    def test_full_update(self):
        """测试完整更新"""
        update = PlanUpdate(
            name="新名称",
            price=199.00,
            duration_days=90,
            features='["新功能"]',
            status="disabled"
        )
        assert update.name == "新名称"
        assert update.price == 199.00
        assert update.status == "disabled"


class TestPlanResponse:
    """PlanResponse Schema 测试"""
    
    def test_response_from_dict(self):
        """测试从字典创建响应"""
        response = PlanResponse(
            id=1,
            name="月度套餐",
            price=99.00,
            duration_days=30,
            features='["功能1"]',
            status="active",
            created_at=datetime.now()
        )
        assert response.id == 1
        assert response.name == "月度套餐"
    
    def test_response_without_optional(self):
        """测试不带可选字段"""
        response = PlanResponse(
            id=1,
            name="基础套餐",
            price=49.00,
            duration_days=7,
            status="active"
        )
        assert response.features is None
        assert response.created_at is None


class TestAuthCodeGenerate:
    """AuthCodeGenerate Schema 测试"""
    
    def test_generate_single(self):
        """测试生成单个授权码"""
        gen = AuthCodeGenerate(count=1)
        assert gen.count == 1
        assert gen.plan_id is None
    
    def test_generate_batch(self):
        """测试批量生成"""
        gen = AuthCodeGenerate(
            plan_id=1,
            count=10,
            duration_days=30,
            max_devices=3
        )
        assert gen.count == 10
        assert gen.plan_id == 1
        assert gen.duration_days == 30
        assert gen.max_devices == 3
    
    def test_generate_default_count(self):
        """测试默认生成数量"""
        gen = AuthCodeGenerate()
        assert gen.count == 1


class TestAuthCodeUpdate:
    """AuthCodeUpdate Schema 测试"""
    
    def test_update_status(self):
        """测试更新状态"""
        update = AuthCodeUpdate(status="frozen")
        assert update.status == "frozen"
    
    def test_update_expiry(self):
        """测试更新过期时间"""
        update = AuthCodeUpdate(expires_at="2024-12-31 23:59:59")
        assert update.expires_at == "2024-12-31 23:59:59"
    
    def test_update_devices(self):
        """测试更新设备信息"""
        update = AuthCodeUpdate(
            device_id="new-device-001",
            device_name="新设备",
            max_devices=5
        )
        assert update.device_id == "new-device-001"
        assert update.max_devices == 5


class TestOrderCreate:
    """OrderCreate Schema 测试"""
    
    def test_create_order(self):
        """测试创建订单"""
        order = OrderCreate(
            plan_id=1,
            amount=99.00,
            channel="微信支付",
            responsible="张三",
            status="pending"
        )
        assert order.amount == 99.00
        assert order.channel == "微信支付"
    
    def test_create_order_defaults(self):
        """测试订单默认值"""
        order = OrderCreate(amount=49.00)
        assert order.plan_id is None
        assert order.channel is None
        assert order.status == "pending"


class TestOrderUpdate:
    """OrderUpdate Schema 测试"""
    
    def test_update_status(self):
        """测试更新订单状态"""
        update = OrderUpdate(status="paid")
        assert update.status == "paid"
    
    def test_update_refund(self):
        """测试更新退款"""
        update = OrderUpdate(status="refunded", refund_amount=50.00)
        assert update.refund_amount == 50.00


class TestUserUpdate:
    """UserUpdate Schema 测试"""
    
    def test_update_user_info(self):
        """测试更新用户信息"""
        update = UserUpdate(
            name="新名字",
            phone="13900139000"
        )
        assert update.name == "新名字"
        assert update.phone == "13900139000"
    
    def test_update_seats(self):
        """测试更新席位数"""
        update = UserUpdate(total_seats=3, extra_devices=2)
        assert update.total_seats == 3
        assert update.extra_devices == 2


class TestLogCreate:
    """LogCreate Schema 测试"""
    
    def test_create_success_log(self):
        """测试创建成功日志"""
        log = LogCreate(
            user_id=1,
            device_id="device-001",
            tool_name="订单查询",
            module="订单模块",
            status="success",
            detail="查询成功"
        )
        assert log.status == "success"
    
    def test_create_error_log(self):
        """测试创建错误日志"""
        log = LogCreate(
            user_id=1,
            tool_name="发货工具",
            status="failed",
            error_code="NETWORK_ERROR",
            detail="网络超时"
        )
        assert log.status == "failed"
        assert log.error_code == "NETWORK_ERROR"


class TestFeedbackCreate:
    """FeedbackCreate Schema 测试"""
    
    def test_create_feedback(self):
        """测试创建工单"""
        feedback = FeedbackCreate(
            user_id=1,
            title="无法登录",
            content="输入授权码后提示无效",
            screenshot="screenshot.png"
        )
        assert feedback.title == "无法登录"
        assert feedback.screenshot == "screenshot.png"
    
    def test_create_feedback_minimal(self):
        """测试最小工单"""
        feedback = FeedbackCreate()
        assert feedback.user_id is None
        assert feedback.title is None


class TestFeedbackUpdate:
    """FeedbackUpdate Schema 测试"""
    
    def test_update_status(self):
        """测试更新工单状态"""
        update = FeedbackUpdate(status="processing")
        assert update.status == "processing"
    
    def test_update_with_reply(self):
        """测试更新带回复"""
        update = FeedbackUpdate(
            status="resolved",
            admin_reply="已处理完成"
        )
        assert update.admin_reply == "已处理完成"


class TestSettingUpdate:
    """SettingUpdate Schema 测试"""
    
    def test_update_setting(self):
        """测试更新设置"""
        update = SettingUpdate(
            key="site_name",
            value="亚马逊工具箱",
            description="网站名称"
        )
        assert update.key == "site_name"
        assert update.value == "亚马逊工具箱"
    
    def test_update_without_description(self):
        """测试不带描述"""
        update = SettingUpdate(key="setting_key", value="setting_value")
        assert update.description is None


class TestDashboardData:
    """DashboardData Schema 测试"""
    
    def test_dashboard_data(self):
        """测试看板数据"""
        data = DashboardData(
            total_revenue=10000.00,
            total_orders=100,
            active_codes=50,
            total_users=200,
            today_runs=500,
            pending_tickets=5,
            recent_logs=[{"id": 1, "tool_name": "测试工具"}]
        )
        assert data.total_revenue == 10000.00
        assert data.total_orders == 100
        assert len(data.recent_logs) == 1


class TestDeviceResponse:
    """DeviceResponse Schema 测试"""
    
    def test_device_response(self):
        """测试设备响应"""
        device = DeviceResponse(
            id=1,
            device_id="device-001",
            device_name="我的电脑",
            created_at=datetime.now()
        )
        assert device.device_id == "device-001"
    
    def test_device_without_name(self):
        """测试不带设备名"""
        device = DeviceResponse(id=1, device_id="device-001")
        assert device.device_name is None