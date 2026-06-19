"""
Launch Token 验收测试数据创建脚本
创建 5 个新的测试授权码用于 launch-token 测试
"""
import sqlite3
import json
from datetime import datetime, timedelta

DB_PATH = "C:/Users/冯伟豪/AppData/Roaming/AmazonToolbox/toolbox.db"

def setup_launch_test_data():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("=== 创建 Launch Token 测试授权码 ===\n")
    
    # 1. TEST-LAUNCH-AMZ: 亚马逊标准套餐，用于正常通过测试
    cursor.execute("""
        INSERT OR REPLACE INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-LAUNCH-AMZ", 7, "amazon", "competition", 3, 3, "unused",
          (datetime.now() + timedelta(days=30)).isoformat()))
    print(f"[OK] 创建 TEST-LAUNCH-AMZ (亚马逊标准套餐, seat_limit=3, max_devices=3)")
    
    # 2. TEST-LAUNCH-AE: 速卖通标准套餐，用于速卖通测试
    cursor.execute("""
        INSERT OR REPLACE INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-LAUNCH-AE", 7, "aliexpress", "competition", 3, 3, "unused",
          (datetime.now() + timedelta(days=30)).isoformat()))
    print(f"[OK] 创建 TEST-LAUNCH-AE (速卖通标准套餐, seat_limit=3, max_devices=3)")
    
    # 3. TEST-NO-TOOL: 基础套餐（不包含 listing），用于套餐不包含工具测试
    cursor.execute("""
        INSERT OR REPLACE INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-NO-TOOL", 8, "amazon", "competition", 3, 3, "unused",
          (datetime.now() + timedelta(days=30)).isoformat()))
    print(f"[OK] 创建 TEST-NO-TOOL (基础套餐, 不包含 listing, seat_limit=3)")
    
    # 4. TEST-EXPIRED: 已过期授权码
    cursor.execute("""
        INSERT OR REPLACE INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-EXPIRED", 7, "amazon", "competition", 3, 3, "unused",
          (datetime.now() - timedelta(days=1)).isoformat()))
    print(f"[OK] 创建 TEST-EXPIRED (已过期, expires_at=昨天)")
    
    # 5. TEST-DEVICE-LIMIT: 设备限制测试（max_devices=1）
    cursor.execute("""
        INSERT OR REPLACE INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-DEVICE-LIMIT", 7, "amazon", "competition", 3, 1, "unused",
          (datetime.now() + timedelta(days=30)).isoformat()))
    print(f"[OK] 创建 TEST-DEVICE-LIMIT (max_devices=1, 用于设备超限测试)")
    
    conn.commit()
    conn.close()
    
    print("\n=== 测试数据创建完成 ===")
    print("授权码列表:")
    print("  1. TEST-LAUNCH-AMZ    - 亚马逊标准套餐 (正常通过)")
    print("  2. TEST-LAUNCH-AE     - 速卖通标准套餐 (速卖通测试)")
    print("  3. TEST-NO-TOOL       - 基础套餐 (套餐不包含工具)")
    print("  4. TEST-EXPIRED       - 已过期 (授权码过期测试)")
    print("  5. TEST-DEVICE-LIMIT  - 设备限制 (设备超限测试)")

if __name__ == "__main__":
    setup_launch_test_data()