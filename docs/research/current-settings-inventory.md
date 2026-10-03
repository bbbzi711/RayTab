# 改造前设置与图标编辑盘点

盘点日期：2026-10-03。依据本轮改造前的工作树源码，而非 Git HEAD。本文保留为删减对照基线，不代表当前设置位置或字段数量；当前结果见 [逐项决策](settings-decisions.md) 和 [验收记录](../modernization-validation.md)。本文不代替竞品取证，也不把“尚未找到”写成“竞品不存在”。

## 代码与数据边界

- `src/features/settings/SettingsPanel.tsx`：设置壳、六个分类、即时设置、私密继承、自动保存队列及草稿保护。
- `src/features/settings/SettingsForms.tsx`：壁纸、问候语、搜索引擎、密码表单。
- `src/features/settings/DataSettings.tsx`：书签导入、备份导出、备份恢复三个独立流程。
- `src/features/settings/SyncSettings.tsx`：同步连接、执行、冲突处理。
- `src/features/settings/SettingsControls.tsx`：Radix 滑块、开关、下拉、继承提示、分区卡片。
- `src/storage/model.ts`：`spaceSettingsSchema` 共 28 个根字段；普通空间存入 `normalSettings`，私密空间存入 `privateSettingOverrides`；最终展示使用 `effectiveSettings`。
- `src/storage/operations.ts`：`settings` 及 `reset-private-setting` 命令；Repository 校验并保存成功才更新 Store。
- `src/sync/core/engine.ts`：连接存在 `browser.storage.local`，私密同步密码仅在 `browser.storage.session`；不是普通 `SpaceSettings`。
- `src/features/navigation/SiteEditor.tsx` / `navigation-form-schemas.ts`：网站和图标编辑；保存网站记录及必要图片资源。

下表“展示”表示偏好最终影响外观或交互，仍会持久化；不表示可以直接清库。删除已退役的展示字段与删除网站、图片、密码、同步配置不是同一操作。

## 28 个空间设置字段

