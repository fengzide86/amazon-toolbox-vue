"""
1.5 验收测试数据创建脚本
"""
import sqlite3
import json
from datetime import datetime, timedelta

DB_PATH = "C:/Users/冯伟豪/AppData/Roaming/AmazonToolbox/toolbox.db"

def setup_test_data():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. 创建套餐
    print("=== 创建套餐 ===")
    
    # 套餐1: 标准套餐（包含所有工具）
    cursor.execute("""
        INSERT INTO plans (name, price, duration_days, features, status, code_prefix, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("标准套餐", 99.0, 30, json.dumps({"allowed_tools": []}), "active", "STD", 1))
    standard_plan_id = cursor.lastrowid
    print(f"创建标准套餐 ID: {standard_plan_id}")
    
    # 套餐2: 基础套餐（不包含 fba_agl）
    cursor.execute("""
        INSERT INTO plans (name, price, duration_days, features, status, code_prefix, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("基础套餐", 49.0, 30, json.dumps({"allowed_tools": ["register", "logistics_template", "listing"]}), "active", "BAS", 2))
    basic_plan_id = cursor.lastrowid
    print(f"创建基础套餐 ID: {basic_plan_id}")
    
    # 2. 创建授权码
    print("\n=== 创建授权码 ===")
    
    # 授权码1: 仅亚马逊
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-AMZ-001", standard_plan_id, "amazon", "competition", 1, 3, "active", 
          (datetime.now() + timedelta(days=30)).isoformat()))
    amz_code_id = cursor.lastrowid
    print(f"创建亚马逊授权码 ID: {amz_code_id}, Code: TEST-AMZ-001")
    
    # 授权码2: 仅速卖通
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-AE-001", standard_plan_id, "aliexpress", "competition", 1, 3, "active",
          (datetime.now() + timedelta(days=30)).isoformat()))
    ae_code_id = cursor.lastrowid
    print(f"创建速卖通授权码 ID: {ae_code_id}, Code: TEST-AE-001")
    
    # 授权码3: 双平台
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-BOTH-001", standard_plan_id, "amazon,aliexpress", "competition", 1, 3, "active",
          (datetime.now() + timedelta(days=30)).isoformat()))
    both_code_id = cursor.lastrowid
    print(f"创建双平台授权码 ID: {both_code_id}, Code: TEST-BOTH-001")
    
    # 授权码4: 多席位（seat_limit=3）
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-SEAT-001", standard_plan_id, "amazon,aliexpress", "competition", 3, 5, "active",
          (datetime.now() + timedelta(days=30)).isoformat()))
    seat_code_id = cursor.lastrowid
    print(f"创建多席位授权码 ID: {seat_code_id}, Code: TEST-SEAT-001, seat_limit=3")
    
    # 授权码5: 基础套餐（不包含 fba_agl）
    cursor.execute("""
        INSERT INTO auth_codes (code, plan_id, platform_scope, scene_type, seat_limit, max_devices, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ("TEST-BASIC-001", basic_plan_id, "amazon", "competition", 1, 3, "active",
          (datetime.now() + timedelta(days=30)).isoformat()))
    basic_code_id = cursor.lastrowid
    print(f"创建基础套餐授权码 ID: {basic_code_id}, Code: TEST-BASIC-001")
    
    # 3. 创建工具配置
    print("\n=== 创建工具配置 ===")
    
    tool_configs = [
        # 亚马逊工具
        {"id": "amz_register", "platform_key": "amazon", "capability_key": "register", "name": "亚马逊新手快速注册", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "amz_register", "sort_order": 1},
        {"id": "amz_logistics", "platform_key": "amazon", "capability_key": "logistics_template", "name": "亚马逊物流模板标准版", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "amz_logistics", "sort_order": 2},
        {"id": "amz_listing", "platform_key": "amazon", "capability_key": "listing", "name": "亚马逊自动上品", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "amz_listing", "sort_order": 3},
        {"id": "amz_fba_agl", "platform_key": "amazon", "capability_key": "fba_agl", "name": "亚马逊 FBA/AGL", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "amz_fba_agl", "sort_order": 4},
        # 速卖通工具（不包含 fba_agl）
        {"id": "ae_register", "platform_key": "aliexpress", "capability_key": "register", "name": "速卖通新手快速注册", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "ae_register", "sort_order": 1},
        {"id": "ae_logistics", "platform_key": "aliexpress", "capability_key": "logistics_template", "name": "速卖通物流模板标准版", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "ae_logistics", "sort_order": 2},
        {"id": "ae_listing", "platform_key": "aliexpress", "capability_key": "listing", "name": "速卖通自动上品", "status": "online", "release_status": "available", "launch_mode": "local_script", "script_key": "ae_listing", "sort_order": 3},
    ]
    
    cursor.execute("""
        INSERT OR REPLACE INTO settings (key, value, description)
        VALUES (?, ?, ?)
    """, ("tool_configs", json.dumps(tool_configs, ensure_ascii=False), "工具配置"))
    print(f"创建 {len(tool_configs)} 个工具配置")
    
    # 4. 创建 FAQ
    print("\n=== 创建 FAQ ===")
    
    faqs = [
        # 亚马逊 FAQ
        {"category": "使用教程", "title": "亚马逊自动上品失败怎么办", "content": "请检查商品标题、图片路径、价格字段是否完整。确保网络连接稳定。", "keywords": json.dumps(["上品", "失败", "亚马逊"], ensure_ascii=False), "priority": "high", "status": "active", "platform_key": "amazon", "capability_key": "listing"},
        {"category": "使用教程", "title": "亚马逊 FBA 发货流程", "content": "FBA 发货需要先在后台创建发货计划，然后打印标签，最后预约物流。", "keywords": json.dumps(["FBA", "发货", "亚马逊"], ensure_ascii=False), "priority": "high", "status": "active", "platform_key": "amazon", "capability_key": "fba_agl"},
        # 速卖通 FAQ
        {"category": "使用教程", "title": "速卖通自动上品失败怎么办", "content": "请检查商品信息是否完整，速卖通对商品描述有严格的要求。", "keywords": json.dumps(["上品", "失败", "速卖通"], ensure_ascii=False), "priority": "high", "status": "active", "platform_key": "aliexpress", "capability_key": "listing"},
        # 全平台通用 FAQ
        {"category": "授权说明", "title": "授权码如何激活", "content": "在登录页面输入授权码即可自动激活。每个授权码可以在多台设备上使用。", "keywords": json.dumps(["授权码", "激活", "登录"], ensure_ascii=False), "priority": "high", "status": "active", "platform_key": None, "capability_key": None},
    ]
    
    for faq in faqs:
        cursor.execute("""
            INSERT INTO knowledge_base (category, title, content, keywords, priority, status, platform_key, capability_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (faq["category"], faq["title"], faq["content"], faq["keywords"], faq["priority"], faq["status"], faq["platform_key"], faq["capability_key"]))
    
    print(f"创建 {len(faqs)} 条 FAQ")
    
    # 5. 创建测试用户和席位
    print("\n=== 创建测试用户和席位 ===")
    
    # 创建用户
    cursor.execute("""
        INSERT INTO users (name, phone, auth_code_id, device_id, device_name, total_seats)
        VALUES (?, ?, ?, ?, ?, ?)
    """, ("测试用户", "13800138000", amz_code_id, "test-device-001", "测试设备", 1))
    user_id = cursor.lastrowid
    print(f"创建测试用户 ID: {user_id}")
    
    # 创建席位
    cursor.execute("""
        INSERT INTO auth_seats (auth_code_id, user_id, device_id, device_name, seat_no, status)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (amz_code_id, user_id, "test-device-001", "测试设备", 1, "active"))
    seat_id = cursor.lastrowid
    print(f"创建测试席位 ID: {seat_id}")
    
    # 创建设备
    cursor.execute("""
        INSERT INTO devices (auth_code_id, device_id, device_name)
        VALUES (?, ?, ?)
    """, (amz_code_id, "test-device-001", "测试设备"))
    device_id = cursor.lastrowid
    print(f"创建测试设备 ID: {device_id}")
    
    conn.commit()
    conn.close()
    
    print("\n=== 测试数据创建完成 ===")
    print(f"标准套餐 ID: {standard_plan_id}")
    print(f"基础套餐 ID: {basic_plan_id}")
    print(f"亚马逊授权码: TEST-AMZ-001 (ID: {amz_code_id})")
    print(f"速卖通授权码: TEST-AE-001 (ID: {ae_code_id})")
    print(f"双平台授权码: TEST-BOTH-001 (ID: {both_code_id})")
    print(f"多席位授权码: TEST-SEAT-001 (ID: {seat_code_id})")
    print(f"基础套餐授权码: TEST-BASIC-001 (ID: {basic_code_id})")
    print(f"测试用户 ID: {user_id}")
    print(f"测试席位 ID: {seat_id}")
    print(f"测试设备 ID: {device_id}")

if __name__ == "__main__":
    setup_test_data()