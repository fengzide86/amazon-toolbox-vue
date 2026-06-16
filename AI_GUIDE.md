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

## 打包发布

- 打包：`一键打包.bat` → `release/`
- 部署后端：`python deploy_to_server.py`
- 发布前端：上传 `release/` 到服务器 `/opt/amazon-toolbox/backend/updates/`

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
| bat 脚本闪退 | 必须是 GBK/ASCII 编码，不能 UTF-8 |
| 输入框无法点击 | 不要用 `titleBarStyle: 'hiddenInset'`，用 `frame: true` |
| 打包后后端崩溃 | exe 必须通过 extraFiles 放到 asar 外面 |
| electron-updater 崩溃 | 必须放 dependencies，不能放 devDependencies |

## 敏感信息

- `.env` 文件不上传到 Git（已在 .gitignore 中排除）
- 服务器密码由用户本地保管，不写入代码
- `.env.example` 提供配置模板供团队成员参考

## 维护规则

**此文件由用户维护，AI 修改必须遵守以下规则：**

1. **禁止主动修改** — AI 不得自行修改此文件，无论任何理由
2. **修改前必须申请** — 如需更新，AI 必须先向用户说明：
   - 要修改什么内容
   - 为什么要修改
   - 修改后的效果
3. **获得明确同意** — 用户明确说"可以改"或"同意"后才能修改
4. **修改后需确认** — 修改完成后，告知用户修改了什么，用户有异议立即回退