# 设置删减与重组决策

日期：2026-10-03。依据[改造前字段盘点](current-settings-inventory.md)、[商业产品研究](newtab-products.md)和[开源产品研究](newtab-open-source.md)。本轮已按此取舍实施，实际验证及限制见[验收记录](../modernization-validation.md)。

## 证据口径与结构

研究共 13 款：iTab、Infinity New Tab Pro、WeTab、Momentum、Toby、Group Speed Dial、start.me、Tabliss、Bonjourr、nightTab、Anori、Renewed Tab、Mue。证据来自官方文档、开发者说明、源码及部分实际在线界面；没有完整安装、操作全部产品。实看范围及访问限制见两份研究记录。

“未核实”不等于没有。同行有类似能力也不意味着全部移植：nightTab 确有逐项颜色，Bonjourr 确有分时段问候。本轮删除 RayTab 过细的配置流程，是按用户要求收敛界面，不能声称这些功能在同类中不存在。

设置改为居中、桌面目标 840×640px 的工作区，采用扁平分节和统一设置行，六类为：

1. 通用：语言、链接打开方式、分组栏、私密保护和整体恢复跟随。
2. 图标与布局：大小、单一圆角控制、间距、标题、列数。
3. 外观：主题、壁纸、必要亮度处理。
4. 搜索与时钟：模块显隐、引擎、时间格式和日期。
5. 同步：连接状态、按需配置、立即同步及维护。
6. 数据：导入书签、导出备份、恢复备份三个任务入口。

语言不再钉在侧栏底部。图标编辑目标宽 600px，96px 预览放在图标区内，保留网站、文字、上传三来源，仅展示当前来源需要的输入。这些尺寸是 RayTab 自身决策，不是竞品实测值。

## 原 28 个空间设置字段

