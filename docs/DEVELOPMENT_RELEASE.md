# 开发、构建、发布与回滚

## 日常开发

双击 `开发预览.bat`。它默认使用本地开发后端；如果 8000 端口尚未启动，脚本会自动启动 `backend/start.bat`，关闭 Electron 后再回收由它启动的后端进程。

需要明确连接生产控制面进行兼容性检查时运行：

```powershell
开发预览.bat remote
```

远程后端版本与本地版本不同只会给出警告，不再阻止开发预览。只检查配置而不启动程序：

```powershell
开发预览.bat --dry-run
```

等价的底层命令为：

```powershell
npm install
npm run electron:dev
```

Electron 会编译 TypeScript、构建前端并启动桌面程序。自动化测试使用隔离的本机配置；开发预览根据下述本地配置选择控制面。

根目录 BAT 只保留稳定的入口，实际逻辑统一由 `scripts/toolbox-cli.mjs` 执行，避免多个 BAT 各自维护一套易漂移的判断。

## 提交前检查

双击 `检查.bat` 默认运行快速前后端测试。发布前运行完整门禁：

```powershell
检查.bat full
```

等价命令：

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

双击 `一键发布.bat`，可选输入新版本号。确认生产发布后，脚本会依次执行完整质量门禁、发布环境校验、安装包构建、内容审计、生产后端备份部署、安装包上传和 `latest.yml` 原子发布。任一步骤失败都会停止，服务端部署失败会使用既有回滚逻辑恢复。

无人值守发布示例：

```powershell
$env:TOOLBOX_RELEASE_VERSION='1.7.9'
$env:TOOLBOX_AUTO_PUBLISH='1'
node scripts/toolbox-cli.mjs release --publish --version=1.7.9
```

只在本机生成安装包、不部署生产环境：

```powershell
node scripts/toolbox-cli.mjs release --version=1.7.9
```

如果构建已完成、仅需重试生产部署与原子发布，可避免重复打包：

```powershell
$env:TOOLBOX_AUTO_PUBLISH='1'
node scripts/toolbox-cli.mjs release --publish --version=1.7.9 --skip-verify --skip-build
```

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

`一键发布.bat` 会通过 SSH 把安装包、blockmap 和 YAML 上传到服务器私有暂存目录，再调用受审计的 `publish_update.py` 完成校验和原子发布；不会直接覆盖公开更新目录。管理端“应用更新”仍可用于查看发布记录和人工处理已暂存版本。

SSH 连接信息统一放在忽略提交的 `.env.deploy`。服务器使用非 22 端口时设置 `DEPLOY_SSH_PORT`；未设置时默认使用 22。发布器会强制只使用 `DEPLOY_SSH_KEY_FILE` 指定的私钥，避免本机 SSH Agent 中的其他密钥干扰认证。

发布后仍需用一个 C 端和一个 B 端授权验证“发现更新 → 确认下载 → 后台下载 → 安全重启”。不要使用 SFTP、旧 HTTP 上传脚本或直接覆盖服务器文件。

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
