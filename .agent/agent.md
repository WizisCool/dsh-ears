# dsh-ears Agent Handoff

> 本文件是当前工作交接页。完成里程碑、改变验证结果或遇到阻塞时必须更新。

## 状态

- 阶段：文档与协作基线完成，准备进入 M1。
- 当前版本目标：dsh `0.1.0-rc.6`。
- 最近提交：`9601ebb docs: establish project context and security workflow`；基线提交：`c0ae3b9 chore: bootstrap dsh plugin workspace`。
- 远程操作：未执行 push；后续仍需用户明确授权。

## 已完成

- 初始化项目 Git 仓库并建立开发骨架。
- 验证 `pnpm check` 通过。
- 验证本机 dsh 版本为 `0.1.0-rc.6`。
- 建立脱敏后的仓库内 `PLAN.md`。
- 建立 `AGENTS.md`、`.agent/` 上下文、贡献指南和安全说明。
- 为本地秘密文件补充 `.gitignore` 规则；提交前敏感信息扫描通过。

## 最近验证

- `pnpm check`：通过。
- `git diff --cached --check`：通过。
- 常见凭据格式与个人绝对路径扫描：未发现结果。
- 最后状态：工作树干净；未执行 push。

## 当前实现事实

- `src/index.ts` 目前只是 Host 侧 Cordis 生命周期/HMR 探针。
- 尚未实现 `package.json` 的正式 Host/Client 双入口。
- 尚未实现 `dsh.client`、`conversation.input.right`、`inputActions.setDraft()` 或 Web Speech。
- 尚未实现润色 RPC、dsh `ctx.llm` 模型发现/选择、设置页、Whisper、云端 ASR 或情绪 UI。

## 下一步：M1

1. 核对 dsh rc.6 的正式插件包入口、`dsh.client` 和 bundle patch 约束。
2. 将 TypeScript 构建调整为 Host 与 Client 两个可发布入口。
3. 添加最小 `package.json` exports、`dsh.bundle.patch` 和 `dsh.client` 声明。
4. 保留独立的开发 HMR overlay，不把本机 patch 混进发布 patch。
5. 使用 `dsh --profile web --dump-config` 和真实 Web 启动做验证。

## 工作交接格式

后续 agent 结束时追加以下信息到本文件相应位置：

```text
完成：...
验证：命令 / 结果
未完成：...
阻塞：无 / 具体原因
下一步：...
提交：commit hash + message
```

## 不确定项

- dsh rc.6 中 `ctx.llm` 的模型发现、路由选择和 completion 调用的精确类型/API，需要在 M3 前用当前安装版本核对。
- 本地 Whisper、云端 ASR 和情绪标签均不属于 M1/M2 的范围。
