import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_tool_release_api_is_disabled_in_internal_demo(
    client: AsyncClient,
    auth_headers: dict,
):
    for method, path, payload in [
        ("get", "/api/tool-releases", None),
        ("post", "/api/tool-releases", {"tool_id": "demo", "version": "1.0.0", "script_key": "demo"}),
        ("post", "/api/tool-releases/demo/1.0.0/publish", {}),
        ("post", "/api/tool-releases/demo/rollback", {"target_version": "1.0.0"}),
    ]:
        response = await client.request(method, path, headers=auth_headers, json=payload)
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "FEATURE_DISABLED"
