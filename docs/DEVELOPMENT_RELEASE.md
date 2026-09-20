# 开发、构建、发布与回滚

## 日常开发

Node 使用 22 系列，CI 固定版本见 `.node-version`。Python CI 使用 3.10，并按 `backend/constraints-py310.txt` 验证生产依赖。使用 `npm ci` 保持依赖锁文件一致；本机其他 Python 版本的测试结果不替代 Python 3.10 CI。

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
npm ci
npm run electron:dev
```

Electron 会编译 TypeScript、构建前端并启动桌面程序。自动化测试使用隔离的本机配置；开发预览根据下述本地配置选择控制面。

需要使用与 CI 一致的 MariaDB、Redis 和后端容器时，按 `docs/DOCKER_OPTIMIZATION_PLAN.md` 复制 `.env.docker.example` 并运行 `npm run docker:up`。Electron 与本地 Runner 仍然在 Windows 原生环境运行。

如果 Playwright 自带浏览器尚未下载，可以临时复用已安装的 Chrome：

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e:internal
```

根目录 BAT 只保留稳定的入口，实际逻辑统一由 `scripts/toolbox-cli.mjs` 执行，避免多个 BAT 各自维护一套易漂移的判断。

## 提交前检查

双击 `检查.bat` 默认运行快速前后端测试。发布前运行完整门禁：

```powershell
检查.bat full
```

等价命令：

```powershell
npm run verify:release
```

该命令依次执行发布配置检查、密钥审计、TypeScript、ESLint、架构边界、OpenAPI 和前端契约检查、死代码检查、前端覆盖率与 Electron 工作流、后端覆盖率与修改代码覆盖率、Ruff 和 mypy、MariaDB 门禁、Business/Internal E2E、真实隔离后端 C/B/Admin 旅程，以及桌面构建和包内容审计。`npm run verify` 是开发综合检查，不等同于完整发布门禁。

`npm run test:e2e:real` 自动建立临时 SQLite、真实 FastAPI、随机测试授权和 Web 构建，不 mock 业务 API，不连接生产。Windows 证据位于 `D:\AmazonToolboxData\real-e2e\run-*`；其他平台位于系统临时目录，可用 `KST_REAL_E2E_ROOT` 覆盖。凭据文件结束时删除，报告只含隔离测试数据。浏览器 Demo 通过不等于真实外部平台 Runner 已验收。

桌面编译先由 TypeScript 生成 CJS，再将 preload 打成只保留 `electron` 外部依赖的单文件，保持 `sandbox: true`。真实 NSIS 覆盖安装仅在一次性 GitHub-hosted Windows 执行，使用固定 SHA512 的 1.8.5 安装包与候选包验证旧数据、实际 `app://`、preload 和打包 Runner。任一安装崩溃直接失败并留诊断，不以重试成功掩盖。

MariaDB 门禁必须使用真实数据库：单独运行检查时配置隔离测试库的 `MARIADB_TEST_URL`；正式发布器也可使用同一 HEAD 已通过的 GitHub MariaDB CI 结果，并会再次独立核验。不要把生产数据库配置为测试库，也不要把跳过的测试计作通过。

如果只验证某一层：

```powershell
npm test
npm run typecheck
npm run deadcode
npm run verify:backend
```

## 构建 Windows 安装包

双击 `一键发布.bat` 或使用下述命令。生产发布前必须先将新版本及全部代码提交、合入最新 `main` 并推送，发布器不会替你提交代码或合并分支。它要求：

- 工作区干净，包括没有未跟踪文件。
- HEAD 等于上游分支和最新 `origin/main`。
- `package.json` 中版本等于请求版本，OpenAPI 等生成文件检查通过。
- 请求版本高于线上桌面版本及远端最新版本标签；恢复发布则必须匹配原版本和提交。
- 本机 `gh` 已登录，以下七项必需 CI 的最新结果均为当前 HEAD 的成功结果：
  - `Frontend and Electron contracts`
  - `Backend domains and API`
  - `MariaDB migrations and concurrency`
  - `Responsive C B Admin smoke`
  - `Internal critical-flow acceptance`
  - `Real backend C B Admin journeys`
  - `Windows NSIS install and runtime smoke`

确认生产发布后，脚本执行完整质量门禁、构建及内容审计，再依次部署后端、Web 和桌面更新。发布阶段为 `prepared → backend_deployed → web_activated → desktop_published → verified`，状态与产物校验值保存到 `TOOLBOX_DATA_ROOT/release-workflows/<release-id>/`，Windows 默认位于 D 盘。后端部署包通过 `git archive` 从该提交的跟踪文件生成。最终核对健康信息、Web 版本、桌面清单后才创建并推送版本标签。

无人值守发布示例：

