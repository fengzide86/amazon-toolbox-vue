# AI 协作指南

> 给 AI 的项目上下文。修改代码前必读。

## 项目是什么

亚马逊赛训效率工具箱 — Vue 3 + FastAPI + Electron 桌面应用，云端部署在阿里云 ECS。用户通过授权码登录使用工具，管理员通过后台管理授权码、订单、用户、分润。

## 技术架构

| 层 | 技术 | 关键文件 |
|---|------|---------|
| 前端 | Vue 3 + Vite + Vue Router (Hash模式) | `src/` |
| 后端 | Python FastAPI + SQLAlchemy (异步) | `backend/` |
| 桌面 | Electron + electron-updater | `electron/` |
| 数据库 | MySQL (生产) / SQLite (开发) | `backend/database.py` |
| 云端 | 阿里云 ECS `8.130.113.104:8000` | systemd 服务 `toolbox-backend` |
| 代码仓库 | GitHub | `https://github.com/fengzide86/amazon-toolbox-vue` |

## 关键约定

1. **后端返回格式**：`{"success": true, "data": ..., "message": "..."}` — 前端 `api.get()` 自动提取 `data` 字段
2. **用户端 vs 管理员端**：`/api/feedback/my` 是用户接口，`/api/feedback` 是管理员接口，不要混用
3. **管理员 user_id=0**：不在 User 表中，认证逻辑有特殊处理（`dependencies.py` 直接放行）
4. **环境变量**：`.env.development` 连 localhost，`.env.production` 连云端
5. **Electron 生产环境**：直接连云端，不启动本地后端，添加 `no-proxy-server` 绕过代理
6. **JWT Token**：登录后保存到 `localStorage('toolbox_token')`，每次请求自动带 `Authorization: Bearer`
7. **路由**：Hash 模式（`createWebHashHistory`），因为 Electron 用 `file://` 协议

## Git 工作流

### 用户日常操作（说人话即可）

| 用户说 | AI 执行 |
|--------|---------|
| "保存代码" / "提交代码" | `git add . && git commit -m "描述" && git push origin main` |
| "推送到 GitHub" | `git push origin main` |
| "看看改了什么" | `git status` 或 `git diff` |
| "看最近的提交" | `git log --oneline -10` |
| "改坏了，帮我恢复" | `git reset --hard HEAD~1` |
| "创建新功能分支" | `git checkout -b feature/xxx` |
| "切换到主分支" | `git checkout main` |
| "拉取最新代码" | `git pull origin main` |

### 分支策略

- `main` — 生产分支（稳定版本）
- `feature/xxx` — 新功能开发分支
- `fix/xxx` — Bug 修复分支

### 提交信息规范

使用 Conventional Commits 格式：
- `feat: 添加XXX功能` — 新功能
- `fix: 修复XXX问题` — Bug 修复
- `docs: 更新文档` — 文档修改
- `refactor: 重构XXX` — 代码重构
- `test: 添加XXX测试` — 测试相关

## 测试规范

### 改完代码必须跑测试

**流程：**
1. 改完代码
2. 运行测试（`检查.bat` 或手动运行）
3. 测试通过 → 本地验证 → 保存
4. 测试失败 → 根据报错修复 → 再跑测试
5. 修不好 → `git reset` 回退

### 运行测试

| 方式 | 命令 |
|------|------|
| 快捷脚本 | 双击 `检查.bat` |
| 前端测试 | `npm run test:run` |
| 后端测试 | `cd backend && pytest -v` |
| 覆盖率 | `npm run test:coverage` |

### 排查问题的正确方式

- ✅ 用户提供报错信息 → AI 根据报错定位
- ❌ AI 自己猜问题 → 容易陷入误区
- 改太久还没好 → 直接 `git reset` 回退重来

## 打包发布

### 打包（生成 .exe）
```
一键打包.bat → release/
```

### 发布后端（部署到服务器）
```
python deploy_to_server.py → 上传到阿里云 ECS → 自动重启服务
```

### 发布前端（上传安装包）
```
上传 release/ 到服务器 /opt/amazon-toolbox/backend/updates/
→ 用户打开软件自动收到更新提示
```

### 完整发布流程
1. 改代码 → 跑测试 → 保存代码（git commit + push）
2. 打包（一键打包.bat）
3. 发布后端（deploy_to_server.py）
4. 发布前端（上传 .exe 到服务器）

## 排查 Bug 的顺序

1. 查服务器日志：`journalctl -u toolbox-backend -n 50`
2. 查浏览器 F12 → Console 和 Network
3. 查相关代码文件（先看再改）
4. 改完后跑测试或验证日志

## 常见坑

| 现象 | 原因 |
|------|------|
| 打包后白屏 | vite base 必须是 `'./'`，路由用 Hash 模式 |
| 用户端报 403 | 调用了管理员接口 |
| 数据库缺字段 | database.py 有自动迁移，但服务器需手动 ALTER TABLE |
| bat 脚本闪退 | 必须是 GBK/ASCII 编码，不能 UTF-8 |
| 输入框无法点击 | 不要用 `titleBarStyle: 'hiddenInset'`，用 `frame: true` |
| 打包后后端崩溃 | exe 必须通过 extraFiles 放到 asar 外面 |
| electron-updater 崩溃 | 必须放 dependencies，不能放 devDependencies |

## 敏感信息

- `.env` 文件不上传到 Git（已在 .gitignore 中排除）
- 服务器密码由用户本地保管，不写入代码
- `.env.example` 提供配置模板供团队成员参考

## 维护规则

**此文件由用户维护，AI 不得自行修改。如需更新，告知用户确认。**
