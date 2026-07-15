import base64
import hashlib
import io

import pytest
import yaml
from fastapi import HTTPException, UploadFile

from domains.updates.service import UpdateReleaseService


def upload(name: str, content: bytes) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(content))


@pytest.mark.asyncio
async def test_stage_then_publish_places_manifest_last(tmp_path):
    service = UpdateReleaseService(tmp_path / "updates")
    installer = b"signed-installer-placeholder"
    digest = base64.b64encode(hashlib.sha512(installer).digest()).decode("ascii")
    manifest = yaml.safe_dump({
        "version": "1.8.0",
        "files": [{"url": "AmazonToolbox Setup 1.8.0.exe", "sha512": digest, "size": len(installer)}],
        "path": "AmazonToolbox Setup 1.8.0.exe",
        "sha512": digest,
    }).encode()

    staged = await service.stage("1.8.0", [
        upload("AmazonToolbox Setup 1.8.0.exe", installer),
        upload("latest.yml", manifest),
    ])
    assert staged["version"] == "1.8.0"
    assert staged["status"] == "staged"
    assert not (tmp_path / "updates" / "latest.yml").exists()

    published = service.publish("1.8.0")
    assert published["status"] == "published"
    assert (tmp_path / "updates" / "AmazonToolbox Setup 1.8.0.exe").read_bytes() == installer
    assert yaml.safe_load((tmp_path / "updates" / "latest.yml").read_text())["version"] == "1.8.0"


@pytest.mark.asyncio
async def test_stage_rejects_manifest_hash_mismatch(tmp_path):
    service = UpdateReleaseService(tmp_path / "updates")
    manifest = yaml.safe_dump({
        "version": "1.8.0",
        "files": [{"url": "setup.exe", "sha512": "wrong", "size": 3}],
    }).encode()
    with pytest.raises(HTTPException) as error:
        await service.stage("1.8.0", [upload("setup.exe", b"abc"), upload("latest.yml", manifest)])
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_stage_rejects_path_traversal(tmp_path):
    service = UpdateReleaseService(tmp_path / "updates")
    with pytest.raises(HTTPException):
        await service.stage("1.8.0", [upload("../setup.exe", b"abc")])
