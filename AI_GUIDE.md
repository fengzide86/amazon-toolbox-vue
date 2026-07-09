# AI 协作指南

> 给 AI 的项目上下文。修改代码前必读。

## 项目是什么

亚马逊赛训效率工具箱 — Vue 3 + FastAPI + Electron 桌面应用，云端部署在阿里云 ECS。用户通过授权码登录使用工具，管理员通过后台管理授权码、订单、用户、分润。项目正在建设长期自动化能力：本地 Automation Runner 负责浏览器操作，云端 FastAPI 负责授权和工具控制。

## 技术架构

| 层 | 技术 | 关键文件 |
|---|------|---------|
| 前端 | Vue 3 + Vite + Vue Router (Hash模式) | `src/` |
| 后端 | Python FastAPI + SQLAlchemy (异步) | `backend/` |
| 桌面 | Electron + electron-updater + Node Runner + Playwright Core | `electron/` |
| 数据库 | MySQL (生产) / SQLite (开发) | `backend/database.py` |
| 云端 | 阿里云 ECS（当前过渡地址 `8.130.113.104:8000`） | Docker Compose / 历史 systemd 服务 `toolbox-backend` |
| 代码仓库 | GitHub | `https://github.com/fengzide86/amazon-toolbox-vue` |

## 当前架构与长期目标

### 当前过渡状态

- `.env.production` 当前连接 `http://localhost:8000`。
- Electron 打包版当前会启动内嵌 `toolbox-backend.exe`。
- 工具工作台使用 `<webview>` 显示真实网页，Node Runner 通过 Electron Embedded Browser Host 操作同一个 guest 页面；注册失败时才回退到独立 Playwright 浏览器。
- 云端服务器仍承担发布、后台和历史 API 服务。

### 长期目标架构

- **Vue**：只负责工作台、任务轨迹和结果展示。
- **Electron**：桌面安全壳、更新、凭据和本地进程管理。
- **Automation Runner（Node.js）**：本地独立进程，使用 Playwright 执行自动化，不调用 AI 时不消耗模型 Token。
- **FastAPI 云端控制面**：登录、授权、套餐、设备、工具版本、Launch Grant 和运行概要。
- **MySQL / Redis**：云端中央数据和一次性授权状态。
- 浏览器展示从 `<webview>` 迁移到经过验证的 `WebContentsView + CDP`，不稳定时改用 Playwright 独立 Chromium + Live View。

## 关键约定

1. **后端返回格式**：`{"success": true, "data": ..., "message": "..."}` — 前端 `api.get()` 自动提取 `data` 字段
2. **用户端 vs 管理员端**：`/api/feedback/my` 是用户接口，`/api/feedback` 是管理员接口，不要混用
3. **管理员 user_id=0**：不在 User 表中，认证逻辑有特殊处理（`dependencies.py` 直接放行）
4. **环境变量**：开发环境连接 localhost；生产环境目前仍是 localhost 过渡方案，完成控制面拆分后切换 HTTPS 云端 API
5. **Electron 生产环境**：当前会启动内嵌后端；长期只启动 Automation Runner，不分发完整业务后端
6. **JWT Token**：登录状态由 AuthService 管理；敏感凭据优先通过 Electron `safeStorage` 保存
7. **路由**：Hash 模式（`createWebHashHistory`），因为 Electron 用 `file://` 协议
8. **自动化边界**：Vue 不允许包含具体网站自动化逻辑，必须通过 TaskRun Store + Adapter + IPC 调用 Runner
9. **任务成功**：只有收到 `run.completed` 才能记录成功，打开网页不等于任务成功
10. **浏览器 Profile**：Runner 只使用应用数据目录下的独立 Profile，不允许读取用户日常 Chrome/Edge Profile
11. **Runner 依赖**：生产依赖使用 `playwright-core`，优先启动系统 Chrome、失败后尝试 Edge，不随安装包下载 Playwright Chromium
12. **启动授权**：Runner 启动前验证一次性 Launch Grant；重新运行必须重新申请，禁止复用 token 或把 token 写入日志/事件
13. **嵌入浏览器控制**：页面动作必须经过 `EmbeddedBrowserHost` 白名单；禁止把任意 JavaScript、任意 CDP 命令或 webContents ID 直接暴露给 Vue
14. **首个真实脚本**：`amazon.register.v1` 目前是只读页面巡检，只读取页面结构、标记区域和截图，不填写、不提交
15. **工具签名**：云端使用 Ed25519 私钥签署 canonical manifest；Runner 使用 `electron/tool-signing-config.cjs` 固定公钥验签，私钥禁止进入 Git 和客户端
16. **灰度与回滚**：`/api/tool-releases` 管理签名版本，按设备 ID 稳定哈希分桶；回滚只切换稳定版本，不重新打包客户端

## Git 工作流

- 生产分支 `main`，开发分支 `feature/xxx`，修复分支 `fix/xxx`
- 提交格式：`feat/fix/docs/refactor/test: 描述`
- 用户说"保存代码" → `git add . && git commit && git push`
- **代理配置**：Clash 代理 `http://127.0.0.1:7897`，git push 失败时配置：
  ```
  git config --global http.proxy http://127.0.0.1:7897
  git config --global https.proxy http://127.0.0.1:7897
  git push
  # 推送完成后取消代理
  git config --global --unset http.proxy
  git config --global --unset https.proxy
  ```

