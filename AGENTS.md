# RayTab Agent 开发指南

- 本项目为 WXT + React + TypeScript 浏览器新标签页扩展。
- 运行环境：Node.js 24；包管理器：pnpm。
- 样式方案：Tailwind CSS + CSS 变量；功能样式使用普通 CSS。
- UI 组件：Radix UI + shadcn/ui；界面图标使用 Lucide React，网站品牌使用本地精选目录、按需更新的 SVGL 公开目录与 Simple Icons。
- 数据保存：IndexedDB + idb；数据校验：Zod；拖拽：dnd-kit；加密：Web Crypto。
- 依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。

## 产品定位

RayTab 是以网站图标管理为核心，简洁、流畅的开源新标签页。优先做好网站添加与编辑、拖拽、文件夹、分组、自动图标和本地重载；搜索、时钟及外观服务于这些核心操作。

- 默认本地保存，无需账号或自建服务器；外部图标来源明确披露，私密入口遵守现有网络与缓存边界。
- 常用图标以基本覆盖、清晰且符合熟悉的品牌样式为目标；未知网站使用通用获取，不逐站增加运行时代码。
- 设置只暴露有明确用途的选项，复杂操作按需展开；对象操作优先放在右键菜单，不堆常驻按钮。
- 参考成熟产品的具体交互，不一比一复制任何产品，不因为竞品包含功能就扩大范围。
- 本轮执行目标和验收边界见 `docs/product-direction.md`。

## 技术选型

以下方案已接入当前源码。新增功能继续使用这些入口，不另建同职责机制；依赖升级和范围扩大按用户授权执行。

