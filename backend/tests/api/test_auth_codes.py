"""
授权码接口测试 - 重点测试 SVIP 前缀功能
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Plan, AuthCode


async def seed_plans(db_session: AsyncSession):
    """创建测试套餐"""
    plans = [
        Plan(name="基础套餐", price=99, duration_days=30, status="active", code_prefix=None),
        Plan(name="SVIP套餐", price=999, duration_days=365, status="active", code_prefix="SVIP"),
    ]
    for p in plans:
        db_session.add(p)
    await db_session.commit()
    return plans


@pytest.mark.asyncio
class TestBatchGenerateAuthCodes:
    """批量生成授权码"""

    async def test_generate_with_prefix(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """有 code_prefix 的套餐生成带前缀的授权码"""
        plans = await seed_plans(db_session)
        svip_plan = plans[1]

        resp = await client.post("/api/auth-codes/batch-generate", json={
            "plan_id": svip_plan.id,
            "count": 3,
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["codes"]) == 3
        for code in data["codes"]:
            assert code.startswith("SVIP-"), f"授权码 {code} 应以 SVIP- 开头"

    async def test_generate_without_prefix(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """无 code_prefix 的套餐使用套餐名作为前缀"""
        plans = await seed_plans(db_session)
        basic_plan = plans[0]

        resp = await client.post("/api/auth-codes/batch-generate", json={
            "plan_id": basic_plan.id,
            "count": 2,
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["codes"]) == 2
        for code in data["codes"]:
            assert code.startswith("基础套餐-"), f"授权码 {code} 应以套餐名开头"

    async def test_generate_code_format(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """授权码格式: 前缀-MMDD-随机6位"""
        plans = await seed_plans(db_session)
        svip_plan = plans[1]

        resp = await client.post("/api/auth-codes/batch-generate", json={
            "plan_id": svip_plan.id,
            "count": 1,
        }, headers=auth_headers)
        code = resp.json()["codes"][0]
        parts = code.split("-")
        assert len(parts) == 3
        assert parts[0] == "SVIP"
        assert len(parts[1]) == 4  # MMDD
        assert len(parts[2]) == 6  # 随机6位

    async def test_generate_requires_admin(self, client: AsyncClient, db_session: AsyncSession):
        """批量生成需要管理员权限"""
        plans = await seed_plans(db_session)
        resp = await client.post("/api/auth-codes/batch-generate", json={
            "plan_id": plans[0].id,
            "count": 1,
        })
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestPlanCodePrefix:
    """套餐 code_prefix 字段"""

    async def test_plan_has_code_prefix(self, client: AsyncClient, db_session: AsyncSession):
        """套餐响应包含 code_prefix"""
        plans = await seed_plans(db_session)
        resp = await client.get("/api/plans")
        assert resp.status_code == 200
        data = resp.json()
        svip = next(p for p in data if p["price"] == 999)
        assert svip["code_prefix"] == "SVIP"

    async def test_plan_null_prefix(self, client: AsyncClient, db_session: AsyncSession):
        """无前缀的套餐 code_prefix 为 null"""
        plans = await seed_plans(db_session)
        resp = await client.get("/api/plans")
        data = resp.json()
        basic = next(p for p in data if p["price"] == 99)
        assert basic["code_prefix"] is None