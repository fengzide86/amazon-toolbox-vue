"""测试所有新模块的导入是否正常"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

errors = []

# 1. 核心模块
try:
    print("[OK] core.cache")
except Exception as e:
    errors.append(f"core.cache: {e}")
    print(f"[FAIL] core.cache: {e}")

try:
    print("[OK] core.response")
except Exception as e:
    errors.append(f"core.response: {e}")
    print(f"[FAIL] core.response: {e}")

try:
    print("[OK] core.pagination")
except Exception as e:
    errors.append(f"core.pagination: {e}")
    print(f"[FAIL] core.pagination: {e}")

try:
    print("[OK] core.tasks")
except Exception as e:
    errors.append(f"core.tasks: {e}")
    print(f"[FAIL] core.tasks: {e}")

try:
    print("[OK] core.token_blacklist")
except Exception as e:
    errors.append(f"core.token_blacklist: {e}")
    print(f"[FAIL] core.token_blacklist: {e}")

try:
    print("[OK] core.logging")
except Exception as e:
    errors.append(f"core.logging: {e}")
    print(f"[FAIL] core.logging: {e}")

# 2. 数据库
try:
    print("[OK] database")
except Exception as e:
    errors.append(f"database: {e}")
    print(f"[FAIL] database: {e}")

# 3. 模型
try:
    print("[OK] models")
except Exception as e:
    errors.append(f"models: {e}")
    print(f"[FAIL] models: {e}")

# 4. 服务层
try:
    print("[OK] domains.auth.service")
except Exception as e:
    errors.append(f"domains.auth.service: {e}")
    print(f"[FAIL] domains.auth.service: {e}")

try:
    print("[OK] services.plan_service")
except Exception as e:
    errors.append(f"services.plan_service: {e}")
    print(f"[FAIL] services.plan_service: {e}")

try:
    print("[OK] services.dashboard_service")
except Exception as e:
    errors.append(f"services.dashboard_service: {e}")
    print(f"[FAIL] services.dashboard_service: {e}")

try:
    print("[OK] services.order_service")
except Exception as e:
    errors.append(f"services.order_service: {e}")
    print(f"[FAIL] services.order_service: {e}")

try:
    print("[OK] services.user_service")
except Exception as e:
    errors.append(f"services.user_service: {e}")
    print(f"[FAIL] services.user_service: {e}")

try:
    print("[OK] services.feedback_service")
except Exception as e:
    errors.append(f"services.feedback_service: {e}")
    print(f"[FAIL] services.feedback_service: {e}")

# 5. 路由
try:
    print("[OK] routers (auth/dashboard/plans/users/feedback)")
except Exception as e:
    errors.append(f"routers: {e}")
    print(f"[FAIL] routers: {e}")

# 6. 主应用
try:
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