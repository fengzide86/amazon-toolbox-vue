# 测试文档

亚马逊赛训效率工具箱 - 前后端测试指南

## 目录结构

```
├── backend/tests/              # 后端测试
│   ├── conftest.py            # pytest 配置和公共 fixtures
│   ├── test_models.py         # 数据模型测试
│   ├── test_schemas.py        # Pydantic Schema 测试
│   ├── test_security.py       # 安全模块测试
│   └── api/                   # API 集成测试
│       ├── test_auth.py       # 认证 API
│       ├── test_plans.py      # 套餐 API
│       ├── test_orders.py     # 订单 API
│       └── test_settings.py   # 系统设置 API
├── src/tests/                 # 前端测试
│   ├── setup.js              # 测试环境配置
│   ├── utils/
│   │   └── api.test.js       # API 工具测试
│   └── router/
│       └── index.test.js     # 路由配置测试
├── vitest.config.js           # Vitest 配置
└── .github/workflows/test.yml # CI/CD 测试工作流
```

## 快速开始

### 后端测试

```bash
# 进入后端目录
cd backend

# 安装测试依赖
pip install pytest pytest-asyncio httpx

# 运行所有测试
pytest

# 详细输出
pytest -v

# 运行特定测试文件
pytest tests/test_models.py

# 运行特定测试函数
pytest tests/test_models.py::TestPlanModel::test_create_plan

# 生成覆盖率报告
pip install pytest-cov
pytest --cov=. --cov-report=html
```

### 前端测试

```bash
# 安装测试依赖
npm install -D vitest @vitejs/plugin-vue jsdom

# 运行测试（watch 模式）
npm run test

# 运行测试（单次）
npm run test:run

# 生成覆盖率报告
npm run test:coverage
```

## 测试类型

### 1. 单元测试 (Unit Tests)

测试单个函数或类的逻辑，不依赖外部服务。

**后端示例：**
```python
# tests/test_security.py
def test_hash_password():
    password = "test_password"
    hashed = hash_password(password)
    assert hashed.startswith("$2b$")
```

**前端示例：**
```javascript
// src/tests/utils/api.test.js
it('应该发送 GET 请求', async () => {
  const result = await api.get('/api/test')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
```

### 2. 集成测试 (Integration Tests)

测试多个模块协作，包括数据库操作和 API 调用。

**后端示例：**
```python
# tests/api/test_auth.py
async def test_admin_login_success(client, db_session):
    setting = Setting(key="admin_password", value=hash_password("admin123"))
    db_session.add(setting)
    await db_session.commit()
    
    response = await client.post("/api/auth/admin-login", json={"password": "admin123"})
    assert response.json()["success"] is True
```

### 3. 端到端测试 (E2E Tests)

模拟真实用户操作，测试完整业务流程。（待实现）

## 测试最佳实践

### 命名规范

- 测试文件：`test_<模块名>.py` 或 `<模块名>.test.js`
- 测试类：`Test<功能名>`
- 测试函数：`test_<场景描述>`

### 测试结构 (AAA 模式)

```python
def test_create_plan():
    # Arrange (准备)
    plan_data = {"name": "测试套餐", "price": 99.00}
    
    # Act (执行)
    result = create_plan(plan_data)
    
    # Assert (断言)
    assert result["name"] == "测试套餐"
```

### Fixtures 使用

```python
# conftest.py 中定义公共 fixtures
@pytest.fixture
async def client(db_session):
    """测试用 HTTP 客户端"""
    ...

@pytest.fixture
async def admin_token(client):
    """管理员 Token"""
    ...

# 在测试中使用
async def test_create_plan(client, admin_token):
    response = await client.post("/api/plans", json={...}, headers={"Authorization": f"Bearer {admin_token}"})
```

## CI/CD 自动化测试

项目配置了 GitHub Actions 工作流，每次提交代码或创建 PR 时自动运行测试。

**工作流程：**
1. 触发条件：push 到 main/master/develop 或创建 PR
2. 运行后端测试（Python 3.11）
3. 运行前端测试（Node.js 18）
4. 生成覆盖率报告
5. 汇总测试结果

## 测试覆盖率

### 后端覆盖范围

| 模块 | 测试内容 | 用例数 |
|------|----------|--------|
| models.py | 数据模型 CRUD、关系、状态转换 | 21+ |
| schemas.py | 请求/响应数据验证 | 30+ |
| security.py | 密码哈希、JWT Token、CORS | 25+ |
| API auth | 登录、授权码验证、Token | 15+ |
| API plans | 套餐增删改查 | 10+ |
| API orders | 订单创建、更新、退款 | 10+ |
| API settings | 系统设置更新 | 8+ |

### 前端覆盖范围

| 模块 | 测试内容 | 用例数 |
|------|----------|--------|
| api.js | HTTP 方法、业务函数、错误处理 | 25+ |
| router | 路由定义、守卫逻辑、权限控制 | 10+ |

## 添加新测试

### 后端添加 API 测试

1. 在 `backend/tests/api/` 创建测试文件
2. 使用 `client` fixture 发送请求
3. 使用 `db_session` fixture 准备测试数据

```python
# backend/tests/api/test_new_feature.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

class TestNewFeature:
    @pytest.mark.asyncio
    async def test_new_endpoint(self, client: AsyncClient, db_session: AsyncSession):
        # 准备数据
        ...
        
        # 发送请求
        response = await client.get("/api/new-endpoint")
        
        # 验证结果
        assert response.status_code == 200
```

### 前端添加组件测试

1. 安装 `@vue/test-utils`
2. 在 `src/tests/` 创建测试文件

```javascript
// src/tests/components/NewComponent.test.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NewComponent from '@/components/NewComponent.vue'

describe('NewComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(NewComponent)
    expect(wrapper.text()).toContain('Hello')
  })
})
```

## 常见问题

### Q: 后端测试失败：数据库连接错误
A: 测试使用 SQLite 内存数据库，不需要额外配置。确保已安装 `aiosqlite`。

### Q: 前端测试失败：Cannot find module 'vitest'
A: 运行 `npm install -D vitest @vitejs/plugin-vue jsdom` 安装测试依赖。

### Q: 如何在本地模拟 CI 环境？
A: 运行以下命令：
```bash
# 后端
cd backend && pytest -v

# 前端
npm run test:run
```

### Q: 测试覆盖率低怎么办？
A: 添加更多测试用例，特别是边界条件和错误处理场景。

## 参考资源

- [pytest 文档](https://docs.pytest.org/)
- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [FastAPI 测试](https://fastapi.tiangolo.com/tutorial/testing/)