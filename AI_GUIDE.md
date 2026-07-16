# 项目协作指南

## 产品定位

这是面向跨境电商学员、教师和代运营人员的桌面自动化工具箱，不是课程平台，也不是模拟亚马逊网站。

- C 端：选择工具并启动，脚本自动处理；仅在登录、验证码或二次验证时要求用户介入。
- B 端：教师和批量操作人员使用批量工作台，单 Runner 顺序执行，多浏览器现场互相隔离。
- 管理端：处理授权、设备、公告、更新、工单和需要人工介入的批次。

用户端不展示成功率、预计时间、线程、内部步骤、任务 ID 或虚假进度。

## 当前架构

- Vue 3、Pinia、Element Plus、Vite：`src/`
- Electron、更新管理、Runner、多浏览器协调：`electron/`
- FastAPI、SQLAlchemy、领域服务：`backend/`
- 编译后的桌面主进程：`dist-electron/`
- Electron 使用受控 `app://` 协议加载界面；主进程和 preload 不依赖源码路径。

后端领域入口位于 `backend/domains/`。Router 只处理鉴权、参数和响应，业务规则进入领域 Service。

## 关键业务约束

1. 只有真实的 Runner 事件能改变执行结果，动画不决定业务成功。
2. 同一时刻最多一个活动 Runner；等待用户操作的浏览器现场可以保留。
3. 客户 Excel、密码、Cookie、Token 和页面原文不得上传到控制面。
4. 稳定设备 ID、旧设备迁移、席位释放和密码哈希升级不可当作死代码删除。
5. C 端不能看到或调用批量能力，权限必须由前端路由和后端 API 同时校验。
6. 更新需要用户确认后才下载；运行任务时不得强制重启。
7. 公告受众由后端按套餐解析，不信任前端传入的 consumer/business。
8. 旧公告、旧更新上传和旧 launch-token 协议保留到 1.9.0；新版请求发送 `X-Toolbox-Version`。
9. 只保留右上角账号菜单中的退出入口。
10. 不主动连接、停止或修改服务器；服务器运行方式未确认前保留 Docker 与 systemd 兼容入口。

## 开发和验证

- 新手入口：`开发预览.bat`、`检查.bat`、`一键发布.bat`
- 前端开发：`npm run electron:dev`
- 全量质量门禁：`npm run verify`
- 前端与 Electron 测试：`npm test`
- 后端测试：`python -m pytest backend --rootdir=backend -q`
- 桌面安装包：`npm run electron:build`

禁止使用 `git reset --hard`、自动 `git add .` 后推送 main、全仓无关格式化或绕过管理端的更新上传脚本。

## 发布与安全

- 当前发行目标是 unsigned Windows NSIS，客户可能看到“未知发布者”，这是已接受的产品取舍。
- 安装包只包含前端产物、编译后的 Electron CJS、必要生产依赖和内嵌后端。
- 新版本通过管理端“应用更新”执行暂存、校验和原子发布。
- Token、私钥、数据库密码和远程地址只放环境变量；提交前运行 `npm run security:audit`。
- 不推送分支、标签或发布包，除非用户明确授权。

更完整的操作说明见 `docs/DEVELOPMENT_RELEASE.md`。