| 字段                 | 当前产品项及取值                                                            | UI 所在              | 实际消费者 / 其他入口                    | 影响                                             |
| -------------------- | --------------------------------------------------------------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------ |
| `language`           | 语言：中文 / English；目前独立钉在侧栏底部                                  | SettingsPanel        | App / Popup 国际化；Clock 日期农历       | 全产品文案，适合通用分组                         |
| `theme`              | 主题：系统 / 明亮 / 深色                                                    | SettingsPanel        | App 根主题及通知；桌面右键进入壁纸与主题 | 展示                                             |
| `searchEngine`       | 默认搜索引擎                                                                | SearchEngineSettings | SearchBar 下拉也直接保存此字段           | 搜索行为；依赖引擎列表有效 ID                    |
| `searchEngines`      | 引擎列表，名称、含 `%s` 的 URL；增加 / 编辑 / 删除，最多 20 个              | SearchEngineSettings | SearchBar                                | 用户维护数据；不能当普通外观项直接丢弃           |
| `openInNewTab`       | 新标签页打开网站                                                            | SettingsPanel        | NavigationCards 与 SearchBar 共用        | 网站和搜索结果打开行为；当前文案没有准确覆盖搜索 |
| `showClock`          | 显示时钟                                                                    | SettingsPanel        | App / Clock；组件右键进入设置            | 展示                                             |
| `showSearch`         | 显示搜索                                                                    | SettingsPanel        | App / SearchBar；组件右键进入设置        | 展示；关闭不能删除引擎列表                       |
| `showDate`           | 显示日期                                                                    | SettingsPanel        | Clock；与时钟开关独立                    | 展示                                             |
| `showLunar`          | 显示农历                                                                    | SettingsPanel        | Clock；与日期开关独立                    | 展示                                             |
| `showGreeting`       | 显示问候语                                                                  | SettingsPanel        | Clock；与时钟开关独立                    | 展示                                             |
| `customGreetings`    | 问候语 JSON：早晨 / 中午 / 下午 / 傍晚 / 夜间数组；导入、模板下载、恢复默认 | GreetingImportForm   | Clock 按日期稳定轮换                     | 纯文字自定义内容；强删除候选，非安全数据         |
| `showSiteTitle`      | 显示网站标题                                                                | SettingsPanel        | NavigationCards / 文件夹                 | 展示；不删除网站 title                           |
| `hour12`             | 12 小时制；显示时钟时可见                                                   | SettingsPanel        | Clock                                    | 展示                                             |
| `cardSize`           | 没有独立控件，由“图标大小”计算                                              | SettingsPanel        | NavigationPage 网格及文件夹宽度          | 布局内部尺寸；与 `iconSizeRatio` 成对更新        |
| `iconSizeRatio`      | 没有独立控件；图标大小 22–104 px 同时换算两字段                             | SettingsPanel        | NavigationPage 图标尺寸                  | 布局内部尺寸；UI 应只呈现一个大小控件            |
| `maxCardsPerRow`     | 每行最多：4–12                                                              | SettingsPanel        | NavigationPage 最大宽度、文件夹列数      | 布局                                             |
| `iconSpacing`        | 图标间距：8–48 px，步进 2                                                   | SettingsPanel        | NavigationPage 网格                      | 布局                                             |
| `iconRadius`         | 默认 / 圆形预设与圆角 0–50% 滑块同时存在                                    | SettingsPanel        | NavigationPage 图标圆角                  | 同职责控件重复，可合并                           |
| `sidebarMode`        | 分组栏显示：常驻 / 自动隐藏 / 完全隐藏                                      | SettingsPanel        | App；键盘操作可能将常驻切为自动          | 导航行为；隐藏不删除分组                         |
| `background`         | 壁纸来源：渐变 / 每日图片 / 精选摄影 / 自定义 / 纯色                        | SettingsPanel        | Background                               | 展示及外部图片请求                               |
| `gradient`           | 四个渐变色预设                                                              | SettingsPanel        | Background / 自动文字对比                | 展示，无资源                                     |
| `solidColor`         | 背景颜色                                                                    | SettingsPanel        | Background / 自动文字对比                | 展示，无资源                                     |
| `wallpaperId`        | 自定义→本地壁纸：选文件、使用本地壁纸                                       | LocalWallpaperForm   | Background / 资源引用、备份、私密加密    | 本地图片数据；移除 UI 不等于删除资源             |
| `onlineWallpaperUrl` | 自定义→在线壁纸地址、使用在线壁纸                                           | WallpaperForm        | Background；与本地壁纸 ID 互斥提交       | 用户 URL，外部请求                               |
| `featuredPhotoUrl`   | 精选摄影→换一张（内置六张中随机选择）                                       | SettingsPanel        | Background                               | 展示及外部请求；可放壁纸选择流程                 |
| `overlay`            | 壁纸遮罩：0–80%，步进 5%                                                    | SettingsPanel        | Background / 自动文字对比                | 展示                                             |
| `textColorMode`      | 文字配色：自动适应 / 亮白 / 墨黑 / 自定义                                   | SettingsPanel        | App / `appearance/text-colors.ts`        | 展示；有“自定义”持久化值                         |
| `textColors`         | 时钟 / 日期 / 问候语 / 搜索栏 / 分组标签 / 网站标题六个独立色值             | SettingsPanel        | App / NavigationPage / 自动配色工具      | 展示；高复杂度、强精简候选                       |

## 私密空间及继承

| 当前 UI / 字段                               | 位置                                           | 数据行为                                                              | 重构边界                                                             |
| -------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 每字段“跟随普通空间 / 已单独设置 / 恢复跟随” | SettingsControls.Inheritance，散布所有空间设置 | 删除相应 `privateSettingOverrides` 键；重置引擎列表时成对重置默认引擎 | 可删除逐字段常驻提示，改成一次明确的恢复跟随动作；保留已有覆盖和事务 |
| 设置继承：当前 N 项单独设置                  | SettingsPanel 隐私页，只在私密空间显示         | 只读计数                                                              | 可删除重复解释块                                                     |
| 启用密码保护→密码                            | PasswordForm                                   | privateSecurity、加密 vault、私密图片迁入加密载荷                     | 不能因视觉重构删除既有 vault 或取消保护                              |
| 更换密码→当前密码 / 新密码 / 再次输入        | PasswordForm，解锁后                           | 重新加密私密数据                                                      | 适合安全操作入口，按需显示                                           |
| 取消密码保护→当前密码 + 危险确认             | PasswordForm，解锁后                           | 取消加密保护                                                          | 不应弱化确认或变成无提示即时开关                                     |
| 已锁定说明 / 已解锁说明                      | SettingsPanel                                  | 只读状态                                                              | 可收束为一行状态，保留实际错误与限制                                 |

App 另有普通 / 私密空间切换、解锁密码对话框。退出私密或刷新会锁定；这不是设置项。竞品缺少“逐字段继承”界面不能推出删除整个私密空间。

## 数据与备份：都是按需动作，非长期偏好

