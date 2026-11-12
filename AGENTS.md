# RayTab AGENTS.md

RayTab 是以网站图标管理为核心的 WXT + React + TypeScript 新标签页扩展。Chrome 和 Edge 使用 Manifest V3，Firefox 使用 Manifest V2。产品范围见 [产品方向](docs/product-direction.md)，安装和发布见 [README](README.md)。

## 开发与验证命令

从仓库根目录运行。开发与 CI 使用 Node.js 24，pnpm 版本见 [package.json](package.json)。环境准备见 [README 的开发章节](README.md#开发)。

```sh
pnpm run dev
pnpm run typecheck
pnpm run format:check
pnpm test
pnpm run build
pnpm run test:e2e
pnpm run build:firefox
```

`test:e2e` 需要先构建 Chrome 扩展。可用 `pnpm test tests/sync/config.test.ts` 和 `pnpm run test:e2e e2e/settings/layout.spec.ts` 分别验证单个测试文件。完整检查见 [CI 工作流](.github/workflows/ci.yml)。

## 按任务查阅

| 任务                         | 先看这里                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 扩展入口、权限或构建         | [WXT 配置](wxt.config.ts)、[扩展入口](src/entrypoints)                                                 |
| 控件、布局或主题             | [组件源码](src/components/ui)、[全局主题](src/styles/globals.css)                                      |
| 导航数据、分组、文件夹或拖拽 | [导航约定](docs/navigation-contract.md)、[导航源码](src/features/navigation)                           |
| 自动图标或离线重载           | [产品方向](docs/product-direction.md)、[官网图标获取](src/features/navigation/site-metadata.ts)        |
| 保存、备份、同步或私密空间   | [Repository](src/storage/repository.ts)、[同步引擎](src/sync/core/engine.ts)、[私密空间](src/security) |
| 浏览器交互验证               | [Playwright 配置](playwright.config.ts)、[隔离浏览器入口](e2e/browser.ts)                              |

## 实现约定

- 搜索现有组件、函数和依赖再动手。现有技术栈或浏览器 API 能满足需求时直接复用。替换实现时迁移调用方并删除旧入口、重复逻辑和失效样式。保留已有数据和备份的读取路径，格式变更经明确的转换或导入边界处理。
- 按钮、表单控件、菜单和弹窗复用 `src/components/ui` 中的 shadcn/ui 和 Radix 组件。尺寸、字重、圆角和状态在共享组件定义，页面通过 `variant`、`size` 和组合使用。比如按钮尺寸在 [Button](src/components/ui/button.tsx) 修改，页面级选择器只负责布局，避免覆盖基础控件样式。
- 简单布局、间距和排版使用 Tailwind。壁纸联动、运行时布局和 Radix 定位约束可用功能 CSS。内联样式用于运行时值。主题沿用 `globals.css` 的语义变量、根元素的 `data-theme` 和 Tailwind `dark:`，避免另写明暗判定。界面图标用 Lucide。
- 沿用 TypeScript 严格检查、`@/` 路径别名和 Prettier。外部响应、导入文件和需要校验的持久化数据按 `unknown` 接收，由 Zod 验证。
- 保存型表单用 React Hook Form 和 Zod resolver，临时交互用 React 局部状态，拖拽用 dnd-kit，图标裁切用 React Easy Crop。持久化修改经 Repository 事务完成后再更新 Zustand。同步、恢复和私密会话变化沿用现有机制通知其他页面刷新。
- 文案用 i18next 语义键和参数插值。字段错误就近展示，普通通知用 Sonner，危险操作用共享确认对话框。保存失败时保留可重试的输入和文件。
- 网站图标统一走 `resolveWebsiteIcon`，优先从官网获取，以官网 favicon 兜底，重载使用本地资源。私密空间仅在用户主动获取时请求官网。自动流程禁止引入第三方目录、代理和逐站替代素材。
- 同步用 Web Locks 处理本机互斥，保留事务、修订与远端 ETag / SHA 校验。凭证不得硬编码，凭证和私密明文禁止写入日志、普通缓存或未获授权的外部服务。

## 交付检查

- 文档改动检查格式和差异。代码改动检查类型、格式和相关现有测试。影响扩展入口或构建时，验证 Chrome 和 Firefox 构建。
- UI 交互用隔离的真实扩展环境验收，按改动检查键盘、明暗和窄屏。复用 `e2e/browser.ts` 和启动预检，失败时先诊断再重试。
- 表单、存储和同步改动检查保存失败、重读、部分更新和跨页刷新。涉及私密数据或备份时检查锁定、解锁及备份往返。修改 Web Locks 相关行为时在目标 Chrome 和 Firefox 扩展验证。
- 交付前复查差异与废弃逻辑，报告验证结果和未验证项。保留测试的业务断言，单独报告无关的已有失败。禁止用静默回退、跳过用例或削弱断言掩盖失败。由 WXT 生成构建产物。

## 操作边界

- 编辑前检查工作区状态和相关差异，保留已有改动。分析和审阅默认只读，任务范围内直接推进。
- 附带的测试或文档变更、提交和创建 PR 仅在明确要求时执行。依赖变更、实际数据迁移、部署、推送和可能丢失数据的操作须有对应授权。获准调整依赖后用 pnpm 同步更新清单和锁文件。
- 获准提交后使用 Conventional Commits，例如 `refactor(ui): 统一表单控件样式`。摘要和正文用中文，每次提交对应一个可验证的改动。

## 本指南参考

按任务定位资料参考 [WXT](https://raw.githubusercontent.com/wxt-dev/wxt/main/AGENTS.md) 和 [ngrok Mantle](https://github.com/ngrok/mantle/blob/main/AGENTS.md)，区分扩展平台与验证命令参考 [AdGuard Browser Extension](https://github.com/AdguardTeam/AdguardBrowserExtension/blob/master/AGENTS.md)。结构沿用 [AGENTS.md 开放格式](https://agents.md/)。