| 职责       | 当前方案                                                                         | 覆盖范围                                 |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| 共享状态   | [Zustand](https://github.com/pmndrs/zustand)                                     | 首页、Popup、设置及私密会话的共享状态    |
| 保存型表单 | React Hook Form + [Zod resolver](https://github.com/react-hook-form/resolvers)   | 所有明确提交、保存的表单                 |
| 国际化     | [i18next + react-i18next](https://react.i18next.com/getting-started)             | 产品文案、语义错误及参数插值             |
| 操作通知   | [Sonner](https://github.com/emilkowalski/sonner)                                 | 普通操作通知                             |
| 同步互斥   | 原生 [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) | 同步、连接变更及冲突处理的本机互斥       |
| 交互回归   | [Playwright](https://playwright.dev/docs/chrome-extensions)                      | 实际 Chromium 扩展的交互回归及 CI        |
| 图标裁切   | [React Easy Crop](https://github.com/ValentinH/react-easy-crop)                  | 图标图片的拖动、缩放、键盘选择与裁切区域 |

Dexie、Ky 仅在能接管具体机制、减少实际维护代码时评估引入，不要求为了统一而替换现有 idb 或简单请求封装。

## 目录与职责

```text
src/
├── app/            # 应用组装、布局和启动界面
├── entrypoints/    # WXT 入口：newtab、popup、background
├── components/ui/  # 通用 UI 组件
├── features/       # 导航、设置、搜索、外观、导入和备份等功能
├── hooks/          # 共享 React Hooks
├── storage/        # 数据模型、命令、Repository 和状态管理
├── sync/           # 同步流程、合并规则和远端适配器
├── security/       # 加密与私密空间保护
├── locales/        # 国际化资源及配置
├── lib/            # 通用工具
├── styles/         # 全局主题与共享样式
└── widgets/        # 时钟等独立小组件
tests/              # 逻辑、存储和同步测试
e2e/                # 隔离配置中的 Chromium 扩展验收
scripts/            # 图标、声明和构建辅助脚本
public/             # 扩展静态资源
docs/               # 功能约定与项目文档
```

以上是当前目录基线，新增代码按职责就近组织。需要调整结构时，以清晰边界和低维护成本为准，并同步说明；不为套用模板创建空模块或重复抽象。

## 编码与架构约定

**代码与组件**

- 沿用相邻代码和库的惯用写法，不强制统一为 `React.FC` 或某一种 Props 声明形式。
- 业务组件文件使用 PascalCase，基础 UI 保持库的默认命名，Hook 使用 `useXxx`。
- 遵循 TypeScript 严格检查；外部数据先按 `unknown` 处理，再用 Zod 校验，不用 `any` 或无依据的类型断言绕过真实类型问题。
- Hooks 无条件在组件顶层调用，列表使用稳定的业务 key。
- 渲染只负责展示，网络请求、数据库写入和加密等副作用放在事件或明确的生命周期中。
- 格式交给项目已有 Prettier 配置，不另造格式规则。

**样式与路径**

- 静态样式使用 Tailwind `className` 或功能 CSS，主题颜色集中定义为语义变量，组件中不散落硬编码主题颜色。
- 内联 `style` 仅用于动态 CSS 变量、用户图片地址、拖拽变换等运行时值，不承载整块静态布局；品牌素材和用户自定义颜色按资源或业务数据处理。
- 使用路径别名 `@/* → src/*`，不重复实现类名合并等已有工具。

**状态与业务**

- Zustand 管理共享内存状态和订阅；弹窗开关、拖动、临时选中项及简单输入继续使用 React 局部状态。
- 已保存数据以 IndexedDB 为准，业务修改经过统一 Repository 事务入口，校验并保存成功后再更新共享状态。
- Zustand 不自动同步不同页面；同步写入、备份恢复和私密会话变化都必须通知相关界面刷新。
- React Hook Form 用于全部保存型表单，包括网站、Popup、同步、密码、搜索引擎、备份、导入和单字段导航弹窗；即时保存开关、滑块预览和搜索即时输入保留局部交互状态。保存失败时保留输入、文件和错误反馈。
- 国际化使用稳定语义键和参数插值；业务错误使用明确标识和参数，不解析中文错误文案进行翻译。
- Sonner 用于普通操作通知，字段错误就近展示，阻塞性加载错误提供重试入口，危险操作使用确认对话框。
- Web Locks 只负责本机同源上下文互斥，不替代本地事务、修订校验和远端 ETag / SHA 校验；在目标 Chrome / Firefox 扩展环境验证支持和行为。
- 私密数据的加解密、会话生命周期和缓存脱敏由业务层管理，不自动持久化包含解锁后私密数据的整个 Store。

## 迭代与清理

- 优先采用成熟、维护活跃的现成方案，使用标准 API；仅为明确业务约束做必要封装，不自建通用基础框架。
- 无需兼容旧实现。按当前任务完整替换相关机制，清理旧入口、重复逻辑、无用依赖和仅服务旧实现的测试，不留过渡壳或并行实现。
- 需要保留的数据和备份通过明确转换或导入边界进入新结构，新版运行路径只使用当前模型；不为未知历史版本添加兼容分支，不通过清库完成重构。
- 仅修改当前需求及必要衔接，不顺带实现下一阶段功能。
- 修改源码和项目配置，由 WXT 等工具生成 `.wxt/`、`.output/`、`dist/` 等产物，不直接修改产物。
- 获批的依赖变更使用 pnpm 同步更新 `package.json` 和 `pnpm-lock.yaml`，不手工拼接锁文件。

## 开发与构建命令

```sh
pnpm run dev              # Chrome 开发模式
pnpm run dev:firefox      # Firefox 开发模式
pnpm run typecheck        # TypeScript 检查
pnpm test                 # Vitest 测试
pnpm run test:e2e         # 实际 Chromium 扩展验收；需先运行 build
pnpm run format           # Prettier 格式化
pnpm run format:check     # 格式检查
pnpm run build            # Chrome 生产构建
pnpm run build:firefox    # Firefox 生产构建
pnpm run package          # Chrome ZIP 打包
pnpm run package:firefox  # Firefox ZIP 打包
```

## 任务授权与验证

- 编辑前查看 Git 状态和相关差异，保留用户已有改动；先理解相关实现和检查，再修改。
- 分析和方案默认只读；本文件不自动授权安装依赖、迁移数据或发布。用户明确要求对应实现后，按任务授权推进，已授权事项不重复确认。
- 未经授权，不迁移实际数据、部署、提交、推送、创建 PR 或执行可能丢失数据和用户改动的操作。
- 不硬编码凭证，不在日志或调试状态中暴露密码、令牌和私密明文，不将私密明文写入普通缓存。
- 追查根因，不以吞异常、伪造成功、静默回退或削弱检查掩盖保存、同步和恢复失败。
- 验证深度与改动风险匹配，优先运行已有检查。纯文档修改只检查格式与差异；代码改动检查类型、相关测试和格式，影响扩展入口或构建时验证 Chrome / Firefox 构建。
- 状态、表单、存储和同步改造检查保存失败、刷新重载、部分更新、跨页面刷新；涉及私密数据和备份时检查锁定、解锁及备份往返。
- Playwright 覆盖受影响的关键流程，不为小改动机械新增测试；普通网页预览不能代替浏览器扩展上下文验收。
- 交付前核对差异和废弃逻辑清理，说明实际改动、验证结果及未完成项，不将选型、安装依赖或自动打包成功当作功能已经完成。

## 提交约定

- 获得提交授权后，沿用仓库的 Conventional Commits 格式：`type(scope): 中文描述`，scope 可省略。
- 提交摘要和正文使用中文；type、scope、代码标识及必要技术名词保留英文。
- 类型：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore` / `ci` / `build`。
- 示例：`docs(agents): 明确技术选型与开发约定`、`refactor(state): 使用 Zustand 替换自建状态管理`。
- 每次提交围绕一个可验证的改动，不混入用户已有修改。
