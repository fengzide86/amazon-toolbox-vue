from services.seed_service import (
    READ_ONLY_REGISTER_TOOL,
    ensure_tool_runtime_fields,
    upgrade_default_read_only_tools,
)


def test_upgrade_default_register_tool_to_read_only_inspection():
    tools = [
        {
            "id": "tool_reg_newbie",
            "name": "新手快速注册工具",
            "description": "一键完成亚马逊新手店铺注册流程",
            "platform_key": "amazon",
            "capability_key": "register",
        }
    ]

    changed = upgrade_default_read_only_tools(tools)

    assert changed is True
    assert tools[0]["name"] == "亚马逊注册页面巡检"
    assert tools[0]["script_key"] == "amazon.register.v1"
    assert tools[0]["target_url"] == "https://sellercentral.amazon.com/"
    assert tools[0]["description"] == READ_ONLY_REGISTER_TOOL["description"]


def test_upgrade_default_register_tool_keeps_custom_admin_tool():
    tools = [
        {
            "id": "tool_reg_newbie",
            "name": "我的自定义注册工具",
            "description": "自定义说明",
            "platform_key": "amazon",
            "capability_key": "custom_register",
            "script_key": "amazon.custom-register.v1",
        }
    ]

    changed = upgrade_default_read_only_tools(tools)

    assert changed is False
    assert tools[0]["name"] == "我的自定义注册工具"
    assert tools[0]["script_key"] == "amazon.custom-register.v1"


def test_ensure_tool_runtime_fields_keeps_read_only_script_key():
    tools = [dict(READ_ONLY_REGISTER_TOOL)]

    changed = ensure_tool_runtime_fields(tools)

    assert changed is False
    assert tools[0]["script_key"] == "amazon.register.v1"
