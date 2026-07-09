# 后端测试状态

当前 API、模型、Schema、安全、AI 兼容层和自动化发布链路测试可作为有效回归集。

以下历史测试仍针对重构前的同步 Service/Cache 接口和旧字段（如 `User.username`），不能代表当前生产接口：

- `core/test_cache.py`
- `core/test_config.py` 中旧 `Config` 常量断言
- `services/test_dashboard_service.py`
- `services/test_feedback_service.py`
- `services/test_order_service.py`
- `services/test_plan_service.py`
- `services/test_user_service.py`

全量运行会明确暴露这些迁移债务，禁止通过全局 skip 或修改 pytest 默认收集范围来伪装通过。新代码必须运行对应 API 测试和自身服务测试。
