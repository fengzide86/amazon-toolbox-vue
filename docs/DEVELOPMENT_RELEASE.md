# 开发、构建、发布与回滚

## 日常开发

双击 `开发预览.bat`，或在项目根目录运行：

```powershell
npm install
npm run electron:dev
```

Electron 会编译 TypeScript、构建前端并启动桌面程序。自动化测试使用隔离的本机配置；开发预览根据下述本地配置选择控制面。

当前电脑存在本地 `.env.deploy` 时，`开发预览.bat` 会先探测其中配置的 HTTPS 控制面；远程服务不可用时自动回退到内嵌本地后端。脚本只读取配置，不会部署或重启服务器。可设置 `TOOLBOX_DRY_RUN=1` 只检查预览配置。

## 提交前检查

双击 `检查.bat`，或运行：

```powershell
npm run verify
```

该命令依次执行密钥审计、TypeScript、ESLint、死代码检查、前端/Electron 测试、桌面前端构建以及后端测试和类型检查。

如果只验证某一层：

```powershell
npm test
npm run typecheck
npm run deadcode
npm run verify:backend
```

## 构建 Windows 安装包

双击 `一键发布.bat`，可选输入新版本号。脚本会执行完整质量门禁、发布环境校验、安装包构建及内容审计，然后打开 `release` 目录。

等价命令：

```powershell
npm run electron:build
```

当前使用 unsigned NSIS，不需要购买证书或注册 Microsoft Store。Windows 可能显示“未知发布者”，不影响安装和授权码功能。

打包后可额外检查资源白名单：

```powershell
npx electron-builder --win --dir
npm run package:audit
```

安装包不得包含 Token、测试、文档、运维脚本、TypeScript 源码或 source map。

## 发布应用更新

1. 使用管理端进入“应用更新”。
2. 上传安装包、blockmap 和 YAML，先暂存并校验。
3. 确认版本号、SHA-512 和更新说明。
4. 点击发布；系统最后原子替换 `latest.yml`。
5. 用一个 C 端和一个 B 端授权验证“发现更新 → 确认下载 → 后台下载 → 安全重启”。

不要使用 SFTP、旧 HTTP 上传脚本或直接覆盖服务器文件。

## 回滚

- 查看清理前快照：`git show pre-legacy-cleanup-20260716`
- 从快照建立恢复分支：`git switch -c codex/recovery-legacy-cleanup pre-legacy-cleanup-20260716`
- 回退单阶段：`git revert <commit>`

不要使用 `git reset --hard`。数据库新增列和 receipt/批次表保留，回滚代码时不做破坏性降级。

## 仍需人工确认

发布前请完成：

1. 用真实 C 端授权运行一次工具。
2. 用真实 B 端授权导入一个小批次并处理一次登录或验证码现场。
3. 登录管理后台，检查行动中心、公告和更新发布。
生产服务器使用 `/etc/systemd/system/toolbox-backend.service`，通过 Uvicorn 运行后端；服务器未安装 Docker。仓库已删除未使用的 Docker Compose 部署入口。

2026-07-16 已将生产控制面升级到 1.7.2，并完成 MariaDB 备份、Alembic 迁移、Python 3.10 兼容检查、CORS 桌面协议检查和失败自动回滚验证。服务器保留 `pre-1.7.2-*` 数据库与代码备份，以及 `pre-cors-*` 代码备份。

生产控制面和更新目录统一使用 `https://8.130.113.104`。Nginx 终止 TLS 并反向代理本机 8000 端口；公网客户端不再直接连接 8000。服务器使用受信任的短期 IP 证书，`toolbox-certbot-renew.timer` 每日两次自动续期并在成功后重载 Nginx。证书续期依赖公网 80 端口的 ACME challenge 路径，请勿关闭该端口或删除对应 Nginx location。
