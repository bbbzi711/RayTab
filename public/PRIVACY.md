# 隐私说明

适用版本：0.2.0。更新日期：2026-11-05。

适用于 RayTab 的 Chrome、Microsoft Edge 及 Firefox 扩展构建。

RayTab 将网站、分组、文件夹、设置、本地图标和壁纸保存在当前浏览器中。卸载扩展或清除浏览器数据可能删除这些内容，请自行保存备份。

- RayTab 不提供账号、广告、统计或遥测。
- 搜索词仅在提交时发送给所选搜索引擎，RayTab 不保存搜索历史。首次默认必应；用户切换后保存选择，不读取或修改浏览器地址栏默认搜索引擎。自定义引擎请求用户填写的搜索地址。
- 访问网站时，目标网站的隐私政策适用。
- 本地图标、壁纸、加密和备份在本机处理，导出的备份可能包含网址和图片。
- 只有用户主动配置同步后，RayTab 才会把所选空间的备份发送到用户指定的 WebDAV、GitHub 或 Gitee。普通空间内容可读；设置同步密码的私密空间内容以加密信封保存。连接账号、应用密码或访问令牌持久保存在当前浏览器本地，未额外加密，用于重启后继续自动同步；不写入备份或同步文件，也不作为同步错误详情记录。私密同步加密密码仅在当前浏览器会话保留。
- 同步使用 HTTPS，不自动跟随重定向。WebDAV 请求发往用户填写的服务器；GitHub 请求 api.github.com，Gitee 请求 gitee.com。认证信息随对应服务请求发送，普通空间备份在目标服务中仍可读。云服务可按其政策处理请求、账号和文件，请选择可信的私有存储位置。受密码保护的私密空间需要解锁后手动同步；自动同步保持现有适用范围。
- 点击工具栏快捷添加时读取当前页面的网址和标题，用于保存网站，不持续跟踪浏览活动。
- 读取浏览器书签仅用于用户主动发起的导入。RayTab 不读取浏览历史。
- 网站图标直接从所填网站获取。普通空间添加网站后离开网址输入框、在 Popup 确认添加、或主动获取图标时，会请求对应网页及网页声明的 Icon、Apple Touch Icon、Manifest 中的图标，并检查通用 Apple Touch Icon 路径及网站自身的结构化 Logo；低清或没有可用图片时以该网站的 `/favicon.ico` 兜底。网页声明的资源可能位于该网站使用的 CDN 或其他域名，相关站点可看到请求地址及出口 IP。请求不携带 Cookie 或 Referer，不调用第三方品牌目录或 favicon 代理服务。
- 私密空间仅在主动获取时请求网站图标。已获取图标沿用现有资源保存机制，SVG 和无需缩小的图标保留原文件；超过 512px 的静态 PNG、JPEG 和 WebP 图标按比例缩小，仅在文件体积减少时保存处理结果，不放大小图或压平动画。备份与同步包含实际保存的图标文件。用户主动裁切时另行生成裁切图片。官网图片清晰度或样式不符合需要时，可自行上传替换；自动获取不会覆盖当前选择的上传图片，获取失败保留已有图片。已保存的图标在本机处理、保存和离线读取，打开新标签页不重新查询网站图标。
- 默认图片壁纸和精选摄影请求 images.unsplash.com（Unsplash）；每日图片通过 bing.biturl.top 这一第三方入口请求，用户填写的在线壁纸请求其对应地址及图片重定向目标。这些服务会看到请求地址、出口 IP 等连接信息；普通空间默认壁纸可能在首次打开时请求。普通空间最近成功加载的在线壁纸缓存在本机；正常重开优先读取缓存，每日图片在跨日时重新获取。上传壁纸直接读取已有本地资源，不重复保存整张图片。启动元数据只保存普通空间显示信息和底色，私密壁纸不写入普通缓存。本地壁纸、纯色和渐变背景不发起图片请求。
- 私密空间设置密码后使用 PBKDF2-SHA256 与 AES-GCM 加密；未设置密码时不宣称私密数据已加密。

可通过页面和设置编辑、删除、同步或导出数据。断开同步会移除本机连接凭据、同步基线和状态，不删除本地网站或云端文件；云端文件请在对应服务删除。浏览器本地数据保留到你主动删除、清理扩展数据或卸载；导出的备份和服务端副本由你自行管理。

## 有限使用声明

RayTab 对从 Google API 获得的信息的使用遵守 Chrome Web Store User Data Policy，包括 Limited Use 要求。数据仅用于已披露的网站管理、导入、展示、备份和用户配置的同步功能；不出售用户数据，不用于广告画像、信用评估或与上述功能无关的用途。RayTab 不运营接收用户备份或凭据的服务器。此声明说明数据用途，不代表所有本地数据均已加密或已获得商店审核。

## English summary

RayTab for Chrome, Microsoft Edge and Firefox stores sites, folders, settings and images locally. It has no RayTab account, ads, analytics or telemetry and does not read browser history. Clicking the toolbar action reads the active page URL and title for saving; bookmark access is requested only for an explicit import.

Search text is sent only on submission to the selected provider (initially Bing); the selection persists and does not change the address-bar provider. Icon discovery contacts the entered website and its declared resources/CDNs without cookies or referrers. Private-space discovery is explicit. Saved icons work offline and are included in backups. Unsplash supplies default and curated images; bing.biturl.top is the third-party daily-wallpaper endpoint. Custom online images contact the configured URL and redirect destinations. These services can see the requested URL and connection information such as IP address. Local images, gradients and solid colors do not require image requests.

Optional HTTPS sync sends selected sites, settings and saved images to the configured WebDAV server, api.github.com or gitee.com. Authenticated sync requests never follow redirects. Connection usernames, app passwords and tokens persist locally without additional encryption to allow automatic sync after restart; they are excluded from exported/synced backups and sync error details. Normal-space backups remain readable. Password-protected private data uses PBKDF2-SHA256 and AES-GCM; protected private sync is manual after unlocking. The private sync password is session-only.

You can edit, delete, import and export local data. Disconnecting removes local sync credentials, status and baseline, not sites or remote files. Local data remains until you remove it, clear extension data or uninstall; manage exported and remote copies separately. RayTab does not operate a server receiving credentials or backups. Its use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including Limited Use requirements. Data is not sold or used for advertising profiles, credit decisions or unrelated purposes. This does not assert encryption of all local data or store approval.

隐私问题可通过 [项目 Issues](https://github.com/bbbzi711/RayTab/issues) 反馈，请勿公开个人备份。
