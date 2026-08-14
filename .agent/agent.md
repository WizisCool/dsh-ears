# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: documentation and collaboration baseline complete; M1 is next.
- Target: dsh `0.1.0-rc.6`.
- Latest commit: `e0b621a docs: refresh agent handoff state`.
- Baseline commits: `9601ebb docs: establish project context and security workflow`, `c0ae3b9 chore: bootstrap dsh plugin workspace`.
- Remote operations: no push or publish has been performed.
- Repository language: English-first for code, docs, context, comments, and commits.

## Completed

- Initialized the project Git repository and development probe.
- Verified `pnpm check`.
- Verified the local dsh version is `0.1.0-rc.6`.
- Added a public-safe repository `PLAN.md`.
- Added `AGENTS.md`, `.agent/` context, contribution guidance, and security policy.
- Added ignored local secret-file patterns and checked for common credential formats and personal absolute paths.

## Current implementation facts

- `src/index.ts` is still only a Host-side Cordis lifecycle/HMR probe.
- The formal Host/Client package exports are not implemented yet.
- `dsh.client`, `conversation.input.right`, `inputActions.setDraft()`, Web Speech, polishing RPC, settings UI, Whisper, cloud ASR, and emotion UI are not implemented.

## Next task: M1

1. Confirm the rc.6 package entry and client dependency conventions against the installed official packages.
2. Add a Host entry and a browser Client entry with official-style exports.
3. Add `dsh.bundle.patch` and `dsh.client` declarations.
4. Replace the single-entry TypeScript build with a reproducible two-entry build, preferably using the repository's official `tsdown` convention.
5. Keep `.dsh/` development HMR overlay separate from the publishable patch.
6. Verify the package build, `dsh --profile web --dump-config`, and a real Web profile boot.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```

## Known uncertainty

- The exact rc.6 `ctx.llm` model discovery, route selection, and completion types must be verified before M3.
- Local Whisper, cloud ASR, and emotion labels are deferred and must not leak into M1/M2 scope.
- The project license is intentionally undecided; no legal license file has been added.
