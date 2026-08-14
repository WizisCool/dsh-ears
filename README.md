# dsh-ears

DeepSeek Harness 插件的本地开发骨架。

## 开发命令

```sh
pnpm install
pnpm check
pnpm dev:config
pnpm dev:web
```

需要源码保存后自动编译时，另开一个终端运行：

```sh
pnpm dev:watch
```

Web profile 的本地 patch 会启用 Cordis HMR，并把监听基目录固定为本项目的
`dist/`；`src/` 编译到 `dist/` 后，dsh 会卸载并重新加载插件。

`dev:config` 会编译插件、生成当前机器路径对应的 Cordis patch，并通过
`dsh --profile web --dump-config` 验证插件已进入组合配置。

`dev:web` 使用现有 dsh 的 Web profile 启动开发实例，但不会修改
`~/.dsh/profiles/web`。插件的运行时入口是 `dist/index.js`。

当前 dsh `rc.6` 在带 patch 时应使用显式的 `--profile web` 形式；`dsh web --patch ...`
会被 CLI 拒绝，脚本已经按当前实际行为执行。
