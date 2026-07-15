from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
from typing import TypedDict

import yaml
from fastapi import HTTPException, UploadFile

SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")
ALLOWED_SUFFIXES = {".exe": 300 * 1024 * 1024, ".blockmap": 20 * 1024 * 1024, ".yml": 256 * 1024}


class StagedFile(TypedDict):
    name: str
    size: int
    sha512: str


class UpdateReleaseService:
    def __init__(self, releases_dir: str | Path):
        self.releases_dir = Path(releases_dir).resolve()
        self.staging_dir = self.releases_dir / ".staging"
        self.releases_dir.mkdir(parents=True, exist_ok=True)
        self.staging_dir.mkdir(parents=True, exist_ok=True)

    async def stage(self, version: str, files: list[UploadFile]) -> dict[str, object]:
        self._validate_version(version)
        if not files:
            raise HTTPException(400, "请选择需要暂存的更新文件")
        target = (self.staging_dir / version).resolve()
        self._assert_within(target, self.staging_dir)
        temp = (self.staging_dir / f".{version}.uploading").resolve()
        self._assert_within(temp, self.staging_dir)
        if temp.exists():
            shutil.rmtree(temp)
        temp.mkdir(parents=True)

        staged: list[StagedFile] = []
        try:
            for upload in files:
                name = self._safe_name(upload.filename)
                suffix = Path(name).suffix.lower()
                if suffix not in ALLOWED_SUFFIXES:
                    raise HTTPException(400, f"不支持的更新文件：{name}")
                output = temp / name
                size, sha512 = await self._stream_upload(upload, output, ALLOWED_SUFFIXES[suffix])
                staged.append({"name": name, "size": size, "sha512": sha512})

            manifest_path = next((temp / item["name"] for item in staged if item["name"].lower() == "latest.yml"), None)
            installer = next((item for item in staged if item["name"].lower().endswith(".exe")), None)
            if not manifest_path or not installer:
                raise HTTPException(400, "暂存发布必须同时包含 latest.yml 和 Windows 安装包")
            manifest = self._validate_manifest(manifest_path, version, staged)
            metadata: dict[str, object] = {
                "version": version,
                "status": "staged",
                "files": staged,
                "manifest": manifest,
            }
            (temp / "stage.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
            if target.exists():
                shutil.rmtree(target)
            os.replace(temp, target)
            return metadata
        except Exception:
            if temp.exists():
                shutil.rmtree(temp)
            raise

    def publish(self, version: str) -> dict[str, object]:
        self._validate_version(version)
        source = (self.staging_dir / version).resolve()
        self._assert_within(source, self.staging_dir)
        metadata_path = source / "stage.json"
        if not metadata_path.exists():
            raise HTTPException(404, "暂存版本不存在")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        files = metadata.get("files") or []
        manifest_name = next((item["name"] for item in files if item["name"].lower() == "latest.yml"), None)
        if not manifest_name:
            raise HTTPException(409, "暂存版本缺少 latest.yml")

        # 安装包和 blockmap 先就位；manifest 最后原子替换，客户端不会看到半发布状态。
        for item in files:
            name = self._safe_name(item["name"])
            if name == manifest_name:
                continue
            shutil.copy2(source / name, self.releases_dir / name)
        manifest_temp = self.releases_dir / ".latest.yml.tmp"
        shutil.copy2(source / manifest_name, manifest_temp)
        os.replace(manifest_temp, self.releases_dir / "latest.yml")
        (source / "published.json").write_text(json.dumps({"version": version}, ensure_ascii=False), encoding="utf-8")
        return {"version": version, "status": "published", "files": files}

    def list_releases(self) -> list[dict[str, object]]:
        releases: list[dict[str, object]] = []
        for entry in sorted(self.staging_dir.iterdir(), reverse=True):
            metadata_path = entry / "stage.json" if entry.is_dir() else None
            if not metadata_path or not metadata_path.exists():
                continue
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["status"] = "published" if (entry / "published.json").exists() else "staged"
            releases.append(metadata)
        return releases

    def delete_staged(self, version: str) -> None:
        self._validate_version(version)
        target = (self.staging_dir / version).resolve()
        self._assert_within(target, self.staging_dir)
        if not target.exists():
            raise HTTPException(404, "暂存版本不存在")
        shutil.rmtree(target)

    async def legacy_upload(self, upload: UploadFile) -> dict[str, object]:
        name = self._safe_name(upload.filename)
        suffix = Path(name).suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(400, "只允许上传 .yml、.exe 或 .blockmap 文件")
        target = (self.releases_dir / name).resolve()
        self._assert_within(target, self.releases_dir)
        size, sha512 = await self._stream_upload(upload, target, ALLOWED_SUFFIXES[suffix])
        return {"filename": name, "size": size, "sha512": sha512}

    async def _stream_upload(self, upload: UploadFile, target: Path, limit: int) -> tuple[int, str]:
        digest = hashlib.sha512()
        size = 0
        with target.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    output.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(413, f"文件超过大小限制：{target.name}")
                digest.update(chunk)
                output.write(chunk)
        return size, base64.b64encode(digest.digest()).decode("ascii")

    def _validate_manifest(self, path: Path, version: str, files: list[StagedFile]) -> dict[str, object]:
        try:
            manifest = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, yaml.YAMLError) as error:
            raise HTTPException(400, "latest.yml 格式无效") from error
        if not isinstance(manifest, dict) or manifest.get("version") != version:
            raise HTTPException(400, "latest.yml 版本与暂存版本不一致")
        manifest_files = manifest.get("files")
        if not isinstance(manifest_files, list) or not manifest_files:
            raise HTTPException(400, "latest.yml 缺少文件清单")
        staged_by_name = {item["name"]: item for item in files}
        for item in manifest_files:
            if not isinstance(item, dict):
                raise HTTPException(400, "latest.yml 文件清单无效")
            name = self._safe_name(str(item.get("url") or ""))
            staged = staged_by_name.get(name)
            if not staged:
                raise HTTPException(400, f"latest.yml 引用了未暂存文件：{name}")
            if item.get("sha512") != staged["sha512"] or int(item.get("size") or -1) != staged["size"]:
                raise HTTPException(400, f"更新文件校验值不匹配：{name}")
        return manifest

    @staticmethod
    def _validate_version(version: str) -> None:
        if not SEMVER.fullmatch(version):
            raise HTTPException(400, "版本号必须使用 SemVer")

    @staticmethod
    def _safe_name(filename: str | None) -> str:
        if not filename:
            raise HTTPException(400, "文件名不能为空")
        name = os.path.basename(filename)
        if name != filename or name in {".", ".."} or any(character in name for character in ('/', '\\', '\0')):
            raise HTTPException(400, "更新文件名不安全")
        return name

    @staticmethod
    def _assert_within(path: Path, parent: Path) -> None:
        if path == parent or parent not in path.parents:
            raise HTTPException(400, "更新文件路径不安全")
