"""Create the first super administrator without a repository/default password.

Run from ``backend`` with::

    python -m scripts.bootstrap_staff --username admin --display-name 超级管理员
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import re

from sqlalchemy import func, select

from core.security import hash_password_async
from database import async_session_maker
from models import StaffRole, StaffStatus, StaffUser

USERNAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{2,49}$")


async def bootstrap(username: str, display_name: str, password: str) -> None:
    username = username.strip().lower()
    display_name = display_name.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise SystemExit("用户名必须以字母开头，长度 3-50，仅含字母、数字、点、下划线或连字符")
    if not display_name:
        raise SystemExit("显示名称不能为空")
    if len(password) < 10:
        raise SystemExit("密码至少需要 10 个字符")

    async with async_session_maker() as db:
        count_result = await db.execute(select(func.count(StaffUser.id)))
        if int(count_result.scalar() or 0) > 0:
            raise SystemExit("staff_users 已有账号；请由超级管理员在后台创建或恢复账号")
        db.add(
            StaffUser(
                username=username,
                display_name=display_name,
                password_hash=await hash_password_async(password),
                role=StaffRole.SUPER_ADMIN,
                status=StaffStatus.ACTIVE,
                token_version=1,
                force_password_reset=False,
            )
        )
        await db.commit()
    print(f"已创建首个超级管理员: {username}")


def main() -> None:
    parser = argparse.ArgumentParser(description="创建首个后台超级管理员")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--display-name", default="超级管理员")
    args = parser.parse_args()
    password = getpass.getpass("新密码（至少 10 个字符）: ")
    confirmation = getpass.getpass("再次输入新密码: ")
    if password != confirmation:
        raise SystemExit("两次密码输入不一致")
    asyncio.run(bootstrap(args.username, args.display_name, password))


if __name__ == "__main__":
    main()