| 流程字段 / 操作                     | 当前 UI                          | 存储与效果                             | 可重排方式                                 |
| ----------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------ |
| 书签来源 `source`、HTML 文件 `file` | 选文件、预览文件、读取浏览器书签 | 仅表单草稿；浏览器读取需权限           | 首屏只保留“导入书签”入口，打开后选来源     |
| `organizeMode`                      | 直接平铺 / 保留书签文件夹        | 提交时决定新增文件夹                   | 导入预览流程内；不作为全局选项             |
| `duplicateMode`                     | 跳过重复网址 / 全部保留          | 提交时影响新增网站集合                 | 默认去重；如研究决定删选项，应保留去重逻辑 |
| `groupId`                           | 目标分组                         | 实际新增网站的归属                     | 流程内必要目标，不可随意固定导致导入错处   |
| 预览摘要、8 条网站和余量            | 待导入网站预览                   | 无写入                                 | 保留确认前可见摘要；不要三层嵌套滚动       |
| 确认导入                            | 操作按钮                         | `import-bookmarks` Repository 事务     | 行动按钮，不是设置                         |
| `range`                             | 备份导出范围：普通 / 私密 / 全部 | 控制导出内容；不改变原数据             | 导出流程内，默认合理范围                   |
| 备份 `password`                     | 私密空间备份密码                 | 本次备份加密；不保存为设置             | 不能删除导致私密内容无保护导出             |
| 导出所选备份                        | 操作按钮                         | 生成 JSON 下载；不含同步凭据           | 首屏一行“导出备份”                         |
| 恢复 `file`、预览备份               | 文件与预览按钮                   | 仅解析校验，无写入                     | 首屏一行“恢复备份”                         |
| 恢复 `mode`                         | 合并恢复 / 替换恢复              | 实际持久化不同；替换可能丢失未备份内容 | 留在恢复确认阶段，不能把危险行为悄悄固定   |
| 恢复 `password`                     | 备份解密密码                     | 只在加密备份中需要                     | 功能必需，不是可删的偏好                   |
| 确认恢复                            | 按钮；替换另有危险确认           | Repository restore、版本检查、刷新     | 保留失败草稿、跨页刷新、私密锁定保护       |

当前三个完整表单默认同时铺开，是数据页高度、蓝按钮密度及原生文件输入难看的主要结构原因。改成三个简洁动作入口，再按需显示流程，可同时减少首屏选项和保留必要数据保护。

## 同步：连接配置与维护动作

| 字段 / 操作                                        | 当前 UI                                    | 存储与影响                           | 重构边界                                                     |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------ |
| `connection.type`                                  | 服务：WebDAV / GitHub / Gitee              | 本机同步连接配置                     | 可先选服务后显示所需表单；是否删除服务等待竞品证据与范围判断 |
| WebDAV `url` / `username` / `password`             | 文件地址 / 用户名 / 密码                   | `browser.storage.local`，连接凭据    | 连接必需，不能当无用设置删除                                 |
| Git `token` / `owner` / `repo` / `path` / `branch` | 令牌 / 所有者 / 仓库 / 文件路径 / 可选分支 | 同上                                 | 技术字段应仅在此服务配置内出现                               |
| `automatic`                                        | 自动双向同步                               | 本机调度行为                         | 偏好，有研究对应才保留可调入口，否则明确固定策略             |
| `includePrivate`                                   | 同步私密空间                               | 决定是否包含私密资料                 | 涉及隐私同意，不能默认为自动上传全部                         |
| `privatePassword`                                  | 私密同步加密密码                           | 仅浏览器 session，关闭会话不持久化   | 加密必需，不可删除后输出明文                                 |
| 保存连接                                           | 操作                                       | 请求源权限、保存配置；不立即同步     | 连接流程提交                                                 |
| 双向同步                                           | 操作                                       | 网络请求、合并、本地与远端写入       | 已连接状态行的主动作                                         |
| 上次成功 / 重试 / 上次错误                         | 状态                                       | 只读                                 | 成功状态收束，错误保持可见                                   |
| 本机覆盖云端 / 云端恢复本机                        | 高级操作                                   | 替换数据，需要危险确认               | 从常驻设置移入按需维护入口                                   |
| 清除连接                                           | 高级操作                                   | 只清理本机连接、基线、状态、会话密码 | 不删远端；保留确认                                           |
| 保留本机 / 采用远端                                | 仅有冲突时出现                             | 解决具体同步冲突                     | 按状态出现，不属于通用偏好                                   |

## 网站与图标编辑

