import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from core.config import settings
from services.freight_rate_service import (
    create_rate_draft,
    current_rate_release,
    publish_rate_release,
    rollback_rate_releases,
)
from services.tool_release_service import verify_manifest_signature


def key_pair():
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
    return base64.b64encode(private_raw).decode(), base64.b64encode(public_raw).decode()


def sample_pack(version="1.0.0"):
    return {
        "schemaVersion": 1,
        "resourceType": "freight-rate-pack",
        "id": "competition-freight",
        "version": version,
        "name": "赛训费率",
        "exchangeRateCnyPerUsd": 7,
        "sourceHash": "a" * 64,
        "rules": [{
            "carrierId": "epacket",
            "carrierName": "e邮宝",
            "serviceType": "epacket",
            "countryCode": "US",
            "countryName": "美国",
            "priority": 10,
            "maxWeightKg": 2,
            "minBillableWeightG": 1,
            "perKgCny": 60,
            "fixedFeeCny": 19,
        }],
    }


def test_rate_draft_validates_resource_type_and_hashes_artifact():
    draft = create_rate_draft(sample_pack(), "FreightTemplate.xlsx")
    assert draft["status"] == "draft"
    assert draft["manifest"]["resourceType"] == "freight-rate-pack"
    assert len(draft["manifest"]["artifactSha256"]) == 64

    invalid = sample_pack()
    invalid["resourceType"] = "adapter"
    with pytest.raises(ValueError):
        create_rate_draft(invalid)


def test_publish_and_rollback_sign_each_target(monkeypatch):
    private_key, public_key = key_pair()
    monkeypatch.setattr(settings, "TOOL_SIGNING_PRIVATE_KEY_B64", private_key)
    releases = [create_rate_draft(sample_pack("1.0.0")), create_rate_draft(sample_pack("1.1.0"))]

    latest = publish_rate_release(releases, "competition-freight", "1.1.0")
    assert latest["status"] == "published"
    assert verify_manifest_signature(latest["manifest"], latest["signature"], public_key)
    assert current_rate_release(releases)["version"] == "1.1.0"

    previous = rollback_rate_releases(releases, "competition-freight", "1.0.0")
    assert previous["status"] == "published"
    assert releases[1]["status"] == "retired"
    assert verify_manifest_signature(previous["manifest"], previous["signature"], public_key)