```powershell
$env:TOOLBOX_AUTO_PUBLISH='1'
$releaseVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version
node scripts/toolbox-cli.mjs release --publish "--version=$releaseVersion"
```

只在本机生成安装包、不部署生产环境：

```powershell
$releaseVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version
node scripts/toolbox-cli.mjs release "--version=$releaseVersion"
```

中断后根据发布器输出或状态文件取得原 release ID，再恢复同一提交的发布。以下占位值必须替换为真实发布 ID：

```powershell
$env:TOOLBOX_AUTO_PUBLISH='1'
$releaseVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version
$releaseId='<原发布 ID>'
node scripts/toolbox-cli.mjs release --publish "--version=$releaseVersion" "--resume=$releaseId"
```

**生产禁止 `--skip-verify` 和 `--skip-build`。** `--resume` 会验证原状态、产物哈希和已完成阶段的线上版本，不是绕过验证。发布过程中保留服务器发布租约，失败后应按原 release ID 恢复，不要手动清理租约或另起一轮发布。

仅打包的低层命令如下；它不等同于完整门禁，也不部署或发布：

```powershell
npm run electron:build
```

当前使用 unsigned NSIS，不需要购买证书或注册 Microsoft Store。Windows 可能显示“未知发布者”，不影响安装和授权码功能。

打包后可额外检查资源白名单：

```powershell
npx electron-builder --win --dir
npm run package:audit
```

当前 `internal` 桌面安装包不包含 Python 后端；`package:audit` 会拒绝 `toolbox-backend.exe`。包内包含前端、编译后的 Electron/Runner、必要生产依赖和模板、费率、品牌资源。安装包不得包含 Token、测试、文档、运维脚本、TypeScript 源码或 source map。`backend:build` 仅保留为兼容场景的手动命令，不是默认发布步骤。

## 发布应用更新

`一键发布.bat` 会通过 SSH 把安装包、blockmap 和 YAML 上传到服务器私有暂存目录，再调用受审计的 `publish_update.py` 完成校验和原子发布；不会直接覆盖公开更新目录。管理端“应用更新”仍可用于查看发布记录和人工处理已暂存版本。

SSH 连接信息统一放在忽略提交的 `.env.deploy`。服务器使用非 22 端口时设置 `DEPLOY_SSH_PORT`；未设置时默认使用 22。发布器会强制只使用 `DEPLOY_SSH_KEY_FILE` 指定的私钥，避免本机 SSH Agent 中的其他密钥干扰认证。

发布后仍需用一个 C 端和一个 B 端授权验证“发现更新 → 确认下载 → 后台下载 → 安全重启”。不要使用 SFTP、旧 HTTP 上传脚本或直接覆盖服务器文件。

## 回滚

- 后端部署脚本在停服后冻结写入并备份数据库、附件及代码/配置，避免数据库与凭证文件备份时间不一致。Alembic 已开始后的失败使用 `ops/deploy/restore-backup.sh` 恢复一致备份；此前失败恢复代码、配置和 Python 环境指针。
- Web 构建发布到独立版本目录，用 `current` 软链接原子切换；该阶段验证失败会恢复上一 Web 指针。带哈希的静态资源保留兼容旧的已打开页面。
- 桌面清单经暂存、校验后原子发布。若较早阶段已成功而后续失败，已成功阶段不会自动全部回旧版；优先用同一 release ID 恢复。三项发布不是跨服务的全局原子事务。
- 需要人工恢复后端时，先核对本次部署输出的 `backup_dir`、恢复影响和备份完整性，再使用服务器已安装的 `toolbox-restore-backup`；该操作会恢复数据库和附件，不得只因网页问题就盲目执行。
- 代码回退使用经过评审的 `git revert <commit>`，再按新版本发布。

不要使用 `git reset --hard`、强推或覆盖已发布标签。不要把某一阶段的回滚成功描述为三端都已回滚；必须重新核对后端健康、Web 元数据和桌面更新清单。

## 仍需人工确认

发布前请完成：

1. 用真实 C 端授权运行一次工具。
2. 用真实 B 端授权导入一个小批次并处理一次登录或验证码现场。
3. 登录管理后台，检查行动中心、公告和更新发布。

仓库生产部署脚本使用 `toolbox-backend.service`，通过发布版 Python 环境的 `current-venv` 指针启动 Uvicorn。Compose 用于本地一致性和 MariaDB 集成测试，不是默认生产部署方式；不要因本机没有 Docker 而安装或迁移生产环境。

控制面及部署目标以当前 `.env.deploy` 为准；Web 和桌面更新使用同一 HTTPS 控制面。仓库 Nginx 配置分别提供 `/api/`、`/updates/` 和 Web 静态页面。发布前实时验证 TLS、健康信息和版本，不把旧部署记录或旧电脑端口配置当作当前事实；不要关闭证书续期相关入口或擅自修改网络规则。
