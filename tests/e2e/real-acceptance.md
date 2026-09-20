# 真实控制面端到端验收

运行 `node scripts/run-real-e2e.mjs`（Node 22；Python 安装 backend 的运行和测试依赖）。Windows 设置 `TOOLBOX_PYTHON` 指向项目测试虚拟环境；可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已安装 Edge，其他环境使用已安装的 Playwright Chromium。

入口每次创建新的隔离目录、SQLite 文件和随机 C/B 授权、后台账号，构建独立 Web 产物。FastAPI 只监听随机的 `127.0.0.1` 端口，同时提供静态页面；浏览器使用真实登录表单和 HTTP API，不注入认证状态、不替换 API、也不接触 `.env.deploy` 或生产数据库。

Windows 默认目录为 `D:\AmazonToolboxData\real-e2e\run-*`；CI 可用 `KST_REAL_E2E_ROOT` 指定报告父目录。Linux 默认位于系统临时目录。命令结束会停止自身后端并删除生成的 `credentials.json`，保留 `results.json`、截图、失败 trace、SQLite 和不含凭据的 `database-evidence.json` 供复核。失败 trace 可能含仅对本次已关闭隔离环境有效的临时会话，不应作为对外公开材料。此命令不会自动删除整棵目录。

验收内容：

- C 端真实授权激活、设备绑定、B 权限拒绝、浏览器预览与演示记录落库。
- B 端原生 Worker 解析随附 Excel、八项真实 API 更新、父子汇总一致和三类模拟结果；原文不上传，Live 表不写入。
- 批次取消、刷新后再次导入运行；断网退出后销毁旧页面，联网重新打开后恢复终止意图。
- 后台真实账号登录、记账、凭证上传及受控下载字节一致、续费项目不提前计支出、确认续费后汇总和落库一致。

这些结果证明 Vue 与真实 FastAPI 的集成，不证明真实亚马逊/速卖通账号操作，也不将 Web 的轻量预览当成 Electron Runner。SQLite 不提供 MariaDB 并发锁语义，原有真实 MariaDB 并发 Job 仍必须单独执行；桌面 Runner、NSIS 安装/覆盖升级仍使用独立桌面验收。
