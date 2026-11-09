# Chrome / Edge 提交准备

更新日期：2026-11-06。此文记录实际行为与提交材料，不代表商店已审核通过。

## 搜索行为

- 全新数据默认选择“浏览器默认”，用通用搜索图标显示。Chromium 使用 `search.query`，Firefox 使用 `search.search`，均声明 `search` 权限。
- 用户主动选择内置或自定义引擎后保存选择，跨页面、重开、重启及备份恢复后继续生效。已有用户的选择不改写。
- 在首页搜索框的下拉菜单切换引擎，包括切回浏览器默认。「设置 → 搜索与时钟 → 管理搜索引擎」可添加、编辑和删除 URL 引擎。浏览器默认由浏览器提供，不出现在可编辑列表中。
- 不读取默认引擎名称或地址，不修改地址栏搜索设置。默认搜索不可用或失败时显示错误、保留输入，不转发给另一家引擎。
- Chrome 当前政策要求新标签页搜索尊重浏览器默认设置，并允许多搜索选项；本文不将“首次默认、主动改选后记忆”表述为获得官方审核确认。公开竞品实现可供参考，不能保证审核结果。

## 同步与隐私

- 普通空间继续支持重启后自动同步。连接账号、应用密码或令牌保存在浏览器本地，未额外加密；不写入导出或同步备份，也不写入同步错误详情。
- 连接凭据保存与私密空间加密是两个机制。受保护的私密空间仍需解锁，私密同步密码仅保留在当前浏览器会话。
- 同步使用 HTTPS，认证请求不跟随重定向。普通空间备份可读；不能把 HTTPS 描述为本地数据已经加密。
- 统一维护根目录 `PRIVACY.md` 与包内 `public/PRIVACY.md`，明确适用于 Microsoft Edge，也说明 Chrome / Firefox 的同等行为。Edge 要求政策内容主要针对 Edge，并非明确要求另一个 URL。
- 不把额外主密码或每次重启解锁当作已经确认的商店硬性要求；也不把其他扩展的本地凭据保存方式当作安全或审核保证。

## 安装包与材料

运行 `pnpm run package` 生成 `.output/raytab-0.2.0-chrome.zip`，Chrome 和 Edge 使用同一份 MV3 包。Firefox 使用独立构建。包中不得包含测试凭据、源码映射、环境文件或 Firefox 专用 Chromium 清单字段。

本地材料目录为 `artifacts/store-release/0.2.0/`，包括中英文介绍、权限理由、数据披露、审核操作说明、隐私副本、标志、截图及校验结果。每次改动必须更新包、披露和校验值，验证结果注明实际源码状态，不能沿用旧测试结果声称新包通过。

提交前由账号持有人确定开发者名称、联系邮箱、账号类型和分发范围，完成账号验证，并核对：

- 最终安装包版本号可用于该商店条目。
- 公开隐私链接可免登录访问，且内容与安装包一致；本地修改须先发布到该链接。
- 后台权限、数据使用及远程代码声明与实际包一致。
- 提交同步审核说明，明确没有 RayTab 账号；同步为可选功能，连接用户自行提供的服务。需要测试访问时按后台要求提供专用测试配置，不提交个人凭据。
- 签名商店安装后的新标签页接管和启用提示需在商店安装路径核对，本地自动化不能代替。

## 官方依据

- [Chrome 新标签页与搜索政策](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- [Chrome Search API](https://developer.chrome.com/docs/extensions/reference/api/search)
- [Firefox Search API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/search/search)
- [Chrome 数据披露与安全 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Microsoft Edge 开发者政策](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
