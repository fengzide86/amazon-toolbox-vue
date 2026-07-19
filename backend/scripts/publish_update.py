"""Stage and publish a desktop update from a trusted server shell.

This is the audited SSH-side equivalent of the super-admin upload screen. It
never creates or resets a staff account; an existing active super administrator
is required and is recorded as the actor for both audit entries.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select

from core.audit import log_admin_action
from database import async_session_maker, engine
from domains.updates.service import UpdateReleaseService, get_update_releases_dir
from models import StaffRole, StaffStatus, StaffUser


def _snapshot(release: dict[str, object] | None) -> dict[str, object] | None:
    if release is None:
        return None
    return {
        "version": release.get("version"),
        "status": release.get("status"),
        "is_latest": release.get("is_latest"),
        "files": release.get("files", []),
    }


async def _active_super_admin(username: str | None) -> StaffUser:
    async with async_session_maker() as db:
        query = select(StaffUser).where(
            StaffUser.role == StaffRole.SUPER_ADMIN,
            StaffUser.status == StaffStatus.ACTIVE,
        )
        if username:
            query = query.where(StaffUser.username == username)
        result = await db.execute(query.order_by(StaffUser.id).limit(1))
        staff = result.scalar_one_or_none()
        if staff is None:
            raise RuntimeError("No active super administrator is available for release audit")
        db.expunge(staff)
        return staff


async def _write_audit(
    staff: StaffUser,
    *,
    action: str,
    version: str,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
) -> None:
    async with async_session_maker() as db:
        await log_admin_action(
            db,
            user_id=staff.id,
            user_name=staff.username,
            action=action,
            target_type="update_release",
            target_id=version,
            detail={
                "role": staff.role,
                "before": _snapshot(before),
                "after": _snapshot(after),
                "reason": "trusted_server_shell_release",
            },
        )
        await db.commit()


async def publish(
    version: str,
    artifact_paths: list[Path],
    *,
    username: str | None,
) -> dict[str, object]:
    staff = await _active_super_admin(username)
    service = UpdateReleaseService(get_update_releases_dir())

    uploads: list[UploadFile] = []
    try:
        for artifact_path in artifact_paths:
            resolved = artifact_path.resolve(strict=True)
            uploads.append(UploadFile(file=resolved.open("rb"), filename=resolved.name))
        staged = await service.stage(version, uploads)
    finally:
        for upload in uploads:
            await upload.close()

    await _write_audit(
        staff,
        action="stage_update_release",
        version=version,
        before=None,
        after=staged,
    )
    published = service.publish(version)
    await _write_audit(
        staff,
        action="publish_update_release",
        version=version,
        before=staged,
        after=published,
    )
    return published


async def resume_staged(version: str, *, username: str | None) -> dict[str, object]:
    """Finish a release whose files were staged before an audit write failed."""
    staff = await _active_super_admin(username)
    service = UpdateReleaseService(get_update_releases_dir())
    staged = next(
        (
            release
            for release in service.list_releases()
            if release.get("version") == version and release.get("status") == "staged"
        ),
        None,
    )
    if staged is None:
        raise RuntimeError(f"No staged release is available for v{version}")

    await _write_audit(
        staff,
        action="stage_update_release",
        version=version,
        before=None,
        after=staged,
    )
    published = service.publish(version)
    await _write_audit(
        staff,
        action="publish_update_release",
        version=version,
        before=staged,
        after=published,
    )
    return published


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit and publish an internal desktop update")
    parser.add_argument("version")
    parser.add_argument("artifacts", nargs="*", type=Path)
    parser.add_argument("--staff-username", default=None)
    parser.add_argument(
        "--resume-staged",
        action="store_true",
        help="publish files already staged by an interrupted audited release",
    )
    args = parser.parse_args()
    if args.resume_staged and args.artifacts:
        parser.error("artifacts cannot be supplied with --resume-staged")
    if not args.resume_staged and not args.artifacts:
        parser.error("at least one artifact is required unless --resume-staged is used")
    return args


if __name__ == "__main__":
    args = parse_args()

    async def _run() -> dict[str, object]:
        try:
            if args.resume_staged:
                return await resume_staged(args.version, username=args.staff_username)
            return await publish(args.version, args.artifacts, username=args.staff_username)
        finally:
            await engine.dispose()

    result = asyncio.run(_run())
    print(json.dumps(_snapshot(result), ensure_ascii=False))