## 测试规范

- 改完代码必须跑测试：`检查.bat` 或 `npm run test:run` + `cd backend && pytest -v`
- 测试失败 → 修复 → 再跑 → 修不好就 `git reset` 回退
- ❌ 不要猜问题，让用户提供报错信息

## 打包与发布

- Windows 客户端打包：`build.bat` 或 `一键发布.bat` → `release/`
- Docker 云端部署：`python docker_deploy.py`
- 客户端更新包上传：`python fast_upload.py ...`
- 云端目录：`/opt/amazon-toolbox`
- 更新包目录：`/opt/amazon-toolbox/backend/updates/`
- 部署凭据写入本地 `.env.deploy` 或 SSH Agent，模板见 `.env.deploy.example`
- Docker 服务密钥只保存在服务器 `/opt/amazon-toolbox/.env`，模板见 `.env.server.example`

## 自动化建设顺序

1. 安全基线与本文件校准。
2. 前端 TaskRun Store、Adapter 和统一事件协议。
3. 拆分云端控制面与本地执行面（代码边界已建立；待域名和 TLS 就绪后关闭内嵌 Python 后端）。
4. 本地 Node Automation Runner + Playwright + Profile（已完成进程、IPC、授权校验和事件协议接入）。
5. 首个只读真实工具和嵌入浏览器集成验证（已完成；后续逐个实现业务脚本）。
6. 工具包签名、版本回滚、灰度发布、测试和监控。

签名、灰度和回滚控制面已完成。生产私钥只保存在服务器 `.env`，客户端已固定对应公钥。历史后端测试迁移债务见 `backend/tests/README.md`。

自动化事件状态统一为：`idle → preparing → running ↔ paused → completed/failed/cancelled`。

## 新增 API 路由

- `/api/knowledge` — 知识库管理
- `/api/ai-chat` — AI 客服对话
- `/api/announcements` — 公告系统

## 构建验证

- `npm run build:verify` — 打包后自动检查 API 地址是否正确
-  vite.config.js 中不要用 `define` 块注入环境变量，Vite 原生处理 `.env`

## 常见坑

| 现象 | 原因 |
|------|------|
| 打包后白屏 | vite base 必须是 `'./'`，路由用 Hash 模式 |
| 用户端报 403 | 调用了管理员接口 |
| 数据库缺字段 | database.py 有自动迁移，但服务器需手动 ALTER TABLE |
| bat 脚本闪退 | 必须是 GBK/ASCII 编码。AI 编辑 bat 时只能用英文，禁止中文 |
| 输入框无法点击 | 不要用 `titleBarStyle: 'hiddenInset'`，用 `frame: true` |
| 打包后后端崩溃 | exe 必须通过 extraFiles 放到 asar 外面 |
| electron-updater 崩溃 | 必须放 dependencies，不能放 devDependencies |

## 敏感信息

- `.env` 文件不上传到 Git（已在 .gitignore 中排除）
- 服务器密码、数据库密码、JWT Secret、AI API Key 只能放在本地或服务器环境文件，禁止写入代码、示例或文档
- SSH 默认使用密钥和系统 `known_hosts`；禁止 `AutoAddPolicy()` 静默信任陌生服务器
- 已进入 Git 历史的密钥必须先轮换，再使用 `git-filter-repo` 清理历史
- 工具包必须经过哈希和数字签名校验，禁止下载任意 JS 后直接 `eval()`
- `.env.example` 提供配置模板供团队成员参考

### 2026-07-03 安全迁移状态

- 云端 SSH 已切换为 ED25519 Key，密码登录已关闭。
- 数据库 root、应用数据库账号、JWT Secret 和管理员登录密码已轮换。
- 云端后端已改用独立数据库应用账号，不再使用数据库 root。
- 旧 AI API Key 已从服务器停用，等待在供应商控制台撤销并替换。
- Git 历史中的旧服务器密码已失效；历史重写需等当前未提交工作形成安全检查点后执行。

## 维护规则

**此文件由用户维护，AI 修改必须遵守以下规则：**

1. **禁止主动修改** — AI 不得自行修改此文件，无论任何理由
2. **修改前必须申请** — 如需更新，AI 必须先向用户说明：
   - 要修改什么内容
   - 为什么要修改
   - 修改后的效果
3. **获得明确同意** — 用户明确说"可以改"或"同意"后才能修改
4. **修改后需确认** — 修改完成后，告知用户修改了什么，用户有异议立即回退
5. **bat 文件编辑规则** — AI 修改 `.bat` 文件时必须遵守：
   - **只能用英文/ASCII 字符**：所有 echo、注释、提示信息必须用英文，禁止使用中文
   - **禁止 UTF-8 BOM**：write_to_file 保存后不能带 BOM 头
   - **修改后提醒用户**：告知用户 bat 文件已修改，如遇闪退需检查编码
   - 涉及的 bat 文件：`一键启动.bat`、`一键发布.bat`、`build.bat`、`检查.bat`、`测试.bat`、`保存.bat`、`backend/start.bat`
