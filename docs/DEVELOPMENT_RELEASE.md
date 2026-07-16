# 开发、构建、发布与回滚

## 日常开发

双击 `开发预览.bat`，或在项目根目录运行：

```powershell
npm install
npm run electron:dev
```

Electron 会编译 TypeScript、构建前端并启动桌面程序。自动化测试使用隔离的本机配置；开发预览根据下述本地配置选择控制面。

当前电脑存在本地 `.env.deploy` 时，`开发预览.bat` 会读取其中的服务器主机并连接远程控制面；没有该文件时才启动内嵌本地后端。脚本只读取配置，不会部署或重启服务器。

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

双击 `一键发布.bat`，可选输入新版本号。脚本会验证并构建安装包，然后打开 `release` 目录。

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
生产服务器已于 2026-07-16 只读确认使用 `/etc/systemd/system/toolbox-backend.service`，通过 Uvicorn 运行后端；服务器未安装 Docker。仓库已删除未使用的 Docker Compose 部署入口。

2026-07-16 已将生产控制面升级到 1.7.2，并完成 MariaDB 备份、Alembic 迁移、Python 3.10 兼容检查、CORS 桌面协议检查和失败自动回滚验证。服务器保留 `pre-1.7.2-*` 数据库与代码备份，以及 `pre-cors-*` 代码备份。

当前控制面仍通过公网 HTTP 端口提供服务，没有 Nginx 和 HTTPS。这不会阻止开发预览，但生产发行前应配置受信任域名和 HTTPS，再关闭公网 8000 端口。桌面构建和应用更新发布本身不会自动修改 systemd 服务。
