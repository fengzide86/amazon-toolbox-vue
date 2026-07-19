from domains.catalog.seed_service import (
    DEFAULT_REGISTER_TOOL,
    default_tool_configs,
    ensure_tool_runtime_fields,
    upgrade_default_tool_configs,
)


def test_upgrade_default_register_tool_keeps_original_product_name():
    tools = [
        {
            "id": "tool_reg_newbie",
            "name": "新手快速注册工具",
            "description": "一键完成亚马逊新手店铺注册流程",
            "platform_key": "amazon",
            "capability_key": "register",
        }
    ]

    changed = upgrade_default_tool_configs(tools)

    assert changed is True
    assert tools[0]["name"] == "新手快速注册工具"
    assert tools[0]["script_key"] == "demo.register_walkthrough_v1"
    assert tools[0]["target_url"] == ""
    assert tools[0]["availability"] == "demo_only"
    assert tools[0]["description"] == DEFAULT_REGISTER_TOOL["description"]


def test_upgrade_legacy_default_tool_names_fill_ids_and_runtime_fields():
    tools = [
        {
            "name": "物流模板标准版",
            "module": "物流模块",
            "status": "online",
        }
    ]

    changed = upgrade_default_tool_configs(tools)
    runtime_changed = ensure_tool_runtime_fields(tools)

    assert changed is True
    assert runtime_changed is False
    assert tools[0]["id"] == "tool_logistics_standard"
    assert tools[0]["platform_key"] == "amazon"
    assert tools[0]["capability_key"] == "logistics_standard"
    assert tools[0]["script_key"] == "demo.logistics_standard_walkthrough_v1"
    assert tools[0]["target_url"] == ""


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

    changed = upgrade_default_tool_configs(tools)

    assert changed is False
    assert tools[0]["name"] == "我的自定义注册工具"
    assert tools[0]["script_key"] == "amazon.custom-register.v1"


def test_ensure_tool_runtime_fields_keeps_register_script_key():
    tools = [dict(DEFAULT_REGISTER_TOOL)]

    changed = ensure_tool_runtime_fields(tools)

    assert changed is False
    assert tools[0]["script_key"] == "demo.register_walkthrough_v1"


def test_default_tool_configs_include_register_tool():
    tools = default_tool_configs()
    register_tool = next(item for item in tools if item["id"] == "tool_reg_newbie")

    assert len(tools) >= 10
    assert register_tool["name"] == "新手快速注册工具"
    assert register_tool["script_key"] == "demo.register_walkthrough_v1"
    assert register_tool["target_url"] == ""
    assert register_tool["availability"] == "demo_only"
    assert register_tool["supports_live_single"] is False
