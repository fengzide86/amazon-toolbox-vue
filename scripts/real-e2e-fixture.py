"""Own a disposable, loopback-only real API acceptance environment.

No dependency overrides, mocked authentication or production configuration is
used. The Node owner creates the marker and random secrets before this starts.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sqlite3
import sys
from pathlib import Path


def runtime_root() -> Path:
    root = Path(os.environ["KST_REAL_E2E_DIR"]).resolve()
    marker = root / ".kst-real-e2e-owned"
    if not marker.is_file() or marker.read_text(encoding="utf-8") != "kst-real-e2e-v1":
        raise RuntimeError("Refusing an environment not created by the real E2E owner")
    if Path(os.environ["DB_PATH"]).resolve() != root / "acceptance.sqlite3":
        raise RuntimeError("Database must belong to this isolated test directory")
    if os.environ.get("APP_ENV") != "test" or os.environ.get("DB_TYPE") != "sqlite":
        raise RuntimeError("Only explicitly isolated SQLite test environments are allowed")
    return root


async def seed(root: Path) -> None:
    if (root / "acceptance.sqlite3").exists():
        raise RuntimeError("Refusing to overwrite an existing database")
    from core.security import hash_password
    from database import async_session_maker, engine, init_db
    from domains.catalog import seed_initial_data
    from models import AuthCode, Plan, StaffRole, StaffStatus, StaffUser
    from sqlalchemy import select

    await init_db()
    await seed_initial_data()
    credentials = {
        "consumer": "E2E-C-" + secrets.token_hex(12),
        "business": "E2E-B-" + secrets.token_hex(12),
        "business_cancel": "E2E-X-" + secrets.token_hex(12),
        "staff_username": "real_e2e_operator",
        "staff_password": secrets.token_urlsafe(32),
    }
    async with async_session_maker() as db:
        plans = list((await db.execute(select(Plan))).scalars())
        consumer = next(p for p in plans if p.name.startswith("Y199"))
        business = next(p for p in plans if p.product_type == "business")
        for label in ("consumer", "business", "business_cancel"):
            db.add(AuthCode(
                code=credentials[label],
                plan_id=consumer.id if label == "consumer" else business.id,
                max_devices=5,
                seat_limit=5,
                status="unused",
                platform_scope="amazon,aliexpress",
                scene_type="competition",
            ))
        db.add(StaffUser(
            username=credentials["staff_username"],
            display_name="隔离验收运营",
            password_hash=hash_password(credentials["staff_password"]),
            role=StaffRole.SUPER_ADMIN,
            status=StaffStatus.ACTIVE,
            token_version=1,
            force_password_reset=False,
        ))
        await db.commit()
    (root / "credentials.json").write_text(json.dumps(credentials), encoding="utf-8")
    await engine.dispose()


def snapshot(root: Path) -> None:
    # Read-only inspection independently verifies the browser's writes. No
    # credentials, raw customer input or user/account identifiers are exported.
    database = sqlite3.connect((root / "acceptance.sqlite3").as_uri() + "?mode=ro", uri=True)
    database.row_factory = sqlite3.Row
    queries = {
        "runs": "SELECT status, completed_step_count, total_step_count FROM demo_runs",
        "batches": "SELECT id, status, row_count, queued_count, playing_count, played_count, skipped_count, error_count FROM demo_batches",
        "items": "SELECT batch_id, status, simulated_outcome FROM demo_batch_items",
        "expenses": "SELECT title, amount, status, renewal_id FROM expense_records",
        "occurrences": "SELECT status, expense_id FROM expense_renewal_occurrences",
        "attachments": "SELECT original_name, size_bytes FROM expense_attachments",
        "authorizations": "SELECT status FROM auth_codes WHERE code LIKE 'E2E-%'",
    }
    data: dict[str, object] = {
        key: [dict(row) for row in database.execute(query)] for key, query in queries.items()
    }
    data["live_run_count"] = database.execute("SELECT COUNT(*) FROM run_logs").fetchone()[0]
    data["live_batch_count"] = database.execute("SELECT COUNT(*) FROM automation_batches").fetchone()[0]
    data["device_count"] = database.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
    database.close()
    print(json.dumps(data, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "serve", "snapshot"))
    args = parser.parse_args()
    root = runtime_root()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    if args.action == "seed":
        asyncio.run(seed(root))
    elif args.action == "snapshot":
        snapshot(root)
    else:
        import uvicorn
        from fastapi.staticfiles import StaticFiles
        from main import app

        # Real routes precede static files, giving the browser same-origin API
        # traffic without a reverse-proxy mock or a public backend fallback.
        app.mount("/", StaticFiles(directory=root / "web", html=True), name="e2e-web")
        uvicorn.run(app, host="127.0.0.1", port=int(os.environ["KST_REAL_E2E_PORT"]), access_log=False)


if __name__ == "__main__":
    main()
