# 更新、公告与类型化重构

## 运行边界

- 桌面更新由 Electron `UpdateManager` 持有唯一状态，渲染进程只能通过 `updates:*` IPC 发起意图。
- 下载必须由用户确认；只展示 updater 返回的真实进度、字节数与版本。
- 自动化或 B 端批次运行时禁止安装，下载完成状态转为 `restart_deferred`。
- 公告 audience 由后端根据授权套餐解析。客户端参数不能扩大 consumer/business 可见范围。
- 公告回执以公告、授权码、设备、revision 为唯一键；正文修订后会重新成为未读。
- 更新包先暂存并校验，发布时安装包与 blockmap 先就位，`latest.yml` 最后原子替换。

## 更新 IPC

| Channel | Direction | Purpose |
| --- | --- | --- |
| `updates:get-state` | renderer → main | 获取当前真实快照 |
| `updates:check` | renderer → main | 互斥检查新版本 |
| `updates:start-download` | renderer → main | 用户确认后开始下载 |
| `updates:cancel-download` | renderer → main | 使用 CancellationToken 取消 |
| `updates:install` | renderer → main | 无活动任务时安装 |
| `updates:defer` | renderer → main | 本次会话稍后处理 |
| `updates:state` | main → renderer | 推送不可变状态快照 |

高权限 IPC 必须同时验证当前主窗口 sender 与 `app://toolbox/` 来源；开发环境只额外允许 `http://localhost:3000/`。

## 发布流程

1. 后端先部署数据库迁移和兼容 API。
2. 使用 `npm run release:validate` 检查 HTTPS 更新地址、签名证书、密码与 publisherName。
3. 使用 `npm run electron:release` 生成签名 NSIS 产物。
4. 管理后台“应用更新”上传同版本安装包、blockmap 和 `latest.yml`。
5. 暂存校验通过后人工核对，再点击“确认发布”。
6. 用 consumer 与 business 授权各验证一次检查、下载、延后重启和定向更新公告。

生产 release 在缺少 HTTPS 或 Windows 签名配置时必须失败，不能绕过门禁。证书与密码不得写入仓库。

## 回滚

- 功能回滚使用阶段提交的 `git revert`，不使用 `reset --hard`。
- 关闭公告中心功能开关后，旧 `/api/announcements/active` 仍可服务旧客户端。
- 更新服务保留上一版本安装包与 manifest；重新发布上一签名版本时仍走暂存校验。
- 数据库新增列和 receipt 表保留，不做破坏性降级。
- 基线标签为 `pre-update-refactor-20260715`。

## 质量门禁

```text
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run electron:compile
npm run build:desktop
npm audit --omit=dev
python -m ruff check backend/app backend/domains/announcements backend/domains/updates
python -m mypy --config-file backend/pyproject.toml backend/app backend/domains/announcements backend/domains/updates
python -m pytest backend/tests/api backend/tests/test_update_release_service.py
git diff --check
```

## 仍需分批迁移的遗留边界

严格 TypeScript 基础和新领域已经启用，但历史 UI、store、测试及 automation CJS 尚未一次性改名。迁移必须按 auth、tools、automation、business、admin、AI 顺序进行；每个领域先补 DTO/IPC schema，再启用 `lang="ts"`，禁止用 `@ts-nocheck` 制造虚假完成。

后端全套历史测试中还有三类与本轮无关的旧契约：同步调用异步缓存、旧 `User.username/email` 字段、旧配置字段。领域迁移时应更新测试夹具到当前模型，不能为迁就旧测试恢复已废弃的产品字段。