| 字段 / 控件                   | 文案与取值                                                | 持久化 / 行为                                            | 重构注意                                             |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `url`                         | 网址 + 获取图标                                           | 网站 URL；获取操作可同时补全名称与网站图片               | 不应把失败伪装为成功，允许手动完成                   |
| `title`                       | 名称                                                      | `site.title`；未手动编辑图标字时推导首字                 | 即使隐藏首页标题也不能删除名称                       |
| `location`                    | 存入位置：分组 / 文件夹                                   | `groupId` + `folderId`                                   | 与导航移动入口重叠，但新增网站需要目的地             |
| `iconType`                    | 文字图标 / 网站图标 / 上传图片，仅三种                    | `icon.source = text / auto / resource`                   | 已满足用户三种来源要求，不再添加组合模式             |
| `textIcon`                    | 图标文字，1–4 个 Unicode 字符；当前非文字模式禁用但仍显示 | `icon.text`                                              | 可仅在文字模式显示，减少无效控件；切换时保留草稿     |
| `websiteResourceId`           | 网站图标草稿                                              | `icon.source=auto` 时可保存资源 ID；与网络获取、裁切配合 | 内部字段，不应暴露                                   |
| `uploadResourceId` / 本地文件 | 上传图片 / 更换图片                                       | `icon.source=resource` 的图片资源                        | 保存失败时保留图片草稿                               |
| 裁切图片                      | React Easy Crop 弹窗                                      | 输出新 WebP 资源；拖动及缩放 1–4 倍                      | 操作入口，仅在有图片时出现                           |
| 保留完整图片                  | 撤销当前草稿裁切，使用原图                                | 恢复当前来源资源草稿                                     | 条件动作，可收束在裁切操作                           |
| `iconBackground`              | 自动配色、11 色预设、透明、自定义色                       | `mode=auto / transparent / color` + color                | 用户曾要求图标背景跟随图标；不要重新添加外层卡片背景 |
| 保存 / 取消 / 关闭            | 操作                                                      | RHF + Repository；草稿确认                               | 不是偏好；保存失败保留状态                           |

网站右键和更多菜单还提供打开、编辑、更换图标、移动、删除；删除不在编辑器。裁切缩放属于临时交互，不应变成长期设置。

## 优先删减候选与完整实现边界

1. **问候语 JSON 全流程**：候选删除 `GreetingImportForm`、模板导出、JSON 导入、恢复默认、5 时段 schema/default、Clock 自定义轮换分支、App prop、相关 locale、仅验证该旧功能的测试。保留简单默认问候和显示开关是否必要，由竞品矩阵决定。没有资源、加密或网站记录关联。
2. **部件独立配色**：候选删除六个色盘、`textColors` 以及 `textColorMode` 全字段，固定使用当前自动对比算法。`HomeTextColors` 可保留为非持久化内部表现类型，六个 CSS 语义变量也可继续由自动算法供给。只从枚举删除 `custom` 会让已保存的 custom 值失败；删除整个已退役字段可以在现有 Zod 边界自然退出当前模型，不需要常驻兼容分支。
3. **继承提示重复**：删除每行状态与重置按钮，私密设置只显示一处说明及恢复跟随动作。保留已有 `privateSettingOverrides` 数据语义；不需要复制普通设置、不新增全套平行模型、不清空私密网站。恢复全部覆盖应走既有命令并明确用户动作。
4. **圆角重复入口**：两个预设与连续滑块二选一。当前字段本身不需要迁移；可只改编辑方式。
5. **数据页常驻表单**：三个动作入口替代三个大表单首屏；原流程按需展开。所有密码、预览、目标分组、替换确认保留到相应流程，不作为常驻设置。
6. **语言钉底与每栏自动保存长解释**：语言归通用分组，去掉独立侧栏脚部；自动保存保留轻量状态与失败重试，帮助说明不占长期视觉层级。
7. **技术连接表单**：同步首屏呈现连接状态和动作；未连接时展示选服务入口，服务表单按需进入。不要同时堆三种服务文案和高级覆盖操作。

## 不访问用户数据的验证路径

- 本次盘点没有读写真实 IndexedDB、浏览器个人资料、云端或凭据，也没有提交。
- 退役 schema 字段由现有 `rayStateSchema`、`backupSchema`、私密解密 schema 入口解析；普通对象 schema 会剔除不再定义的字段。无需升级数据库 object stores、清空数据或执行实际迁移脚本。
- 如仅移除模型字段，`readStored` 只在 schemaVersion / revision 改变时主动回写；不应为了“清理”主动扫描真实资料。之后正常用户保存会使用当前模型。
- 使用隔离 Repository/Playwright profile 验证：旧字段存在的输入可载入、正常/私密网站及资源完整、首次局部设置保存保留不相关字段、备份往返、私密锁定/解锁、保存失败草稿不丢、跨页刷新。
- 当前 schema 与备份输入校验已有完整边界，禁止新增运行期“新 UI + 旧模式”并行分支。相关功能若确定删除，应一起清理实现、文案、专属测试和文档。
