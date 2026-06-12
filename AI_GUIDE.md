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

## 关键约定

1. **后端返回格式**：`{"success": true, "data": ..., "message": "..."}` — 前端 `api.get()` 自动提取 `data` 字段
2. **用户端 vs 管理员端**：`/api/feedback/my` 是用户接口，`/api/feedback` 是管理员接口，不要混用
3. **管理员 user_id=0**：不在 User 表中，认证逻辑有特殊处理（`dependencies.py` 直接放行）
4. **环境变量**：`.env.development` 连 localhost，`.env.production` 连云端
5. **Electron 生产环境**：直接连云端，不启动本地后端，添加 `no-proxy-server` 绕过代理
6. **JWT Token**：登录后保存到 `localStorage('toolbox_token')`，每次请求自动带 `Authorization: Bearer`
7. **路由**：Hash 模式（`createWebHashHistory`），因为 Electron 用 `file://` 协议

## 排查 Bug 的顺序

1. 查服务器日志：`journalctl -u toolbox-backend -n 50`
2. 查浏览器 F12 → Console 和 Network
3. 查相关代码文件（先看再改）
4. 改完后跑测试或验证日志

## 打包发布

```
一键打包.bat → release/ → 上传到服务器 /opt/amazon-toolbox/backend/updates/
```

服务器 SSH: `root@8.130.113.104` 密码 `Wei99991221`

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

## 维护规则

**此文件由用户维护，AI 不得自行修改。如需更新，告知用户确认。**
