"""
E2E 测试数据准备脚本
创建独立的可重复运行的测试授权码用于 Playwright 验收测试
"""
import sqlite3
import json
from datetime import datetime, timedelta

DB_PATH = "C:/Users/冯伟豪/AppData/Roaming/AmazonToolbox/toolbox.db"

def cleanup_e2e_data(cursor, auth_code_ids):
    """清理 E2E 测试相关的旧数据"""
    if not auth_code_ids:
        return
    
    placeholders = ','.join(['?' for _ in auth_code_ids])
    
    # 1. 清理 launch_tokens
    cursor.execute(f"""
        DELETE FROM launch_tokens WHERE auth_code_id IN ({placeholders})
    """, auth_code_ids)
    print(f"  - 清理 launch_tokens: {cursor.rowcount} 条")
    
    # 2. 清理 auth_seats
    cursor.execute(f"""
        DELETE FROM auth_seats WHERE auth_code_id IN ({placeholders})
    """, auth_code_ids)
    print(f"  - 清理 auth_seats: {cursor.rowcount} 条")
    
    # 3. 清理 devices
    cursor.execute(f"""
        DELETE FROM devices WHERE auth_code_id IN ({placeholders})
    """, auth_code_ids)
    print(f"  - 清理 devices: {cursor.rowcount} 条")
    
    # 4. 清理 users (关联的测试用户)
    cursor.execute(f"""
        DELETE FROM users WHERE auth_code_id IN ({placeholders})
    """, auth_code_ids)
    print(f"  - 清理 users: {cursor.rowcount} 条")
    
    # 5. 清理 run_logs
    cursor.execute(f"""
        DELETE FROM run_logs WHERE auth_code_id IN ({placeholders})
    """, auth_code_ids)
    print(f"  - 清理 run_logs: {cursor.rowcount} 条")
    
    # 6. 清理 feedback
    cursor.execute(f"""
        DELETE FROM feedback WHERE user_id IN (
            SELECT id FROM users WHERE auth_code_id IN ({placeholders})
        )
    """, auth_code_ids)
    print(f"  - 清理 feedback: {cursor.rowcount} 条")


def get_existing_e2e_codes(cursor):
    """获取已存在的 E2E 测试授权码 ID"""
    cursor.execute("""
        SELECT id FROM auth_codes WHERE code IN ('TEST-E2E-AMZ', 'TEST-E2E-AE')
    """)
    return [row[0] for row in cursor.fetchall()]


def setup_e2e_test_data():
    """创建 E2E 测试数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("=== E2E 测试数据准备 ===\n")
    
    # 1. 获取已存在的 E2E 授权码 ID（用于清理）
    existing_ids = get_existing_e2e_codes(cursor)
    
    # 2. 清理旧数据
    if existing_ids:
        print("清理旧的 E2E 测试数据...")
        cleanup_e2e_data(cursor, existing_ids)
        
        # 删除旧的授权码
        cursor.execute("""
            DELETE FROM auth_codes WHERE code IN ('TEST-E2E-AMZ', 'TEST-E2E-AE')
        """)
        print(f"  - 清理 auth_codes: {cursor.rowcount} 条")
    
    # 3. 创建新的测试授权码
    print("\n创建新的 E2E 测试授权码...")
    
    expires_at = (datetime.now() + timedelta(days=30)).isoformat()
    
    # TEST-E2E-AMZ: 亚马逊平台测试
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-E2E-AMZ", 7, "amazon", "competition", 10, 10, "unused", expires_at))
    print(f"  [OK] TEST-E2E-AMZ (亚马逊, seat_limit=10, max_devices=10)")
    
    # TEST-E2E-AE: 速卖通平台测试
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-E2E-AE", 7, "aliexpress", "competition", 10, 10, "unused", expires_at))
    print(f"  [OK] TEST-E2E-AE (速卖通, seat_limit=10, max_devices=10)")
    
    conn.commit()
    conn.close()
    
    print("\n=== E2E 测试数据准备完成 ===")
    print("\n授权码列表:")
    print("  1. TEST-E2E-AMZ    - 亚马逊平台 (seat_limit=10)")
    print("  2. TEST-E2E-AE     - 速卖通平台 (seat_limit=10)")
    print("\n注意: 这些授权码不影响 TEST-LAUNCH-AMZ / TEST-LAUNCH-AE")


if __name__ == "__main__":
    setup_e2e_test_data()