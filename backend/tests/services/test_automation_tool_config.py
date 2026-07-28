from domains.catalog.seed_service import default_tool_configs, ensure_tool_runtime_fields, restore_new_default_tools
from domains.catalog.tool_config import force_demo_only_tool_configs, normalize_tool_config


def test_live_tool_runtime_survives_seed_field_upgrade() -> None:
    tools = [{
        "id": "tool_listing_script",
        "capability_key": "listing_script",
        "availability": "live_beta",
        "supports_live_single": True,
        "supports_live_batch": True,
        "script_key": "amazon.listing_script.v1",
        "target_url": "https://training.idtrade.cn/listing/create",
        "requires_signature": True,
    }]

    changed = ensure_tool_runtime_fields(tools)

    assert changed is True  # version/protocol defaults were added
    assert tools[0]["availability"] == "live_beta"
    assert tools[0]["script_key"] == "amazon.listing_script.v1"
    assert tools[0]["target_url"] == "https://training.idtrade.cn/listing/create"
    assert tools[0]["supports_live_single"] is True
    assert tools[0]["requires_signature"] is True


def test_single_input_schema_is_normalized_without_credentials() -> None:
    tool = normalize_tool_config({
        "id": "listing",
        "name": "自动上品",
        "availability": "live",
        "supports_live_single": True,
        "script_key": "amazon.listing_script.v1",
        "target_url": "https://training.idtrade.cn/listing/create",
        "single_input_schema": [
            {"key": "sku", "label": "SKU", "type": "text", "required": True},
            {"key": "price", "label": "售价", "type": "number", "required": True},
            {"key": "password", "label": "密码", "type": "text", "required": True},
        ],
    })

    assert [field["key"] for field in tool["single_input_schema"]] == ["sku", "price"]
    assert tool["target_url"] == "https://training.idtrade.cn/listing/create"
    assert tool["supports_live_single"] is True


def test_demo_boundary_still_removes_live_destination_and_capabilities() -> None:
    tools = force_demo_only_tool_configs([{
        "id": "listing",
        "capability_key": "listing_script",
        "availability": "live",
        "supports_live_single": True,
        "supports_live_batch": True,
        "target_url": "https://training.idtrade.cn/listing/create",
    }])

    assert tools[0]["availability"] == "demo_only"
    assert tools[0]["supports_live_single"] is False
    assert tools[0]["supports_live_batch"] is False
    assert tools[0]["target_url"] == ""


def test_new_replenishment_tool_is_available_and_restored_without_overwriting_existing_tools() -> None:
    defaults = default_tool_configs()
    replenishment = next(tool for tool in defaults if tool["id"] == "tool_replenishment")
    assert replenishment["single_input_schema"]
    assert replenishment["supports_demo_batch"] is True

    existing = [{"id": "custom_tool", "name": "自定义工具"}]
    assert restore_new_default_tools(existing) is True
    assert existing[0] == {"id": "custom_tool", "name": "自定义工具"}
    assert sum(tool.get("id") == "tool_replenishment" for tool in existing) == 1
    assert restore_new_default_tools(existing) is False
