# 桌面安装与覆盖升级验收

## 验收层次

- `node scripts/verify-nsis-artifacts.mjs`：验证版本、文件名、体积、SHA512 与 `latest.yml` 两处引用一致，不再仅检查文件存在。
- `npm run electron:compile`：TypeScript 编译后必须执行 `scripts/bundle-electron-preload.mjs`，将共享 IPC/Zod 打进单一 preload，保留 `sandbox: true`。Electron 沙箱的有限 require 不支持相对 CommonJS 文件，见[官方说明](https://www.electronjs.org/docs/latest/tutorial/sandbox)。
- `scripts/packaged-runtime-smoke.mjs`：真实打包进程的 app:// 页面、preload IPC、凭据解密、设备 ID、设置和 ASAR 中的 Runner Demo 冒烟；不使用 checkout 内的 Runner 替代打包 Runner。
- `scripts/nsis-install-smoke.ps1`：一次性 GitHub 托管 Windows runner 内的真实安装、覆盖升级、卸载。默认任意安装器崩溃立即失败；诊断重试即使恢复也不改变失败结果。

## CI 接入

```yaml
- name: Fetch pinned old release for upgrade acceptance
  run: node scripts/prepare-nsis-upgrade.mjs
- name: Verify real NSIS 1.8.5 upgrade and uninstall
  shell: pwsh
  run: ./scripts/nsis-install-smoke.ps1
- uses: actions/upload-artifact@v7
  if: always()
  with:
    name: windows-nsis-diagnostics
    path: test-results/nsis/**
```

旧包固定为已发布的 1.8.5：来源、体积和 SHA512 记录在 `scripts/nsis-upgrade-fixture.json`，不能用当前 `latest.yml` 代替旧包。下载失败、校验不符都应让验收失败，而不是跳过升级。

脚本先拒绝已有 KST 安装的 Windows 账户，仅在 GitHub-hosted runner 运行。安装目录、临时解压和应用数据位于 D 盘。NSIS 的 `/D` 并不能隔离同一 AppID 的注册表和快捷方式，因此不得在开发者电脑直接运行真实安装/卸载测试。

失败留下每次安装 SHA512、退出码、耗时、Windows Application Error/WER 事件（若可获取）及文件清单。`0xC0000005` 只能证明访问冲突；没有故障模块、调用栈或转储时，不写成已确定的 Defender、NSIS 或机器原因。

## 1.8.8 候选的 NSIS 已知目录读取修复

固定使用的 `app-builder-lib 26.8.1` 模板仍包含 `SHGetKnownFolderPath` 返回指针上的固定 `NSIS_MAX_STRLEN` WCHAR 数组读取，以及 `System::Store` 私有寄存器栈调用。[上游 #7921](https://github.com/electron-userland/electron-builder/issues/7921) 报告与验收日志一致的 `System.dll + 0x1581 / 0xC0000005`，评论报告移除 Store 调用后不再崩溃。该 issue 未给出已合并的正式修复，不能单凭相同偏移宣称旧包崩溃已完全归因。

不过，[NSIS System 文档](https://nsis.sourceforge.io/Docs/System/System.html) 将 `&wN` 定义为固定 N 个 WCHAR 数组；[微软 SHGetKnownFolderPath 契约](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath) 只保证返回 NUL 结尾的已分配字符串。固定大数组读取不是有效的该指针读取方式。

`npm run desktop:prepare-nsis` 因此在生成**新**安装包前对已核对的整个模板 SHA256 和库版本做严格校验，再只替换该内存处理块：使用原生 Push/Pop 保护临时寄存器，以 [lstrcpynW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-lstrcpynw) 按 NUL 和明确的目标字符容量复制，释放非空 COM 指针。输出 buffer 的容量与 count 均为 `NSIS_MAX_STRLEN` WCHAR（包含结尾 NUL），不使用无限长拷贝。重复执行只验证；版本或模板漂移直接阻止打包。`npm ci` 后会重新应用，不修改 lockfile 或升级依赖。

修复不改变 AppID、安装范围、HKCU/HKLM 已有路径识别、Windows 重定向的每用户 Programs 路径和 `/D` 处理。不得预填注册表绕过该路径，也不得修改原始旧安装包；旧包失败仍需保留并如实报告。

在已下载 NSIS 编译器的 Windows 环境执行 `node scripts/test-nsis-known-folder-copy.mjs`。探针把短 Unicode 字符串和空串放在可读内存页尾，下一页设为不可读，验证复制不会越界；同时核对寄存器/栈平衡及 API 失败回退。它不安装应用、不写注册表和快捷方式，证据留在 D 盘 `installer-smoke`。这个探针不能代替真实新包安装、旧→新升级和卸载 CI。

## 本机安全验证

```powershell
# 从真实项目路径运行，避免目录 Junction 导致 Vitest 路径解析偏差。
pwsh -NoProfile -File scripts/nsis-unpacked-upgrade-smoke.ps1 `
  -CandidateDirectory 'D:\AmazonToolboxData\candidate-build\win-unpacked'
```

本机只用 7zip 解包原始旧安装包，不执行它，不写注册表、不创建快捷方式。两个版本在唯一 D 盘隔离数据目录先后运行，控制面和更新检查均指向本地测试服务器，不登录生产、不接触真实账号。该结果只能称“旧→新打包运行时数据兼容通过”，不能称“真实 NSIS 覆盖安装通过”。

## 1.8.5 基线的已知缺陷

原始 1.8.5 的 sandbox preload 包含相对 `require('../src/shared/ipc/desktop-contract.js')`，真实运行时 bridge 无法加载。不能改造旧包后把它冒充原版，也不能因这一旧缺陷跳过候选检查。因此基线 seed 保留原版 renderer，以原版 Electron safeStorage 格式生成一个明确的测试授权码，并采用从原始 ASAR 核实的设备 ID 算法生成基线；报告会保留 `knownOldVersionDefect`。候选版本必须通过真实 credentialStore、batch IPC 和打包 Runner 检查。

升级后的验证包括：旧加密授权码可解密、设备 ID 不变、平台选择及浏览器存储保留、更新提醒偏好不变、自有文件未删。卸载验证当前安装文件移除，数据目录和无关相邻目录保留。这不代表线上授权已验证，也不等同于在每种客户机器上验证过升级。
