# 官网域名接入

## 当前边界

- 官网保持宣传落地页，不改为桌面工作台镜像。域名接入不改变产品、权限、数据库或更新身份。
- `kesaitong.top` 已购买；实名认证、解除 ClientHold 和适用的 ICP 备案完成前，不切换公开 DNS 或生产站点。
- 现有主机位于中国内地。域名实名与 ICP 备案是两项独立流程；备案主体、服务器资格及所需资料由实际持有人核实。
- 此文档只记录准备方案，不代表 DNS、备案、证书或生产配置已经完成。

## 两种构建外壳

- `npm run build:web`：API 默认使用网站当前 origin，业务请求仍走 `/api/`。Vite 显式覆盖共享 `.env.production` 中的桌面 API 默认值，不需要为每个域名重新写入 IP。
- 为隔离验收显式传入的进程环境 `VITE_CONTROL_API_BASE` / `VITE_API_BASE` 仍生效；`scripts/run-real-e2e.mjs` 的随机本地端口不会被覆盖。正式发布环境不要携带测试用 API 覆盖值。
- `npm run build:desktop`：保持现有桌面控制面地址、更新地址、App ID 和用户数据目录。开发预览地址也保持原行为。
- 网站安装包发现继续使用当前 origin 的 `/updates/latest.yml`。新增域名不意味着删除旧 IP 的更新入口。

## 待实施步骤

1. 持有人完成域名实名，确认 ClientHold 已解除；通过接入商核实并完成适用的备案。没有真实备案信息时不填模拟备案号。
2. 在仓库纳管独立域名 Nginx vhost，复用现有 API、更新文件和 Web 发布目录；同时将其纳入部署、备份与恢复。主配置每次部署都会更新，不能只手改线上文件。
3. 为主域名及需要的 `www` 配置独立证书与续期；证书尚未存在时不加载引用该证书的 HTTPS 配置。现有 IP vhost、IP 证书及其续期任务保留。
4. 获准上线后配置主域名 A 记录，`www` 可使用 CNAME；只在确认可用时配置 IPv6。仅将 `www` 跳转至主域名，不整体重定向旧 IP API 或更新请求。
5. 验证域名与旧 IP 两条链路：健康检查、公开版本文件、更新清单、安装包下载、旧桌面更新，以及官网桌面与移动端展示。补充真实备案链接与正式域名元信息。
6. 未来若迁移新桌面版本到域名，需单独同步 API 配置、更新 feed、CSP 与必要跨域策略，并保持旧版本可继续更新；本次不做该迁移。

现有原子 Web 发布与失败回滚继续使用 `ops/deploy/deploy-web.sh`，无需新建一套应用。

参考：[阿里云 ICP 备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)。
