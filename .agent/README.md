# Agent Context

`.agent/` contains the durable context shared across agents and sessions. It is not a secret store and it is not a scratch log.

## Reading order

1. `agent.md` — current status and next step.
2. `context.md` — stable product and architecture context.
3. `decisions.md` — accepted decisions and their status.
4. `workflow.md` — collaboration, validation, commit, and security rules.

## Language

All context documents are English-first to match the official DeepSeek Harness repository and make future public review easier. Product-facing prompt text may use Chinese when the product requires Chinese recognition and polishing behavior.

## Update rules

- Update `agent.md` after every milestone, verification change, blocker, or handoff.
- Keep `context.md` for stable facts; update it when boundaries or architecture change.
- Keep `decisions.md` append-only. When a decision is replaced, record the replacement instead of deleting history.
- Update `workflow.md` only when the collaboration contract changes.
- Never write credentials, private URLs, cookies, user data, or personal absolute paths here.
