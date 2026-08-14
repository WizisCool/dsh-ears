# dsh-ears

给纯文本的 DeepSeek 装耳朵：一个面向 DeepSeek Harness 的语音输入插件。

插件的目标交互是：点击麦克风开始说话，识别结果实时进入可编辑输入框；停止后可由 dsh 中已经接入的任意 LLM 模型润色，最后由用户手动发送。

当前项目处于开发基线阶段。Host 热加载探针已经存在，正式的 Host/Client 双入口、麦克风按钮和 Web Speech 链路将在后续 M1/M2 实现。详细范围以 [PLAN.md](./PLAN.md) 为准。

## 当前原则

- 第一版锁定 dsh `0.1.0-rc.6`。
- 润色只选择 dsh 已配置的 provider/model，不在插件中保存自有 API Key、base URL 或自定义模型。
- Web Speech API 可能使用浏览器厂商的外部识别服务，默认零额外成本不等于本地隐私识别。
- Web Speech 中途失败时保留已识别 draft，并提示重新录音；第一版不做同一会话无缝切换。
- 情绪标签、本机 Whisper、云端 ASR 都不属于当前骨架的已实现功能。

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

Web profile 的本地 patch 会启用 Cordis HMR，并把监听基目录固定为本项目的 `dist/`；`src/` 编译到 `dist/` 后，dsh 会卸载并重新加载插件。

`dev:config` 会编译插件、生成当前机器路径对应的 Cordis patch，并通过 `dsh --profile web --dump-config` 验证插件已进入组合配置。

`dev:web` 使用现有 dsh 的 Web profile 启动开发实例，但不会修改 `~/.dsh/profiles/web`。当前骨架的运行时入口是 `dist/index.js`。

当前 dsh `rc.6` 在带 patch 时应使用显式的 `--profile web` 形式；`dsh web --patch ...` 会被 CLI 拒绝，脚本已经按当前实际行为执行。

## 文档与协作上下文

- [PLAN.md](./PLAN.md)：脱敏后的产品与实施计划。
- [AGENTS.md](./AGENTS.md)：所有 coding agent 的仓库级工作规则。
- [.agent/agent.md](./.agent/agent.md)：当前可交接上下文与下一步。
- [.agent/context.md](./.agent/context.md)：稳定的项目背景和架构边界。
- [.agent/decisions.md](./.agent/decisions.md)：已确认决策记录。
- [.agent/workflow.md](./.agent/workflow.md)：多 agent 协作、原子提交和安全流程。
- [CONTRIBUTING.md](./CONTRIBUTING.md)：开源贡献规范。
- [SECURITY.md](./SECURITY.md)：敏感信息与安全问题处理。

## 安全边界

不要把 API Key、凭据、`.env` 文件、私人端点配置或本机生成的路径写入 Git。当前任务只做本地提交，不自动 push；发布前必须完成脱敏检查和人工确认。
