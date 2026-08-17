# Contributing to dsh-ears

Thank you for contributing. The project is early-stage and follows the English-first conventions used by the official DeepSeek Harness repository.

Before making a change, read:

1. [.agent/PLAN.md](./.agent/PLAN.md)
2. [AGENTS.md](./AGENTS.md)
3. [.agent/agent.md](./.agent/agent.md)
4. [.agent/workflow.md](./.agent/workflow.md)

## Local setup

```sh
pnpm install
pnpm check
```

When dsh profile verification is relevant:

```sh
pnpm dev:config
pnpm dev:web
```

## Change expectations

- State the goal, scope, and acceptance evidence.
- Keep one commit focused on one atomic concern.
- Use English for source, comments, docs, context, issue-ready text, and commit messages.
- Follow official dsh package conventions for manifest fields, exports, lifecycle, and README structure.
- Use explicit Git paths; do not use an unreviewed `git add -A`.
- Run the relevant checks and `git diff --cached --check` before committing.
- Do not push, publish a package, or modify a remote repository without explicit authorization.

## Security

Do not commit API keys, tokens, cookies, private endpoints, user data, certificates, `.env` files, or personal machine paths. See [SECURITY.md](./SECURITY.md).
