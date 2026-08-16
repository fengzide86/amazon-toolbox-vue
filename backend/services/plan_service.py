"""Validated plan catalogue and explicit plan lifecycle transitions."""

import json
import re
from typing import Any

from fastapi import Request
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.cache import CacheKeys, cache
from core.exceptions import ConflictException, NotFoundException, ValidationException
from domains.access import normalize_entitlements, serialize_entitlements
from models import AuthCode, Order, Plan, PlanStatus


class PlanService:
    DISPLAY_FIELDS = frozenset({"name", "features", "sort_order"})
    COMMERCIAL_FIELDS = frozenset(
        {"price", "duration_days", "code_prefix", "product_type", "entitlements"}
    )

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_public(self, product_type: str = "consumer") -> dict:
        result = await self.db.execute(
            select(Plan)
            .where(Plan.status == PlanStatus.ACTIVE, Plan.product_type == product_type)
            .order_by(Plan.sort_order, Plan.id)
        )
        return {
            "success": True,
            "message": "ok",
            "data": [self.serialize(plan) for plan in result.scalars().all()],
        }

    async def list_admin(
        self,
        status_filter: str | None,
        page: int,
        page_size: int,
    ) -> dict:
        filters = []
        if status_filter:
            if status_filter not in PlanStatus.ALL:
                raise ValidationException("套餐状态无效")
            filters.append(Plan.status == status_filter)
        base = select(Plan).where(*filters)
        count_result = await self.db.execute(
            select(func.count()).select_from(base.order_by(None).subquery())
        )
        result = await self.db.execute(
            base.order_by(Plan.sort_order, Plan.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return {
            "success": True,
            "message": "ok",
            "data": [self.serialize(plan) for plan in result.scalars().all()],
            "page": page,
            "page_size": page_size,
            "total": int(count_result.scalar() or 0),
        }

    async def get_public(self, plan_id: int) -> dict:
        result = await self.db.execute(
            select(Plan).where(Plan.id == plan_id, Plan.status == PlanStatus.ACTIVE)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException("套餐不存在或未启用")
        return {"success": True, "message": "ok", "data": self.serialize(plan, detailed=True)}

    async def create(
        self,
        data: dict,
        actor: dict,
        request: Request,
    ) -> dict:
        product_type, entitlements = self._validate_product(data)
        plan = Plan(
            name=data["name"],
            price=data["price"],
            duration_days=data["duration_days"],
            features=data.get("features"),
            status=PlanStatus.DISABLED,
            code_prefix=data.get("code_prefix"),
            sort_order=data.get("sort_order", 0),
            product_type=product_type,
            entitlements=serialize_entitlements(entitlements, product_type),
        )
        self.db.add(plan)
        try:
            await self.db.flush()
            await self._audit(actor, request, "plan_create", plan, None, self.serialize(plan))
            await self.db.commit()
            await self.db.refresh(plan)
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("套餐名称已存在") from error
        await self._invalidate_cache(plan.id)
        return {"success": True, "message": "套餐已创建，默认处于禁用状态", "data": self.serialize(plan)}

    async def update(
        self,
        plan_id: int,
        data: dict,
        actor: dict,
        request: Request,
    ) -> dict:
        plan = await self._locked_plan(plan_id)
        if plan.status == PlanStatus.ARCHIVED:
            raise ConflictException("已归档套餐不可修改")
        if not data:
            raise ValidationException("没有可更新字段")
        if plan.status == PlanStatus.ACTIVE:
            forbidden = set(data) - self.DISPLAY_FIELDS
            if forbidden:
                raise ConflictException("启用中的套餐只能修改名称、展示说明和排序；请先禁用")

        before = self.serialize(plan)
        if self.COMMERCIAL_FIELDS.intersection(data):
            product_type, entitlements = self._validate_product(data, current=plan)
            plan.product_type = product_type
            plan.entitlements = serialize_entitlements(entitlements, product_type)
        for field in ("name", "price", "duration_days", "features", "code_prefix", "sort_order"):
            if field in data:
                setattr(plan, field, data[field])
        try:
            await self._audit(
                actor,
                request,
                "plan_update",
                plan,
                before,
                self.serialize(plan),
            )
            await self.db.commit()
            await self.db.refresh(plan)
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("套餐名称已存在") from error
        await self._invalidate_cache(plan.id)
        return {"success": True, "message": "套餐已更新", "data": self.serialize(plan)}

    async def transition(
        self,
        plan_id: int,
        action: str,
        actor: dict,
        request: Request,
    ) -> dict:
        targets = {
            "enable": PlanStatus.ACTIVE,
            "disable": PlanStatus.DISABLED,
            "archive": PlanStatus.ARCHIVED,
        }
        if action not in targets:
            raise ValidationException("套餐操作无效")
        plan = await self._locked_plan(plan_id)
        if plan.status == PlanStatus.ARCHIVED:
            raise ConflictException("已归档套餐为终态")
        target = targets[action]
        if action == "enable" and plan.status != PlanStatus.DISABLED:
            raise ConflictException("只有禁用套餐可以启用")
        if action == "disable" and plan.status != PlanStatus.ACTIVE:
            raise ConflictException("只有启用套餐可以禁用")
        if action == "archive":
            active_codes_result = await self.db.execute(
                select(func.count(AuthCode.id)).where(
                    AuthCode.plan_id == plan.id,
                    AuthCode.status.in_(["active", "unused"]),
                )
            )
            active_codes = int(active_codes_result.scalar() or 0)
            if active_codes:
                raise ConflictException(f"套餐仍有 {active_codes} 个可用授权码，不能归档")
        before = self.serialize(plan)
        plan.status = target
        await self._audit(
            actor,
            request,
            f"plan_{action}",
            plan,
            before,
            self.serialize(plan),
        )
        await self.db.commit()
        await self.db.refresh(plan)
        await self._invalidate_cache(plan.id)
        return {"success": True, "message": f"套餐已{ {'enable': '启用', 'disable': '禁用', 'archive': '归档'}[action] }", "data": self.serialize(plan)}

    async def stats(self, plan_id: int) -> dict:
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException("套餐不存在")
        code_result = await self.db.execute(
            select(
                func.count(AuthCode.id),
                func.sum(case((AuthCode.status == "active", 1), else_=0)),
                func.sum(case((AuthCode.status == "unused", 1), else_=0)),
                func.sum(case((AuthCode.status == "expired", 1), else_=0)),
            ).where(AuthCode.plan_id == plan_id)
        )
        total_codes, active_codes, unused_codes, expired_codes = code_result.one()
        order_result = await self.db.execute(
            select(func.count(Order.id), func.coalesce(func.sum(Order.amount), 0)).where(
                Order.plan_id == plan_id,
                Order.status == "paid",
            )
        )
        total_orders, revenue = order_result.one()
        return {
            "success": True,
            "message": "ok",
            "data": {
                "plan": self.serialize(plan),
                "codes": {
                    "total": total_codes or 0,
                    "active": active_codes or 0,
                    "unused": unused_codes or 0,
                    "expired": expired_codes or 0,
                },
                "orders": {"total": total_orders or 0, "revenue": float(revenue or 0)},
            },
        }

    async def _locked_plan(self, plan_id: int) -> Plan:
        result = await self.db.execute(
            select(Plan).where(Plan.id == plan_id).with_for_update()
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise NotFoundException("套餐不存在")
        return plan

    @staticmethod
    def _validate_product(data: dict, current: Plan | None = None) -> tuple[str, dict]:
        product_type = str(
            data.get("product_type", current.product_type if current else "consumer")
            or "consumer"
        ).lower()
        if product_type not in {"consumer", "business"}:
            raise ValidationException("产品类型无效")
        raw_entitlements: Any = data.get(
            "entitlements",
            current.entitlements if current else None,
        )
        entitlements = normalize_entitlements(raw_entitlements, product_type)
        if product_type == "business" and not (
            entitlements["batch_execution"] and entitlements["multi_account_workspace"]
        ):
            raise ValidationException("专业批量版必须同时开启批量执行和多账号工作台")
        return product_type, entitlements

    async def _audit(
        self,
        actor: dict,
        request: Request,
        action: str,
        plan: Plan,
        before: dict | None,
        after: dict,
    ) -> None:
        await log_admin_action(
            self.db,
            user_id=actor["staff_id"],
            user_name=actor["username"],
            action=action,
            target_type="plan",
            target_id=plan.id,
            detail={"role": actor["role"], "before": before, "after": after},
            request=request,
        )

    @staticmethod
    def serialize(plan: Plan, detailed: bool = False) -> dict:
        name = plan.name or ""
        plan_match = re.search(r"Y\d+", name, re.IGNORECASE)
        plan_code = plan_match.group(0).upper() if plan_match else None
        feature_text = plan.features or ""
        benefits: list = []
        allowed_tools: list = []
        if feature_text:
            try:
                parsed = json.loads(feature_text)
                if isinstance(parsed, dict):
                    benefits = parsed.get("benefits", []) or []
                    allowed_tools = parsed.get("allowed_tools", []) or []
                elif isinstance(parsed, list):
                    benefits = parsed
            except (ValueError, TypeError):
                benefits = [
                    item.strip()
                    for item in feature_text.replace("+", "\n").splitlines()
                    if item.strip()
                ]
        data = {
            "id": plan.id,
            "name": plan.name,
            "price": float(plan.price),
            "duration_days": plan.duration_days,
            "duration_label": f"{plan.duration_days} 天",
            "status": plan.status,
            "code_prefix": plan.code_prefix,
            "sort_order": plan.sort_order,
            "plan_code": plan_code,
            "benefits": benefits,
            "allowed_tools": allowed_tools,
            "is_recommended": plan_code == "Y199",
            "display_badge": "赛期主推" if plan_code == "Y199" else ("全程服务" if plan_code == "Y999" else None),
            "features": plan.features,
            "product_type": plan.product_type or "consumer",
            "entitlements": normalize_entitlements(plan.entitlements, plan.product_type or "consumer"),
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
        }
        if detailed:
            data["updated_at"] = plan.updated_at.isoformat() if plan.updated_at else None
        return data

    @staticmethod
    async def _invalidate_cache(plan_id: int) -> None:
        await cache.delete(CacheKeys.PLANS_LIST)
        await cache.delete(CacheKeys.plan_detail(plan_id))
        await cache.delete_pattern("plans:*")
