# 独立营销官网

## 内容与边界

`src/marketing` 复用现有 Landing 的完整图文、品牌、动效、移动导航与咨询弹窗，不是另一套系统 UI。只有首页、服务条款和 404，不包含 C/B/Admin 路由、登录恢复、业务 API、Runner、后台、PWA 或 Sentry。原系统入口及功能不变。

咨询联系卡仍明确标注为预览演示，示意邮箱不可用于联系，不收集联系方式。未来只能替换为经过持有人确认的真实公开联系渠道。

## 构建与预览

生产构建必须显式注入两项公开配置（发布工具可读取被 Git 忽略的 `.env.marketing.local` 后注入）：

- `VITE_DESKTOP_DOWNLOAD_URL`：实际已发布的稳定 HTTPS 安装包地址，不接受候选包或本地测试目录。
- `KST_MARKETING_SITE_URL`：实际 Pages 正式网址或已验证的域名 origin，用于 canonical、分享链接与版本证明。

构建不会自动读取共享 `.env.production`、`.env.deploy` 或其他 VITE 环境变量。`RELEASE_COMMIT` / `GITHUB_SHA` 可提供精确提交；未设置时读取本地 Git HEAD。

```text
npm run build:marketing
npm run marketing:audit
npm run preview:marketing
```

输出仅为 `dist-marketing/`，与桌面 `dist/`、安装包 `release/` 分离。`TOOLBOX_MARKETING_DIR` 可指定审计其他候选输出目录。不要将 `.env.marketing.local` 或整个仓库上传到 Pages。

## Pages 静态托管

- 构建命令对应 `build:marketing`；发布目录为 `dist-marketing`。可在有授权后由统一发布工具上传已审计目录，不需要 Pages Functions。
- `_redirects` 只将 `/terms` 重写至首页入口，并兼容旧条款链接。生成的 `404.html` 让未知 URL 返回真实 404，不把 `/api/` 等误请求掩盖为 HTML 200。
- `_headers` 为 HTML 设置重新验证，为哈希资源设置长期缓存，禁止页面发起 API/遥测连接。未启用 Service Worker，不涉及旧桌面更新器。
- `marketing-version.json` 包含产品版本、提交 SHA、构建时间、公开官网地址和下载地址，可识别同版本官网小改。它不是桌面 `latest.yml`，不驱动桌面更新。
- 下载直接导航到已配置的正式安装包，不跨域 fetch 清单，不需修改旧 API 或更新目录的 CORS。
- 每次系统新版本正式发布后，先确认安装包可下载，再更新官网配置并发布；不得先把官网指向尚不存在的版本。
- 旧 IP 的 API、更新地址与证书续期保持，不将控制面 URL 改成 Pages 网址。境外官网不代表国内既有服务的主体或备案要求自动解决。

## 验收

`npm run verify:marketing` 固定执行发布配置单测、独立构建、产物审计及桌面/手机浏览器 E2E，已纳入 `verify:release` 与 CI。`npm run marketing:publish -- --check-account` 只验证账号、现有项目及站点域名归属；`--check` 还核验干净且已通过 CI 的最新 main、正式系统版本和安装包可下载。两者均不上传。Wrangler 登录配置与缓存位于 D 盘 Cloudflare 数据目录，Windows 使用凭据库保护的加密配置，不进入源码。

正式发布后还需在 Pages 公网验证首页、`/terms`、未知路径的真实 404、CSP 下的交互及下载。Vite preview 不执行 Cloudflare 的 `_headers` 和 `_redirects`，不能代替这一层验收。

执行营销构建审计，检查模块白名单、无业务 API、无源码/secret/source map、正确版本证明和缓存规则。浏览器再检查桌面与移动端、动效暂停/重播/减少动态、导航、咨询关闭、条款、404、下载链接与失败反馈；打开首页时不应请求业务 API。

官方说明：[Cloudflare Pages Headers](https://developers.cloudflare.com/pages/configuration/headers/)、[Redirects](https://developers.cloudflare.com/pages/configuration/redirects/)、[Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)。
