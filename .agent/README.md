# Agent and contributor context

`.agent/` holds durable project context. It is not a secret store and it is not a session log.

## Files

| File | Read when |
| --- | --- |
| [`PLAN.md`](./PLAN.md) | Product scope, compatibility, and still-open gates |
| [`context.md`](./context.md) | Architecture, Host/Client boundary, current settings and ASR surface |
| [`decisions.md`](./decisions.md) | Append-only ADRs. Start at the status index; superseded IDs are not live law |
| [`workflow.md`](./workflow.md) | Validation, commit, and security rules |
| [`research/`](./research/) | Optional evidence behind specific ADRs |

Delivery history lives in [`CHANGELOG.md`](../CHANGELOG.md). Do not add a per-task handoff diary.

## Language

Context documents are English-first. Product-facing prompt text may use Chinese when the product requires Chinese recognition and polishing behavior.

## Update rules

- Update `context.md` when architecture or a product boundary changes.
- Keep `decisions.md` append-only. When a decision is replaced, mark the old status and record the replacement. Do not delete history.
- Update `PLAN.md` when scope, compatibility, or an open gate changes.
- Update `workflow.md` only when the collaboration contract changes.
- Never write credentials, private URLs, cookies, user data, or personal absolute paths here.
