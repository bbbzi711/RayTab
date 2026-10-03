# RayTab 设置与图标编辑设计基准

2026-10-03，根据用户最新方向，停止一比一复刻 iTab。综合 13 款新标签页的官方资料、源码和部分实际在线界面，建立 RayTab 自己的设置与编辑结构。本文件是本轮实施基准，不是已完成验收报告。

完整依据见[商业产品研究](research/newtab-products.md)、[开源产品研究](research/newtab-open-source.md)及[逐项决策表](research/settings-decisions.md)。研究中的“未核实”不能写成“不支持”；个别用户反馈不能代表全体用户。

## 交互原则来源

- [Anori 一般设置](https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/screens/GeneralSettingsScreen.tsx)和 [Renewed Tab 设置工作区](https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/SettingsDialog.tsx)：语言等全局偏好有正常归属，宽度服务于任务。
- [Bonjourr Quick Links](https://bonjourr.fr/docs/widgets/quick-links/)：右键进入当前对象的编辑，首页不常驻额外设置按钮。
- [Mue 设置结构](https://github.com/mue/mue/blob/main/src/features/misc/views/Settings.jsx)：标签、说明、控件位置保持规律；RayTab 采用更少分类和调节项。
- [Toby 导入](https://help.gettoby.com/support/solutions/articles/66000524947-how-do-i-import-resources-into-toby-)和[导出](https://help.gettoby.com/support/solutions/articles/66000508502-how-to-export-your-collections)：先选任务，再显示文件、范围和确认，避免三个完整表单常驻。
- [Anori 书签编辑](https://github.com/OlegWock/anori/blob/master/src/plugins/bookmark/widgets/BookmarkWidgetConfig.tsx)与 [start.me 图标编辑](https://support.start.me/en/articles/9182861-change-a-bookmark-icon)：围绕一个链接和最终图标，复杂选择按需出现。

不照搬任何产品的全部分类、账号体系、素材商店或微调项。nightTab 存在详细配色，Bonjourr 存在分时段问候；删除 RayTab 细分配色与问候 JSON 编辑，是响应用户精简要求的产品取舍。

## 设置工作区

| 项目 | RayTab 设计目标                                          |
| ---- | -------------------------------------------------------- |
| 容器 | 居中工作区，桌面目标宽 840px、高 640px；窄屏适配可用宽度 |
| 分类 | 通用、图标与布局、外观、搜索与时钟、同步、数据           |
| 导航 | 文字配同一套线性图标，不再每项套深色方块                 |
| 标题 | 分类标题及必要说明；保存状态轻量，错误及重试可见         |
| 内容 | 扁平分节，用间距与分隔建立层级；不为单个开关另套卡片     |
| 控件 | 标签、说明、输入统一对齐，设置行具有一致高度与节奏       |
| 色彩 | 中性背景、有限强调色、明确主次按钮；深色沿用相同语义     |
| 语言 | 放入通用内容，不独立钉在侧栏底部                         |
| 隐私 | 通用安全分节；按需启用、更换、取消保护，保留确认         |
| 继承 | 删除每行继承说明与按钮，合为一处恢复跟随动作             |
| 数据 | 导入书签、导出备份、恢复备份三个任务入口；进入后展示参数 |
| 同步 | 默认显示连接与状态；配置、冲突和维护操作按需出现         |

上述尺寸为 RayTab 自身布局决策，不是竞品实测值。沿用现有自动保存与保存型表单；隐藏模块时收起细项，切换分类不丢未提交草稿。失败保留输入并明确反馈。

## 图标编辑

网站及文件夹不再显示右上角“…”；使用右键或 Shift+F10 打开菜单，网站仅保留编辑网站、移动、删除。图标修改包含在编辑网站内。存入位置直接显示分组或文件夹名。已收录网站使用本地 SVGL 社区目录与必要品牌底色处理；其他网站同时尝试站点图标和公共服务，不放大低清 favicon；私密空间不走第三方。壁纸在 React 前恢复本地图片，首张无淡入，换图失败保留旧图。细节见 [图标与壁纸启动](icons-and-startup.md)。

| 项目     | RayTab 设计目标                                          |
| -------- | -------------------------------------------------------- |
| 容器     | 桌面目标宽 600px；窄屏可滚动，主要操作容易到达           |
| 首屏     | 网址、名称及存入位置全宽，96px 小预览归入图标选择区      |
| 来源     | 网站图标、文字图标、上传图片三种                         |
| 按需字段 | 文字来源才显示文字输入；自定义图片才显示图片工具         |
| 配色     | 自动品牌底色或常用实色；彩色 Logo 保持原色，图片默认白底 |
| 图片工具 | 裁切与缩放在按需流程完成，不堆满初始表单                 |
| 保存     | 一个明显主操作，取消为次级；删除仍属于网站对象菜单       |
| 状态     | 加载、取图失败、校验与保存失败就近反馈；切换来源保留草稿 |

Radix UI、React Hook Form、Zod、React Easy Crop 和现有 Repository 继续负责交互及保存。视觉重排不另建状态、表单或图片保存机制。

底色色板采用白、黑、蓝、青、绿、黄、橙、红、粉、紫十种常用颜色，另保留自动和自定义。白色色块带细边框，各颜色有明确名称；历史自定义颜色继续保留。字段名称为“图标底色”，改变底色不会把 YouTube 红色、B 站粉色、DeepSeek 蓝色或 Google 多色 Logo 统一染成白色；单色标记根据底色保持对比度。

Gemini 使用 [Google 公开 CDN 原始素材](https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg)，原样保存到 `src/features/navigation/assets/gemini.svg` 并随扩展本地打包，运行时不请求 Google CDN。此品牌素材属于 Google，不适用项目代码的 MIT 授权。产品域名优先识别，不将 Gemini 或其他 Google 子产品替换成通用 Google G。

## 删除与保留边界

删除五时段问候 JSON 全流程、六部件独立文字颜色、逐行继承控件和重复圆角预设。默认问候与自动文字对比度保留，圆角只有一种控制方式。

保留实际网站、文件夹、图标和壁纸、私密加密、用户搜索引擎及有效备份。导入目的地、备份密码、恢复范围和覆盖确认属于任务的必要参数，不因设置页精简而静默删除。

## 参考材料与验收

- `artifacts/research/newtabs/` 是本轮部分在线界面的研究截图，实看范围见研究记录。
- `artifacts/visual-review/replica-reference/` 与 `artifacts/visual-review/replica/` 是此前复刻阶段的历史材料，不代表本轮设计或完成结果。
- 本轮实际扩展截图与几何记录在 `artifacts/visual-review/redesign/`，覆盖六类设置、图标编辑、数据任务、明暗主题与窄屏。
- 重开设置、刷新、部分更新、保存失败、跨页通知、私密锁定/解锁和备份往返的实际结果及限制见 [验收记录](modernization-validation.md)。截图检查与行为回归分别记录。
