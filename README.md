# RayTab

一个以网站导航为核心的新标签页扩展。

## 功能

支持桌面与分类、普通与加密私密空间、书签导入、完整备份，以及 WebDAV、GitHub、Gitee 同步。

## 技术栈

WXT、React、TypeScript、Tailwind CSS、shadcn/ui。使用 IndexedDB 保存数据，pnpm 管理依赖。

## 开发

使用 Node.js 24，pnpm 版本以 `package.json` 为准。

```sh
pnpm install
pnpm run dev
```

```sh
pnpm run typecheck
pnpm test
pnpm run format:check
pnpm run package
pnpm run package:firefox
```

## 发布版本

普通分支推送和 Pull Request 只运行检查。推送 `vX.Y.Z` 标签会触发
[发布工作流](.github/workflows/release.yml)：校验版本号、检查格式、运行测试、构建两个浏览器的扩展，
最后创建 GitHub Release，自动生成更新说明并上传 Chrome / Firefox ZIP 安装包。
任一步骤失败都不会发布版本。

先将准备发布的代码和工作流提交并推送，确保 `package.json` 的 `version` 与标签一致，再执行：

```sh
# package.json 中的版本为 0.1.0 时
git tag -a v0.1.0 -m "RayTab v0.1.0"
git push origin v0.1.0
```

在仓库的 Actions 页面查看运行结果，完成后到 Releases 下载安装包。
目前只支持 `vX.Y.Z` 正式版本标签；已发布的版本不覆盖，后续修改使用新版本号。
工作流使用 GitHub 托管运行器自带的 `gh` 和自动提供的 `GITHUB_TOKEN`，
无需本地安装 GitHub CLI 或配置个人访问令牌。

该流程不向浏览器商店上架。Chrome ZIP 解压后可通过开发者模式“加载已解压的扩展程序”使用；
Firefox ZIP 是未签名构建，可用于临时加载或后续商店签名，不能直接作为正式签名安装包分发。

## 许可

[隐私说明](PRIVACY.md) · [MIT 许可](LICENSE)