| 原字段               | 决策与新位置                                   | 直接同类依据及证据边界                                                                                                        |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `language`           | **保留并移动**至通用完整设置行                 | [Anori General][anori-general]、[Renewed Tab General][renewed-general]将语言放一般设置                                        |
| `theme`              | **保留**，外观中系统 / 明亮 / 深色             | [WeTab 开发者说明][wetab]有深浅与系统主题；[Toby][toby-theme]也有主题入口                                                     |
| `searchEngine`       | **保留**，搜索内选择；首页快捷切换继续存在     | [Bonjourr 设置参考][bonjourr-settings]有搜索引擎；[Mue 搜索选项][mue-search]有行为配置                                        |
| `searchEngines`      | **保留**用户名称与 URL，按需编辑               | [iTab 更新记录][itab]、[Bonjourr][bonjourr-settings]有自定义搜索；不清空现有引擎                                              |
| `openInNewTab`       | **移动**至通用，文案同时覆盖网站和搜索         | [start.me 用户偏好][start-preferences]、[Tabliss 链接设置][tabliss-links]有打开方式；不新增两个重复开关                       |
| `showClock`          | **保留**，关闭后收起时间细项                   | [Momentum Settings][momentum-settings]管理模块显隐；[Bonjourr][bonjourr-settings]有时钟配置                                   |
| `showSearch`         | **保留**，关闭不删除引擎                       | [iTab][itab]明确搜索栏可隐藏；[Bonjourr][bonjourr-settings]有搜索开关                                                         |
| `showDate`           | **保留**，与时间同组                           | [Bonjourr][bonjourr-settings]、[Mue 时钟选项][mue-time]有日期设置                                                             |
| `showLunar`          | **保留**日期中的农历显示                       | 实看 [iTab 网页版](https://go.itab.link/)“时间/日期”设置，明确有农历复选框；截图为 `artifacts/research/newtabs/itab-date.jpg` |
| `showGreeting`       | **保留**默认问候显隐                           | [Momentum 问候][momentum-greeting]按本地时间生成默认问候；[Tabliss][tabliss-greeting]也有问候组件                             |
| `customGreetings`    | **删除**五时段 JSON 导入、模板、恢复默认及字段 | [Bonjourr][bonjourr-settings]有分时段文本，不是同行没有；本轮选择 [Momentum 自动问候][momentum-greeting]的简单体验            |
| `showSiteTitle`      | **保留**显隐，不删除名称数据                   | [Tabliss 链接输入][tabliss-input]支持可选名称；[nightTab][nighttab-bookmark]有名称外观                                        |
| `hour12`             | **保留**一个时间格式选择                       | [Momentum Clock][momentum-clock]、[Mue][mue-time]明确支持 12/24 小时                                                          |
| `cardSize`           | **合并为内部尺寸**，只显示一个图标大小控件     | [Infinity][infinity]支持图标尺寸与布局；内部卡片尺寸不是额外用户偏好                                                          |
| `iconSizeRatio`      | **合并为内部比例**，与尺寸成对更新             | 同上 [Infinity][infinity]；不向用户再暴露比例参数                                                                             |
| `maxCardsPerRow`     | **保留**列数 / 每行最多                        | [Tabliss][tabliss-links]有列数；[Group Speed Dial 布局][gsd-layout]有行列控制                                                 |
| `iconSpacing`        | **保留**一个间距控制                           | [Bonjourr][bonjourr-settings]有间距和布局；不引入每轴多组调节                                                                 |
| `iconRadius`         | **保留单一控制，删除重复预设**                 | [Bonjourr][bonjourr-settings]有圆角；[nightTab][nighttab-bookmark]有形状细项，不必同时预设加滑块                              |
| `sidebarMode`        | **移动**至通用分组栏显示                       | [Anori General][anori-general]有自动隐藏；[WeTab][wetab]有侧栏显隐；不改变分组内容                                            |
| `background`         | **保留并整合**壁纸选择流程                     | [Tabliss][tabliss-settings]、[Bonjourr][bonjourr-settings]有图片、渐变、纯色等来源                                            |
| `gradient`           | **保留**少量视觉预设                           | [Tabliss][tabliss-settings]、[WeTab][wetab]有渐变；不暴露 CSS 文本                                                            |
| `solidColor`         | **保留**纯色来源的色值输入                     | [start.me 页面设置][start-page]、[Bonjourr][bonjourr-settings]有纯色背景                                                      |
| `wallpaperId`        | **保留**本地图片，按来源出现文件操作           | [Bonjourr][bonjourr-settings]、[iTab][itab]有本地壁纸；资源引用不能随 UI 简化清除                                             |
| `onlineWallpaperUrl` | **保留**自定义壁纸 URL                         | [Bonjourr][bonjourr-settings]、[nightTab 背景][nighttab-background]支持 URL 背景                                              |
| `featuredPhotoUrl`   | **移动为壁纸动作结果**，“换一张”贴近预览       | [Tabliss][tabliss-settings]有照片来源；[Renewed Tab][renewed-settings]有背景分类。RayTab 素材数量是自身实现                   |
| `overlay`            | **保留**壁纸亮度 / 遮罩                        | [Bonjourr][bonjourr-settings]、[Mue 默认设置][mue-defaults]有亮度；不再加重复透明度项                                         |
| `textColorMode`      | **删除**独立模式，固定自动对比度               | [nightTab][nighttab-bookmark]确有深度颜色；[Anori #314][anori-colors]说明统一主题取舍。删除依用户精简要求，不声称同行缺席     |
| `textColors`         | **删除**六部件持久化色值；保留内部语义色       | 同上 [nightTab][nighttab-bookmark]与 [Anori #314][anori-colors]；牺牲逐部件自由度，保持文字一致可读                           |

## 网站与图标编辑

| 原字段 / 操作                     | 决策                               | 直接同类依据及边界                                                                                                       |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `url`                             | **保留**网址主输入                 | [Momentum Links][momentum-links]、[Mue 编辑弹窗][mue-edit]以名称与网址编辑链接                                           |
| 获取图标                          | **保留为动作**，贴近网址或网站来源 | [Mue 快捷链接][mue-links]缺省自动获取；[Bonjourr][bonjourr-links]有自动图标。失败明确，允许手动完成                      |
| `title`                           | **保留**名称主输入                 | [Momentum][momentum-links]、[Anori 书签编辑][anori-bookmark]直接对应；不因隐藏标题删除名称                               |
| `location`、`groupId`、`folderId` | **保留**目的地，轻量显示           | [nightTab 表单][nighttab-bookmark]有位置；[Bonjourr][bonjourr-links]有文件夹；不得无说明移动已有网站                     |
| `iconType` / `icon.source`        | **保留三种**来源和单一最终预览     | [start.me 图标][start-icon]有文字与上传；[nightTab][nighttab-bookmark]有 letter/icon/image。不同产品三种来源并非完全相同 |
| `textIcon` / `icon.text`          | **按需显示**，只在文字来源出现     | [start.me][start-icon]支持文字；不在其他模式放禁用输入                                                                   |
| `websiteResourceId`               | **保留内部草稿**，不作为设置       | [Bonjourr][bonjourr-links]有自动图标结果；具体内部缓存方式未核实，RayTab 缓存用于保存及备份                              |
| `uploadResourceId` / 文件         | **保留内部草稿与上传动作**         | [start.me][start-icon]、[Anori IconPicker][anori-icon]支持自定义图标；保存失败保留文件                                   |
| 裁切 / 缩放                       | **保留按需图片工具**，移出编辑首屏 | [start.me][start-icon]确认上传，未核实同样裁切 UI。此工具直接解决本用户提出的图片留边问题，作为已授权编辑任务保留        |
| 保留完整图片                      | **合并为条件图片操作**             | [start.me][start-icon]有恢复默认，但与 RayTab 还原本次裁切不同；只参考可恢复编辑原则                                     |
| `iconBackground`                  | **保留图标自身**自动 / 自定义实色  | [Infinity][infinity]支持图标色；按用户最新反馈删除透明选项，图片与文件夹使用实色底板，不重新加入外层卡片背景             |
| 保存 / 取消 / 关闭                | **保留**主次动作及草稿保护         | [Anori][anori-bookmark]、[Momentum][momentum-links]有明确保存；一次仅保存当前结果                                        |

## 数据任务

默认只展示三个任务入口。文件、范围、预览、密码和确认在对应流程出现，不作为长期偏好常驻。

| 原项目                 | 决策                         | 直接同类依据及边界                                                                                            |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 导入书签               | **收为动作行**               | [Toby 导入][toby-import]先发起任务再选格式与文件；[start.me][start-import]先选来源                            |
| 浏览器读取 / HTML 文件 | **移入导入流程**             | [Bonjourr][bonjourr-links]支持书签组导入；[Toby][toby-import]支持文件输入                                     |
| 预览文件与网站         | **保留在提交前**             | [Toby][toby-import]有确认步骤；具体网站预览样式为 RayTab 自身设计                                             |
| 平铺 / 保留文件夹      | **移入导入预览**             | [Bonjourr][bonjourr-links]有分组导入；两种精确模式未逐一核实，为当前导入结构所需参数                          |
| 跳过重复 / 全部保留    | **仅作为导入参数**，默认去重 | [start.me][start-import]有导入任务，未核实同名开关；保留安全去重逻辑，不虚构精确对照                          |
| 目标分组               | **保留在导入流程**           | [Bonjourr][bonjourr-links]分组导入直接相关；目的地涉及实际组织数据                                            |
| 导出备份               | **收为动作行**               | [Toby 导出][toby-export]按范围发起；[Group Speed Dial][gsd-backup]区分导出与恢复                              |
| 导出范围               | **移入导出流程**             | [Toby][toby-export]支持集合、组织、账号范围；RayTab 使用自己的空间模型                                        |
| 私密备份密码           | **保留条件输入**             | [Group Speed Dial E2EE][gsd-e2ee]有加密与恢复职责，不等于相同文件格式；既有私密保护不能弱化                   |
| 恢复入口与文件         | **收为动作行**               | [Group Speed Dial][gsd-backup]、[nightTab][nighttab-backup]有专门恢复入口                                     |
| 恢复摘要               | **选文件后展示**             | [nightTab][nighttab-backup]分书签、主题、设置恢复；RayTab 摘要说明影响的空间与记录                            |
| 合并 / 替换            | **保留在恢复确认阶段**       | [nightTab][nighttab-backup]说明恢复范围；同名两策略未逐一核实。不能为少控件默默改成覆盖                       |
| 解密密码、替换确认     | **保留必要安全步骤**         | [Group Speed Dial E2EE][gsd-e2ee]区分加密恢复；[Anori #297][anori-backup]提醒保持已有备份可恢复，只是个体问题 |

## 同步与私密保护

| 原项目                             | 决策                               | 直接同类依据及边界                                                                                                      |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 同步入口                           | **保留**连接状态为首屏             | [Anori 分类][anori-sections]有云账号；[Bonjourr][bonjourr-sync]有独立同步职责                                           |
| WebDAV / GitHub / Gitee            | **保留既有能力，按服务展开**       | [Bonjourr][bonjourr-sync]为 GitHub Gist，并非仓库同步；本次未核实 WebDAV/Gitee，不能因未知直接删已用连接                |
| URL / 用户名 / 密码                | **仅 WebDAV 连接中出现**           | [Bonjourr][bonjourr-sync]说明外部连接需要配置，但不具有这些相同字段；RayTab 的协议必要输入不算独立偏好                  |
| 令牌 / 所有者 / 仓库 / 路径 / 分支 | **仅 Git 连接中出现**              | [Bonjourr][bonjourr-sync]有外部 GitHub 连接，具体协议字段不同；技术输入不占默认首屏                                     |
| 自动同步                           | **保留一个启停项**                 | [start.me][start-sync]有修改即保存；[Anori][anori-sections]有云同步入口；不复制云账号后台                               |
| 同步分钟间隔                       | **不引入**                         | 当前本就没有该控件；[Bonjourr][bonjourr-sync]为 Get/Send。不能把研究建议误报为已删除现有间隔项                          |
| 同步私密空间                       | **保留明确选择**                   | [Group Speed Dial E2EE][gsd-e2ee]区分私密加密与同步；不能因少一项而自动扩大上传范围                                     |
| 私密同步密码                       | **保留条件输入**                   | [Group Speed Dial E2EE][gsd-e2ee]有密钥任务；RayTab 保持会话内密码                                                      |
| 保存连接                           | **保留提交动作**                   | [Bonjourr][bonjourr-sync]连接和远端操作职责独立；保存配置不能伪装已同步                                                 |
| 立即同步                           | **保留状态旁主动作**               | [Bonjourr][bonjourr-sync]有手动同步；[start.me][start-sync]区分自身保存与浏览器同步                                     |
| 成功 / 错误 / 重试                 | **合为紧凑状态**，错误可见         | [Bonjourr][bonjourr-sync]有远端操作；[Anori #297][anori-backup]是错误反馈的具体案例，不代表普遍故障                     |
| 本机覆盖 / 云端恢复                | **移入按需维护**                   | [Bonjourr][bonjourr-sync]有 Get/Send；RayTab 继续说明方向和覆盖影响，不以模糊“同步”代替                                 |
| 清除连接                           | **保留次级动作和确认**             | [Anori 云账号入口][anori-sections]体现连接管理；实际清理依 RayTab 契约，只清本机，不删云端                              |
| 冲突选择                           | **仅有冲突时显示**                 | [Group Speed Dial E2EE][gsd-e2ee]涉及独立加密数据；未核实同名逐项 UI，保留是既有同步正确性需要                          |
| 私密空间保护                       | **移动**至通用安全分节             | [Group Speed Dial 锁组][gsd-lock]有密码，但本地锁不加密；[Toby 私密集合][toby-private]是访问控制，均不等同 RayTab vault |
| 启用 / 更换 / 取消密码             | **保留按需安全任务**               | [Group Speed Dial][gsd-lock]有主密码与解锁；不因精简取消已有加密或删除内容                                              |
| 每行继承状态与按钮                 | **删除常驻逐行 UI**                | [start.me 页面设置][start-page]有 Auto 跟随全局，所以不能声称同类从无继承                                               |
| 整体恢复跟随                       | **合并为一处动作**                 | 同上 [start.me][start-page]；保留已有覆盖与重置事务，不新增平行模型，不清空私密网站                                     |
| 继承项计数独立分节                 | **删除大分节**，必要时并入动作说明 | [Anori General][anori-general]集中一般偏好；内部计数没有独立用户任务                                                    |

## 实施与验证边界

- 不清库，不删除真实网站、文件夹、图片、密码保护或用户自定义引擎。
- 退役的三个展示字段连同模型、UI、消费者和专属旧测试共同退出。现有 Zod 输入边界剔除多余字段，运行期不保留隐藏旧模式。
- 入口移动后，右键、设置深链与键盘焦点必须同步检查。
- 在实际扩展验收明暗主题、窄屏、保存失败、重开设置、刷新、部分更新、私密锁定/解锁及备份往返；不能只凭截图或构建完成。
- [Anori #304][anori-header]、[nightTab #305][nighttab-complexity]是具体用户与维护者反馈，不代表所有用户支持精简。最终取舍来自当前用户要求与 RayTab 功能边界。

[anori-general]: https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/screens/GeneralSettingsScreen.tsx
[renewed-general]: https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/GeneralSettings.tsx
[wetab]: https://chromewebstore.google.com/detail/wetab-%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/aikflfpejipbpjdlfabpgclhblkpaafo?hl=zh-Hans
[toby-theme]: https://help.gettoby.com/support/solutions/articles/66000496101-how-to-change-themes
[bonjourr-settings]: https://bonjourr.fr/docs/reference/settings-reference/
[mue-search]: https://github.com/mue/mue/blob/main/src/features/search/options/SearchOptions.jsx
[itab]: https://www.itab.link/changelog.html
[start-preferences]: https://support.start.me/en/articles/9182899-change-user-preferences-display-settings
[tabliss-links]: https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/links/LinksSettings.tsx
[momentum-settings]: https://get.momentumdash.help/hc/en-us/articles/360016334234-Settings
[momentum-greeting]: https://get.momentumdash.help/hc/en-us/articles/115007629867-Greetings-display
[tabliss-greeting]: https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/greeting/GreetingSettings.tsx
[mue-time]: https://github.com/mue/mue/blob/main/src/features/time/options/TimeOptions.jsx
[tabliss-input]: https://github.com/joelshepherd/tabliss/blob/main/src/plugins/widgets/links/Input.tsx
[nighttab-bookmark]: https://github.com/zombieFox/nightTab/blob/main/src/component/bookmarkForm/index.js
[momentum-clock]: https://get.momentumdash.help/hc/en-us/articles/360012371613-Clock
[infinity]: https://www.infinitynewtab.com/
[gsd-layout]: https://github.com/fastaddons/GroupSpeedDial/wiki/Group-layouts
[tabliss-settings]: https://github.com/joelshepherd/tabliss/blob/main/src/views/settings/Settings.tsx
[start-page]: https://support.start.me/en/articles/9182828-page-settings-background-columns-preferences
[nighttab-background]: https://github.com/zombieFox/nightTab/wiki/Setting-a-background-video-or-image
[renewed-settings]: https://github.com/rubenwardy/renewedtab/blob/master/src/app/features/settings/SettingsDialog.tsx
[mue-defaults]: https://github.com/mue/mue/blob/main/src/utils/data/default_settings.json
[anori-colors]: https://github.com/OlegWock/anori/issues/314
[momentum-links]: https://get.momentumdash.help/hc/en-us/articles/360012256494-Links
[mue-edit]: https://github.com/mue/mue/blob/main/src/components/Elements/AddModal/AddModal.jsx
[mue-links]: https://github.com/mue/mue/blob/main/src/features/quicklinks/options/QuickLinksOptions.jsx
[bonjourr-links]: https://bonjourr.fr/docs/widgets/quick-links/
[anori-bookmark]: https://github.com/OlegWock/anori/blob/master/src/plugins/bookmark/widgets/BookmarkWidgetConfig.tsx
[start-icon]: https://support.start.me/en/articles/9182861-change-a-bookmark-icon
[anori-icon]: https://github.com/OlegWock/anori/blob/master/src/components/IconPicker/IconPicker.tsx
[toby-import]: https://help.gettoby.com/support/solutions/articles/66000524947-how-do-i-import-resources-into-toby-
[start-import]: https://support.start.me/en/articles/9182856-import-bookmarks-into-start-me
[toby-export]: https://help.gettoby.com/support/solutions/articles/66000508502-how-to-export-your-collections
[gsd-backup]: https://github.com/fastaddons/GroupSpeedDial/wiki/Backup-dials-data
[gsd-e2ee]: https://github.com/fastaddons/GroupSpeedDial/wiki/Data-synchronization-with-End%E2%80%90to%E2%80%90End-encryption
[nighttab-backup]: https://github.com/zombieFox/nightTab/wiki/Data-backup-and-restore
[anori-backup]: https://github.com/OlegWock/anori/issues/297
[anori-sections]: https://github.com/OlegWock/anori/blob/master/src/pages/newtab/settings/sections.tsx
[bonjourr-sync]: https://bonjourr.fr/docs/settings-management/syncing/
[start-sync]: https://support.start.me/en/articles/9182917-how-do-i-synchronize-my-start-me-bookmarks-with-my-browser
[gsd-lock]: https://github.com/fastaddons/GroupSpeedDial/wiki/Lock-and-hide-your-secret-group
[toby-private]: https://help.gettoby.com/support/solutions/articles/66000522010-what-is-the-different-between-a-private-collection-and-a-public-collection-
[anori-header]: https://github.com/OlegWock/anori/issues/304
[nighttab-complexity]: https://github.com/zombieFox/nightTab/issues/305
