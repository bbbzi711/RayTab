# RayTab

**简洁流畅的新标签页，专注整理你的常用网站。**

RayTab 是一款开源浏览器新标签页扩展。用图标、分组和文件夹整理网站，打开新标签页就能快速访问；搜索、时钟和壁纸让日常使用更方便。数据默认保存在浏览器中，无需注册账号或自建服务器。

[功能](#功能) · [安装](#安装) · [隐私](#隐私) · [开发](#开发) · [反馈与贡献](#反馈与贡献)

## 功能

- **网站整理**：拖拽排序、跨分组移动、收纳到文件夹；右键编辑、移动或删除，也可进入批量管理。
- **图标管理**：自动获取品牌和网站图标，支持文字图标、上传图片、裁切与底色选择；已保存图片从本地加载。
- **快速收藏**：通过扩展弹窗添加当前网站，选择分组或文件夹，回到新标签页即可访问。
- **简洁桌面**：搜索、时钟、日期和壁纸按需设置，支持明暗主题、中英文界面与简洁模式。
- **私密空间**：与普通空间分开管理网站；启用密码保护后，私密数据在本机加密保存。
- **数据掌握在自己手中**：导入浏览器书签或书签 HTML，导出包含设置和图片的备份；按需配置 WebDAV、GitHub 或 Gitee 同步。

## 安装

目前提供 Chrome（Manifest V3）与 Firefox（Manifest V2）构建。安装包可通过下方开发命令在本地生成，发布流程见[发布版本](#发布版本)。

### Chrome

1. 解压 `raytab-版本号-chrome.zip`，或使用本地构建目录 `.output/chrome-mv3/`。
2. 打开 `chrome://extensions`，启用「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的目录。
4. 打开新标签页，完成首次设置。

### Firefox

1. 解压 `raytab-版本号-firefox.zip`，或使用本地构建目录 `.output/firefox-mv2/`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击「临时载入附加组件」，选择目录中的 `manifest.json`。

Firefox 构建声明最低版本为 140。当前 ZIP 未签名，用于开发和临时加载，重启浏览器后需要重新载入；长期安装需经过 Mozilla 签名。实际浏览器验收范围见[验收记录](docs/modernization-validation.md)。

## 隐私

RayTab 不提供账号、广告或遥测，不读取浏览历史。网站、设置和图片默认保存在本机，只有主动配置同步后，才会将所选空间的数据发送到你指定的位置。

自动获取图标可能访问对应网站，普通空间还可能使用 SVGL 公开目录与 Vemetric 图标服务。目录在本地匹配，图标 API 只接收网站域名；私密空间不请求这些第三方图标服务。搜索和在线壁纸会连接所选服务，本地壁纸不发起图片请求。完整的数据与网络请求说明见[隐私说明](PRIVACY.md)。

卸载扩展或清除浏览器数据可能删除本地内容，建议定期导出备份。

## 开发

项目使用 Node.js 24 和 pnpm，包管理器版本以 `package.json` 的 `packageManager` 为准。

```sh
pnpm install --frozen-lockfile
pnpm run dev              # Chrome 开发模式
pnpm run dev:firefox      # Firefox 开发模式
```

### 常用命令

| 命令                       | 用途                   |
| -------------------------- | ---------------------- |
| `pnpm run typecheck`       | TypeScript 检查        |
| `pnpm test`                | 单元与业务逻辑测试     |
| `pnpm run format:check`    | 格式检查               |
| `pnpm run format`          | 格式化                 |
| `pnpm run build`           | Chrome 生产构建        |
| `pnpm run build:firefox`   | Firefox 生产构建       |
| `pnpm run package`         | Chrome ZIP 打包        |
| `pnpm run package:firefox` | Firefox ZIP 与源码打包 |

构建结果位于 `.output/`；Chrome 构建和两平台打包完成后，会复制产物到 `dist/`。

### 扩展交互测试

首次运行需要安装 Playwright Chromium，并先构建扩展：

```sh
pnpm exec playwright install chromium
pnpm run build
pnpm run test:e2e
```

测试在隔离浏览器配置中运行，使用确定性图标和本地模拟同步服务，不读写日常浏览器配置或用户云端数据。失败截图与追踪位于 `artifacts/playwright/`。

### 技术栈

WXT + React + TypeScript，Tailwind CSS 与 Radix UI/shadcn 构建界面，Lucide 提供界面图标。
Zustand 管理共享状态，React Hook Form + Zod 处理保存型表单，i18next 支持国际化，Sonner 提供通知。
数据使用 IndexedDB + idb 保存，Web Crypto 保护私密数据，Web Locks 处理本机同步互斥；拖拽与图标裁切分别使用 dnd-kit 和 React Easy Crop。

开发约定见 [AGENTS.md](AGENTS.md)，产品方向见[产品定位](docs/product-direction.md)。

## 发布版本

[检查工作流](.github/workflows/ci.yml)在分支推送和 Pull Request 时运行格式、逻辑、Chromium 扩展交互测试与两平台打包检查。
[发布工作流](.github/workflows/release.yml)由 `vX.Y.Z` 正式版本标签触发：校验标签与 `package.json` 版本一致，完成检查和打包，再创建 GitHub Release，生成更新说明并上传 Chrome / Firefox ZIP。

维护者发布前需提交并推送准备发布的代码，更新版本号，再创建对应的新标签。已发布版本不覆盖；更新使用新的版本号。
此流程不自动向浏览器商店上架，Firefox 包也不会自动获得签名。

## 反馈与贡献

欢迎通过 [Issues](https://github.com/bbbzi711/RayTab/issues)反馈问题或提出改进，也欢迎修复、翻译和文档贡献。
报告问题时，请附浏览器版本、复现步骤和截图；请勿公开个人备份、同步凭据或私密内容。

## 许可与致谢

项目代码使用 [MIT 许可](LICENSE)。网站图标使用 SVGL、Simple Icons 及网站公开品牌素材，构建包内附第三方声明；相关素材保留各自许可，品牌名称与商标权归各自所有者。
