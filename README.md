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

## 许可

[隐私说明](PRIVACY.md) · [MIT 许可](LICENSE)
