# 开源新标签页对照证据

调研时间：2026-10-03。样本：Tabliss、Bonjourr、nightTab、Anori、Renewed Tab、Mue。通过官方网页、文档及官方仓库当前默认分支读取；本笔记不声称已安装或完整操作六款扩展。仓库默认分支可能早于或晚于商店版本。

主任务另已实看 Bonjourr、Tabliss、Mue 的当前在线设置，截图保存在 `artifacts/research/newtabs/`。Renewed Tab 在线体验发生证书日期错误，本轮未绕过、未实看，其结论限于官方文档和源码。

“已核实”表示文档或当前 UI 源码存在；“未核实”表示本次证据不足，不等于没有。只有官方明确否定才写“明确没有”。宣传中的 privacy 不等于密码加密私密空间。

## 1. Tabliss

- [官网](https://tabliss.io/) / [官方源码](https://github.com/joelshepherd/tabliss) / [网页体验](https://web.tabliss.io/)。不要误用搜索结果中的同名非官方组织。
- 设置结构：背景 → 已添加的小组件 → 系统 → 导入/导出/重置，单列设置面板；语言与时区作为同组普通设置行。[Settings.tsx](https://github.com/joelshepherd/tabliss/blob/main/src/views/settings/Settings.tsx)、[System.tsx](https://github.com/joelshepherd/tabliss/blob/main/src/views/settings/System.tsx)
- 已核实：快捷链接列数、常显、新标签打开；逐链接网址、可选名称、可选图标（无/网站图标/Feather）。编辑在组件设置内完成，未发现独立裁切编辑器。[LinksSettings](https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/links/LinksSettings.tsx)、[Input](https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/links/Input.tsx)
- 背景包含图片、渐变、纯色、Unsplash/GIPHY；时钟含数字/模拟；有搜索、问候语。问候设置只要求姓名；组件显示设置含位置和字号。[问候源码](https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/greeting/GreetingSettings.tsx)、[显示设置](https://github.com/joelshepherd/tabliss/blob/main/src/views/settings/WidgetDisplay.tsx)
- 数据导入导出已核实；跨设备云同步、加密私密空间本次未核实。
- 可取模式：只配置已经添加的组件；链接只需网址，名称和图标均可选。不要继承它以长表单逐个维护链接的负担。

## 2. Bonjourr

- [官网及完整文档](https://bonjourr.fr/) / [官方源码](https://github.com/victrme/Bonjourr) / [网页体验](https://online.bonjourr.fr/)。
- 设置入口：右下角齿轮或右键组件；右键空白新增链接，右键链接编辑，拖到另一链接上建文件夹。高级选项由 Show all settings 展开。[操作指南](https://bonjourr.fr/docs/overview/)
- 已核实：语言、明暗主题、页面宽度/间距、图标样式/圆角/列数、搜索开关/引擎/建议/新标签打开、时钟 12/24/秒/日期、姓名和分时段问候。背景类型含图片/视频/本地/URL/纯色、模糊、亮度。[设置 schema](https://bonjourr.fr/docs/reference/settings-reference/)
- 图标编辑明确三种：自动网站图标、本地文件、远程 URL；编辑名称/网址/图标，在右键所在对象的上下文完成。支持书签组选择后导入、与浏览器书签同步。[Quick Links](https://bonjourr.fr/docs/widgets/quick-links/)
- 设置文件导入/导出明确不包含上传的本地图片；扩展可用浏览器同步，跨浏览器支持 GitHub Gist 的 Get/Send 和远程 URL 拉取。本次未核实可调同步分钟数、加密私密空间。[导入导出](https://bonjourr.fr/docs/settings-management/import-and-export/)、[同步](https://bonjourr.fr/docs/settings-management/syncing/)
- 可取模式：就近右键编辑；先做好默认布局，再将少用调节放到次级层级。不要照搬其所有可调样式或要求用户编辑配置文本。

## 3. nightTab

- [官方仓库](https://github.com/zombieFox/nightTab) / [官方网页体验](https://zombiefox.github.io/nightTab/)。
- 设置是分类导航加子层级：Layout、Group、Bookmark、Header、Toolbar、Theme、Language、Data 等；Header 内再分时钟/日期/搜索。[菜单源码](https://github.com/zombieFox/nightTab/blob/main/src/component/menuContent/index.js)、[Header 设置](https://github.com/zombieFox/nightTab/blob/main/src/component/menuContent/headerSetting/index.js)
- 书签编辑包含内容、地址、位置、布局、主题；视觉来源为 letter / icon / image，并提供对齐、大小、名字、颜色、透明度、边框等大量细项。[书签表单](https://github.com/zombieFox/nightTab/blob/main/src/component/bookmarkForm/index.js)
- 背景支持图片及视频 URL；数据可分书签/主题/设置恢复，导出带日期的 JSON。官方说明数据全部本地保存，不存远程数据库。密码空间未核实。[背景文档](https://github.com/zombieFox/nightTab/wiki/Setting-a-background-video-or-image)、[备份恢复](https://github.com/zombieFox/nightTab/wiki/Data-backup-and-restore)
- 可取模式：数据操作按任务分区；可复用已有书签样式。它的深度编辑选项过多，不能成为 RayTab 保留每个样式控件的理由。

## 4. Anori

- [官网](https://anori.app/) / [官方仓库](https://github.com/OlegWock/anori)。
- 设置分类：General、云账号、自定义图标、文件夹、插件、主题、导入导出、帮助。语言在 General 第一项；侧栏方向/自动隐藏、紧凑模式、最近文件夹与书签栏同属 General。[分类](https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/sections.tsx)、[General](https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/screens/GeneralSettingsScreen.tsx)
- 图标编辑：左侧图标预览按钮，右侧名称/网址；点图标弹出选择器，支持图标集、搜索、自定义图标。次级行为是新标签打开和站点状态检测，底部保存。[书签编辑](https://github.com/OlegWock/anori/blob/master/src/plugins/bookmark/widgets/BookmarkWidgetConfig.tsx)、[IconPicker](https://github.com/OlegWock/anori/blob/master/src/components/IconPicker/IconPicker.tsx)
- 已核实：拖拽小组件、文件夹分区、预置/自定义主题；世界时钟的时区、时间和日期格式；ZIP 导入导出与 Anori Plus 云同步入口。常规搜索引擎设置、加密私密空间本次未核实。[时钟编辑](https://github.com/OlegWock/anori/blob/master/src/plugins/datetime/widgets/DatetimeWidgetConfig.tsx)、[导入导出](https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/screens/ImportExportScreen.tsx)
- 可取模式：语言归入一般设置，不单独漂浮在导航底部；图标是可点击预览，选择器是第二层，首屏集中在链接本身。

## 5. Renewed Tab

- [官网](https://renewedtab.com/en/) / [官方 GitHub 镜像](https://github.com/rubenwardy/renewedtab)（主仓库在 GitLab）/ [网页体验](https://web.renewedtab.com/)。
- 设置为居中宽弹窗，左侧六类：General、Widget Grid、Background、Theme、Import/Export、About。语言在 General；组件自己的行为和外观在各组件编辑内。[SettingsDialog](https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/SettingsDialog.tsx)、[General](https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/GeneralSettings.tsx)
- 已核实：拖动/调整组件尺寸；搜索引擎、12/24 时钟；随机/纯色/Unsplash/RSS/自定义背景；主题字体、字号比例、面板圆角/模糊/深浅、主色。[主题](https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/ThemeSettings.tsx)
- 快捷链接组件支持标题、图标、网站图标、自定义图标及新标签打开，通过 schema 表单编辑，另有链接导入导出。[Links](https://github.com/rubenwardy/renewedtab/blob/master/src/app/widgets/Links.tsx)
- 官方 FAQ 明确没有 Chrome/Firefox browser sync，建议 Import/Export；不要据此推断所有形式的云功能永久不存在。密码空间未核实。[FAQ](https://renewedtab.com/en/help/faq/)
- 可取模式：一般设置与对象编辑分离；组件只有进入编辑模式才显示操作。面板宽度为任务服务，不必保留窄右抽屉。

## 6. Mue

- [官网](https://muetab.com/) / [官方仓库](https://github.com/mue/mue) / [网页体验](https://demo.muetab.com/)。
- 设置是主弹窗中的分类内容；按时钟、日期、背景、搜索、快捷链接、外观、语言、高级等功能组织，语言有明确导航归属。[Settings](https://github.com/mue/mue/blob/main/src/features/misc/views/Settings.jsx)、[导航配置](https://github.com/mue/mue/blob/main/src/components/Elements/MainModal/constants/tabConfig.js)
- 已核实：时钟 12/24/秒、数字/模拟样式；搜索聚焦等行为；背景模糊/亮度、主题、字体、问候名字、快捷链接外观。具体可用搜索引擎受扩展发行与商店政策影响，不按默认 JSON 推断全部可见。[默认字段](https://github.com/mue/mue/blob/main/src/utils/data/default_settings.json)、[时钟](https://github.com/mue/mue/blob/main/src/features/time/options/TimeOptions.jsx)、[搜索](https://github.com/mue/mue/blob/main/src/features/search/options/SearchOptions.jsx)
- 快捷链接可拖动排序；编辑弹窗仅名称、网址、可选图标 URL，缺省自动获取图标；有图标/纯文字/metro 三种布局。[快捷链接](https://github.com/mue/mue/blob/main/src/features/quicklinks/options/QuickLinksOptions.jsx)、[编辑弹窗](https://github.com/mue/mue/blob/main/src/components/Elements/AddModal/AddModal.jsx)
- 导入导出源码已核实；跨设备自动同步、密码空间未核实。[导入](https://github.com/mue/mue/blob/main/src/utils/settings/import.js)、[导出](https://github.com/mue/mue/blob/main/src/utils/settings/export.js)
- 可取模式：每项设置的标题、说明、控件有固定栏位；快捷链接管理列表和单个编辑表单分开。无需照搬它众多组件和设置分类。

## 对 RayTab 特定设置的证据判断

| RayTab 项目          | 对照证据                                                                            | 本次取舍建议                                                                           |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 语言孤立在侧栏最底   | Anori、Renewed Tab 在 General；Mue 有语言分类；Tabliss 在系统设置组                 | 保留语言能力，移入一般设置中的完整设置行                                               |
| 每字段“继承普通空间” | 六个样本的已查设置层级和 schema 未找到这种设置界面；不是证实任何同类都没有          | 删除表单旁逐项继承控件；私密数据不能因删 UI 丢失，保留安全边界另作产品决策             |
| 五时段问候 JSON 模板 | Tabliss 仅姓名；Bonjourr 有自动/自定义及四时段字符串，无需 JSON 输入                | 删除 JSON 编辑器；常规入口仅问候开关与称呼                                             |
| 每部件六种文字颜色   | nightTab 深度定制确实存在逐项颜色；Anori 维护者明确主张单一主色产生协调主题         | 保留统一文字/主题可读性策略，删除重复部件配色表单；不能声称“同行都没有颜色设置”        |
| 圆角预设加连续滑块   | Bonjourr 有圆角设置；nightTab 有边框/形状细项                                       | 保留单一形状选择方式，去掉同值重复控制                                                 |
| 可调同步分钟数       | Bonjourr 官方 Gist 文档为手动 Get/Send；Anori 云同步为持续同步；本次未见分钟间隔 UI | 删除用户填写间隔的控件，调度留业务内部，不删除已存在同步能力                           |
| 备份/恢复/导入       | 六个样本均存在可核实的数据入口                                                      | 保留；首页只展示动作行，选文件后再出现预览和目标选择，避免三个上传表单常驻             |
| 图标编辑多个来源     | Bonjourr 三种来源；nightTab 三种视觉；Anori 为图标选择器；Mue 只有可选 URL          | RayTab 保持网站/文字/上传三种，首屏重点是最终预览和网址/名称，只展开当前来源需要的输入 |

## 真实反馈及边界

以下是具体用户反馈和维护者回复，不是统计调查，也不直接当作当前版本可复现缺陷。状态来自 2026-10-03 GitHub API。

| 来源、时间、状态                                                                              | 反馈事实                                                                                                            | 对 RayTab 的决策意义                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [nightTab #305](https://github.com/zombieFox/nightTab/issues/305)，2021-10-12，Open，历史请求 | 用户认为新增书签太慢、太复杂，希望沿用已有样式，只改标题/地址/分组/背景                                             | 新增界面不暴露全套风格参数；给可靠默认值。不是声称 2026 版有新 bug                               |
| [Bonjourr #757](https://github.com/victrme/Bonjourr/issues/757)，2026-01-09，Open             | 黑色网站图标遇到夜间壁纸难辨，希望能改变图标颜色或换图标                                                            | 自动获取应保留品牌原图，同时允许文字图标和上传；预览要置于真实明暗背景中，不能机械全部白底       |
| [Anori #297](https://github.com/OlegWock/anori/issues/297)，2026-05-13，Closed 2026-05-30     | 用户恢复旧备份失败并困惑于云同步提示；维护者修复其文件并给出旧版本升级迁移方法                                      | 清楚区分导入成功与否，先预览再替换；不能为了简化界面让已有备份失效。问题已有处理，不作为当前 bug |
| [Anori #304](https://github.com/OlegWock/anori/issues/304)，2026-06-25，Closed 2026-06-28     | 用户希望减少 Home 标题并移动编辑按钮；维护者考虑直接删标题而非再加隐藏开关，另开 #305 跟进                          | 可以移除无价值装饰和常驻编辑入口，不能每次设计缺陷都变成新开关                                   |
| [Anori #314](https://github.com/OlegWock/anori/issues/314)，2026-07-17，Closed 2026-07-19     | 用户不满透明度/颜色自由度降低；维护者解释新系统选择单一颜色生成整体主题，拒绝恢复所有颜色控制，其他问题转已有 issue | 简化存在取舍，不应假称所有用户都不需要；RayTab 本次依用户方向减少参数，但保留一致、可读的主题    |
| [Mue #890](https://github.com/mue/mue/issues/890)，2024-10-12，Open，历史请求                 | 用户反映每次新标签换背景有等待，希望按间隔换                                                                        | 保持已有图片即时可见，更新异步完成；不要为动画牺牲新标签首屏                                     |
| [Bonjourr #884](https://github.com/victrme/Bonjourr/issues/884)，2026-06-25，Open             | 用户报告重开设置值空了，但桌面仍显示旧设置，导出也未反映所选值                                                      | 验收必须包含设置重开、重载和导出往返，不能只截图或只验证保存按钮                                 |

另外，[Bonjourr #872](https://github.com/victrme/Bonjourr/issues/872)（2026-06-19，Open）是维护者提出合并分散的玻璃效果设置，参与者同时讨论透明度与可读性。它支持“统一材质语义”的设计方向，并不能证明透明材质必然更漂亮。

## 推荐组合

采用 Anori / Renewed Tab 的“集中设置工作区 + 一般设置归属”，Bonjourr 的“对象右键就近编辑”，Mue 的“有规律的标题/说明/控件行”，并避免 nightTab 深度样式面板的复杂度。RayTab 形成自身统一界面：导航尺寸和卡片间距固定、动作使用明显主次、语言归入一般设置、备份恢复按流程展开、网站编辑先预览再做当前来源所需输入。
