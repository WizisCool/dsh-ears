# Contributing to dsh-ears

感谢参与 dsh-ears。项目仍处于早期开发阶段，请先阅读：

1. [PLAN.md](./PLAN.md)
2. [AGENTS.md](./AGENTS.md)
3. [.agent/agent.md](./.agent/agent.md)
4. [.agent/workflow.md](./.agent/workflow.md)

## Local setup

```sh
pnpm install
pnpm check
```

需要验证 dsh profile 时：

```sh
pnpm dev:config
pnpm dev:web
```

## Changes

- 先说明目标、范围和验收方式。
- 保持一个提交只解决一个原子问题。
- 使用 Conventional Commits，例如 `docs: establish project context`。
- 明确暂存文件，不使用无审查的 `git add -A`。
- 提交前运行与改动匹配的检查，并执行 `git diff --cached --check`。
- 不要在没有明确授权的情况下 push、发布包或修改远程仓库。

## Security

请不要提交 API Key、token、Cookie、私有端点、用户数据、证书、`.env` 文件或本机内部路径。详见 [SECURITY.md](./SECURITY.md)。
