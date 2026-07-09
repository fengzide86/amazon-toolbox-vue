import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx import AsyncClient

from core.config import settings


def configure_signing_key(monkeypatch):
    private = Ed25519PrivateKey.generate()
    private_raw = private.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_raw = private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    monkeypatch.setattr(settings, "TOOL_SIGNING_PRIVATE_KEY_B64", base64.b64encode(private_raw).decode())
    monkeypatch.setattr(settings, "TOOL_SIGNING_PUBLIC_KEY_B64", base64.b64encode(public_raw).decode())


@pytest.mark.asyncio
async def test_release_publish_and_rollback_flow(client: AsyncClient, auth_headers: dict, monkeypatch):
    configure_signing_key(monkeypatch)
    for version in ["1.0.0", "1.1.0"]:
        response = await client.post("/api/tool-releases", headers=auth_headers, json={
            "tool_id": "tool_register",
            "version": version,
            "script_key": "amazon.register.v1",
            "artifact_sha256": version.replace(".", "") * 21 + "0",
        })
        assert response.status_code == 200
        assert response.json()["data"]["signature"]

    response = await client.post(
        "/api/tool-releases/tool_register/1.0.0/publish",
        headers=auth_headers,
        json={"channel": "stable"},
    )
    assert response.status_code == 200

    response = await client.post(
        "/api/tool-releases/tool_register/1.1.0/publish",
        headers=auth_headers,
        json={"channel": "canary", "rollout_percentage": 25},
    )
    assert response.json()["data"]["rollout_percentage"] == 25

    response = await client.post(
        "/api/tool-releases/tool_register/rollback",
        headers=auth_headers,
        json={"target_version": "1.0.0"},
    )
    assert response.json()["data"]["channel"] == "stable"
    assert response.json()["data"]["status"] == "published"
