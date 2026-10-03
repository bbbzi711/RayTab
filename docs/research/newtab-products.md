# 新标签页产品研究：商业产品与公开用户反馈

核查日期：2026-10-03。用途：为 RayTab 设置、图标编辑和数据操作重组提供依据，不再复刻某一家产品。

本文件查阅官方帮助、开发者文档、商店开发者说明及用户原帖。除 iTab 已由主任务另行查看实际页面，其他产品的记录属于文档核查，并非本机安装验收。公开资料未找到某项时标为“未核实”，不能写成该产品没有。商店所列支持语言也不等于存在界面内语言开关。

## 1. iTab

**已核实**：图标自定义与上传、透明或自定义底色、搜索栏隐藏与自定义搜索、图标和搜索分别选择打开方式、时间显示与秒数、12 小时制、时间字体、本地和动态壁纸、侧栏记住上次分组、账号同步、本地导出、离线历史备份。依据为[官方更新记录](https://www.itab.link/changelog.html)，部分条目是历史引入记录，当前界面位置应以实际查看为准。

**入口与流程**：[在线界面可读内容](https://go.itab.link/help)给出图标右键编辑、删除、布局，空白处右键添加图标、换壁纸、立即备份、设置。官方更新记录把历史备份定位到“设置 → 备份与恢复 → 管理历史备份”。

**本轮实看补充**：2026-10-03 打开网页版“时间/日期”，可见显示时间、月日、周、农历、24 小时、秒、粗体、大小、字体与颜色；农历确有独立复选框。截图为 `artifacts/research/newtabs/itab-date.jpg`。RayTab 保留已有农历开关，不引入这一整套字体微调。

**未核实**：私密空间或分组密码、同步分钟间隔、五时段问候编辑器、语言开关所在位置。

**可借鉴**：图标操作贴近对象；备份常用动作有直接入口，历史恢复属于专门流程。借鉴交互归属，不采用其卡片视觉或原样复制分类。

## 2. Infinity New Tab Pro

**已核实**：[官网](https://www.infinitynewtab.com/)说明图标颜色、尺寸、布局可调，支持文件夹，壁纸可定期切换；[开发者商店说明](https://chromewebstore.google.com/detail/infinity-new-tab-pro/nnnkddnnlpamobajfibfdgfnbcnkgngh?hl=en-US)确认快捷方式增删改排、浏览器书签与常访、图标样式、侧栏工具、可选账号备份同步，以及多语言资源。

**入口与流程**：开发者说明确认 Settings 内可管理默认推广快捷方式；文档证据不足以准确还原当前设置层级、图标编辑内部结构和本地导入步骤。未将同名非官方 GitHub 项目当成官方源码。

**未核实**：当前本地导入导出入口、时间和问候自定义项、语言切换位置、分组密码、同步分钟间隔。

**可借鉴**：尺寸与布局表达成用户可见的图标结果；同步作为按需启用的能力，首页基础使用不依赖先登录。

## 3. WeTab

**已核实**：[商店开发者说明](https://chromewebstore.google.com/detail/wetab-%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/aikflfpejipbpjdlfabpgclhblkpaafo?hl=zh-Hans)列明图标/组件拖拽、自定义搜索引擎、壁纸库与动态/渐变背景、深浅/跟随系统、左侧栏及底部栏隐藏、账号备份同步。说明包含倒计时、纪念日和日历组件，不等于已核实全局时钟的每个控制项。

**入口与流程**：[在线版](https://web.wetab.link/)可访问，但文本抓取未返回可操作控件；本次未登录或安装，无法确认设置层级及图标编辑细节。

**未核实**：本地导入导出、问候、语言位置、分组密码、同步分钟间隔。

**可借鉴**：首页把组件作为独立内容；侧栏显隐是直接呈现的布局选择。是否采用这些模式由 RayTab 当前功能需要决定，不因此新增其小组件商店。

## 4. Momentum

**已核实与入口**：[Settings 帮助](https://get.momentumdash.help/hc/en-us/articles/360016334234-Settings)说明左下齿轮打开设置，左侧分类，General 中集中显示/隐藏功能，照片、短句等在各自分类处理。[Clock 帮助](https://get.momentumdash.help/hc/en-us/articles/360012371613-Clock)把 12/24 小时放入 General → Formats & units，也可从时钟菜单改变；使用设备时区。[问候帮助](https://get.momentumdash.help/hc/en-us/articles/115007629867-Greetings-display)按本地时间自动生成早/午/晚问候。

**链接编辑**：[Links 帮助](https://get.momentumdash.help/hc/en-us/articles/360012256494-Links)为标题、网址、保存；对象菜单处理编辑、固定、删除，Links 自己的菜单处理列表/平铺和彩色图标。保存链接随账号同步。

**明确边界**：[语言 FAQ](https://get.momentumdash.help/hc/en-us/articles/115007788228-Is-Momentum-available-in-other-languages)明确目前没有应用自己的翻译。未核实本地备份恢复、密码锁组、同步间隔和五时段 JSON 问候。

**可借鉴**：全局设置与对象菜单职责分开；问候默认自动生成，时钟主要暴露格式选择，不把时间算法交给用户。

## 5. Toby

**已核实与入口**：[主题文档](https://help.gettoby.com/support/solutions/articles/66000496101-how-to-change-themes)将主题放在左下 Organization settings，点击 Change 后选择主题并 Save；暗色作为主题变体。[私密集合文档](https://help.gettoby.com/support/solutions/articles/66000522010-what-is-the-different-between-a-private-collection-and-a-public-collection-)描述创建者可见的访问控制，不能等同 RayTab 的本地加密空间。

**导入导出**：[导入帮助](https://help.gettoby.com/support/solutions/articles/66000524947-how-do-i-import-resources-into-toby-)流程是设置里的 Import 按钮 → 选择格式 → 选文件并确认。[导出帮助](https://help.gettoby.com/support/solutions/articles/66000508502-how-to-export-your-collections)支持单个集合菜单、多选浮动工具栏、组织设置、账号设置四种范围；格式选择在发起操作后出现。

**未核实**：时钟、问候、图标裁切、壁纸详细项、语言位置、同步分钟间隔；这些不是从文档缺席推定的“不支持”。

**可借鉴**：备份操作先选目的，再展开文件或格式控件；集合级操作放在集合旁，全量数据放在账号/数据入口。

## 6. Group Speed Dial

**布局与编辑**：[官方布局文档](https://github.com/fastaddons/GroupSpeedDial/wiki/Group-layouts)通过分组右键 → Edit group 管理行列与尺寸，区分固定和动态布局；动态布局填补空位并保留末尾添加入口。开发者公开 GitHub 为文档和问题仓库，不据此宣称扩展实现开源。

**密码与同步**：[锁组文档](https://github.com/fastaddons/GroupSpeedDial/wiki/Lock-and-hide-your-secret-group)明确分组可锁定、锁定后隐藏、解锁后打开，主菜单/分组菜单可立即锁定，锁定内容排除搜索；该本地锁本身不加密。[E2EE 文档](https://github.com/fastaddons/GroupSpeedDial/wiki/Data-synchronization-with-End%E2%80%90to%E2%80%90End-encryption)另行说明云同步加密和恢复码。

**备份入口**：[备份帮助](https://github.com/fastaddons/GroupSpeedDial/wiki/Backup-dials-data)把 Export all 和 Import backup file 放在 Options → Import backup，另有自动本地备份；缩略图同步在独立缩略图设置里启用。

**未核实**：普通用户同步分钟间隔、语言位置、五时段问候、六部件分别文字颜色。

**可借鉴**：隐私能力绑定分组和主密码任务；导出、恢复及自动备份具有清晰区别，不用“同步”吞掉恢复入口。它的复杂布局选项不应全部移植。

## 7. start.me（补充对照）

**设置结构**：[用户偏好](https://support.start.me/en/articles/9182899-change-user-preferences-display-settings)位于右上用户菜单 → Settings，包含显示、书签行为、Location & Language、快捷键。语言是内容中的正常分节。[页面设置](https://support.start.me/en/articles/9182828-page-settings-background-columns-preferences)通过页面铅笔或页签右键打开，分 General、Background、Columns、Preferences 四页；支持背景、纯色、列数、透明度、打开方式，部分项可 Auto 跟随账号偏好。

**图标与数据**：[图标帮助](https://support.start.me/en/articles/9182861-change-a-bookmark-icon)从书签右键 Change icon 或 Edit link 进入，提供素材、文字和上传，支持恢复默认。[导入](https://support.start.me/en/articles/9182856-import-bookmarks-into-start-me)先选来源；[导出](https://support.start.me/en/articles/9182860-export-bookmarks-feeds)在 Data → Exports 选择页面，再发起导出并查看结果。[自动保存帮助](https://support.start.me/en/articles/9182917-how-do-i-synchronize-my-start-me-bookmarks-with-my-browser)明确每次修改自动保存云端，不是让用户安排周期。

**未核实**：本地密码锁组、五时段问候和用户同步周期。

**可借鉴**：语言归入全局偏好；整体页面偏好和单项编辑分层，避免把所有内容塞在一个狭窄设置列。

## 8. 对当前精简候选的结论

| 当前候选                                           | 已核实对照                                                    | 改造判断                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 语言固定在左栏底部                                 | start.me 放内容中的语言分节；Momentum 没有自带翻译            | 移进通用偏好。界面拥挤不是删除多语言能力的依据                             |
| 每个外观字段都有私密继承控制                       | start.me 有页面对全局的 Auto，但未见当前这组逐字段继承控件    | 可以收为单一空间外观策略，去掉每行额外按钮；不能声称同类从无继承           |
| 五个时段问候 JSON                                  | Momentum 自动时段问候；iTab 等未核实到这种编辑器              | 删除技术化时段编辑；基础问候显示可以保留                                   |
| 六处组件分别选文字颜色                             | 产品资料确认主题/图标色，未核实当前六个独立全局颜色控件的对应 | 合并为一致主题/文字对比度方案，删除独立微调面板                            |
| 同步分钟间隔                                       | 各资料描述自动同步/更改即保存，未核实用户调分钟周期           | 删除普通设置中的间隔输入，由运行逻辑采用固定策略；保留启停、状态及立即同步 |
| 备份、导入、恢复三套表单常驻同屏                   | Toby/start.me 先选数据操作，再进入该流程；GSD 分清导出与恢复  | 首页仅保留操作入口，按所选任务展示文件、范围和确认                         |
| 私密空间、主密码                                   | GSD 已明确存在锁组和主密码，Toby 存在私密集合但安全语义不同   | 有充分同类依据，保留保护能力并重排入口，不擅自解密/删除私密数据            |
| 全局尺寸、布局、图标类型、搜索引擎、壁纸、时钟格式 | 多产品有直接对应                                              | 保留核心行为，以少量选择和必要的即时预览表达                               |

“删除没有对照的设置”是本次产品取舍标准；除官方明确否定外，不能把研究中尚未发现写成所有产品都没有。未见同类依据的技术性调节不继续默认占据界面。

## 9. 用户反馈证据

以下是具体用户的经历与偏好，不能推出全体用户结论，也不是竞品当前版本的故障复现。日期以帖子/评论日期为准，不使用搜索抓取日期。推广自己产品的回复不作为独立口碑。

| 日期、来源                                                                                                                                              | 反馈要点                                                                                                                                         | 对 RayTab 的实际约束                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 2026-07-24，[GSD 用户 Jewel-Tom 的评论与作者回复](https://www.reddit.com/r/brave_browser/comments/1eo5sdg/safe_speed_dial_extension_recommendation/)    | 喜欢可配置性，但花很多时间仍做不出干净布局；自述 5000+ 书签，缩略图刷新慢，要求文字/底色样式、可预测的缩放和按组导出。作者回复计划支持无截图布局 | 好看的默认布局应直接可用；避免图标装饰依赖昂贵截图；调整密度不能悄悄改变另一维度 |
| 2024-01-16 提问、2024-10-10 作者回答，[GSD Discussion #303](https://github.com/fastaddons/GroupSpeedDial/discussions/303)                               | 用户找不到导出到浏览器书签的方式；作者指出入口在 Import backup 最底部，且实验性 HTML 导出并非完整备份                                            | 入口命名必须匹配任务；恢复、完整备份、通用书签导出不可混叫                       |
| 2025-02-06，[Toby 替代需求原帖](https://www.reddit.com/r/chrome_extensions/comments/1ijc217/looking_for_toby_alternatives_with_specific_needs/)         | 用户因免费额度变化找替代，明确需要嵌套分组、跨设备同步、新标签页入口，最好可导入 Toby JSON                                                       | 精简微调设置时保留组织、同步和迁移这些真实任务，不能把复杂功能一概当累赘         |
| 2025-12-13，[Infinity 用户替代需求原帖](https://www.reddit.com/r/chrome_extensions/comments/1plu8x3/any_recommendations_for_a_speeddial_extension_for/) | 希望保留好看的快捷入口、可切换引擎、背景定制，额外东西少；帖子还表达隐私担忧                                                                     | 学习清晰布局，不复制广告、追踪和不透明跳转。此处仅记录担忧，不据此认定竞品恶意   |
| 2026-08-12，[Momentum 商店评论镜像](https://chrome-stats.com/d/laookkfknpbbblfpciffpaejjkokdgca/reviews)                                                | 用户自述重置后只想留下壁纸，却得关闭十几个选项。该条来源为 Chrome-Stats 展示的个体商店评论，未在原商店逐条复核                                   | 默认页面收敛；关闭一个大模块应同时隐藏它的细分选项，不要求连续关闭十余开关       |
| 2026-09-22，同一[Momentum 评论镜像](https://chrome-stats.com/d/laookkfknpbbblfpciffpaejjkokdgca/reviews)                                                | 一条用户评论明确请求中文；2026-07-24 另一条不喜欢链接图标突然变成黑白                                                                            | 保留易找的语言偏好及品牌图标原色。不得把镜像评论当成代表性比例                   |

对私密/广告问题采取可核实的设计约束，不沿用用户原帖里未经本次技术验证的恶意软件指控。研究支持的是减少无关干扰、清晰权限和数据可迁移，并非对其他产品作安全审计结论。
