"""测试所有新模块的导入是否正常"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

errors = []

# 1. 核心模块
try:
    from core.cache import cache, CacheKeys
    print("[OK] core.cache")
except Exception as e:
    errors.append(f"core.cache: {e}")
    print(f"[FAIL] core.cache: {e}")

try:
    from core.response import success_response, error_response, paginated_response, ErrorCodes
    print("[OK] core.response")
except Exception as e:
    errors.append(f"core.response: {e}")
    print(f"[FAIL] core.response: {e}")

try:
    from core.pagination import PaginationParams, PageInfo, PaginatedResult
    print("[OK] core.pagination")
except Exception as e:
    errors.append(f"core.pagination: {e}")
    print(f"[FAIL] core.pagination: {e}")

try:
    from core.tasks import task_manager, background_task, fire_and_forget
    print("[OK] core.tasks")
except Exception as e:
    errors.append(f"core.tasks: {e}")
    print(f"[FAIL] core.tasks: {e}")

try:
    from core.token_blacklist import token_blacklist, logout_manager
    print("[OK] core.token_blacklist")
except Exception as e:
    errors.append(f"core.token_blacklist: {e}")
    print(f"[FAIL] core.token_blacklist: {e}")

try:
    from core.logging import get_logger, set_request_id, get_request_id
    print("[OK] core.logging")
except Exception as e:
    errors.append(f"core.logging: {e}")
    print(f"[FAIL] core.logging: {e}")

# 2. 数据库
try:
    from database import check_db_health, get_db_stats
    print("[OK] database")
except Exception as e:
    errors.append(f"database: {e}")
    print(f"[FAIL] database: {e}")

# 3. 模型
try:
    from models import Plan, Order, User, Feedback, AuthCode, Device
    print("[OK] models")
except Exception as e:
    errors.append(f"models: {e}")
    print(f"[FAIL] models: {e}")

# 4. 服务层
try:
    from services.auth_service import AuthService
    print("[OK] services.auth_service")
except Exception as e:
    errors.append(f"services.auth_service: {e}")
    print(f"[FAIL] services.auth_service: {e}")

try:
    from services.plan_service import PlanService
    print("[OK] services.plan_service")
except Exception as e:
    errors.append(f"services.plan_service: {e}")
    print(f"[FAIL] services.plan_service: {e}")

try:
    from services.dashboard_service import DashboardService
    print("[OK] services.dashboard_service")
except Exception as e:
    errors.append(f"services.dashboard_service: {e}")
    print(f"[FAIL] services.dashboard_service: {e}")

try:
    from services.order_service import OrderService
    print("[OK] services.order_service")
except Exception as e:
    errors.append(f"services.order_service: {e}")
    print(f"[FAIL] services.order_service: {e}")

try:
    from services.user_service import UserService
    print("[OK] services.user_service")
except Exception as e:
    errors.append(f"services.user_service: {e}")
    print(f"[FAIL] services.user_service: {e}")

try:
    from services.feedback_service import FeedbackService
    print("[OK] services.feedback_service")
except Exception as e:
    errors.append(f"services.feedback_service: {e}")
    print(f"[FAIL] services.feedback_service: {e}")

# 5. 路由
try:
    from routers import auth, dashboard, plans, users, feedback
    print("[OK] routers (auth/dashboard/plans/users/feedback)")
except Exception as e:
    errors.append(f"routers: {e}")
    print(f"[FAIL] routers: {e}")

# 6. 主应用
try:
    from main import app
    print("[OK] main.app")
except Exception as e:
    errors.append(f"main: {e}")
    print(f"[FAIL] main: {e}")

# 汇总
print("\n" + "=" * 50)
if errors:
    print(f"失败: {len(errors)} 个模块")
    for err in errors:
        print(f"  - {err}")
    sys.exit(1)
else:
    print("全部模块导入成功!")
    sys.exit(0)