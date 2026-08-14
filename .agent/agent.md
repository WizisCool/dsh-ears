# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: documentation, collaboration baseline, and M1 package scaffold complete; M2 is next.
- Target: dsh `0.1.0-rc.6`.
- Latest commit: `b93ca12 chore: add dual-face dsh package scaffold`.
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
- Added official-style `tsdown` build with Host `.` and Client `./client` exports.
- Added `dsh.bundle.patch` and `dsh.client` manifest declarations.
- Installed the local link into the dsh `web` profile and verified Host loading plus the browser `__DSH_BOOT__` entry.

## M1 verification

- `pnpm check`: passed.
- `pnpm build`: passed; generated `lib/index.js`, `lib/client.js`, and declarations.
- `pnpm pack --dry-run`: passed; tarball includes both runtime entries and declarations.
- `dsh --profile web --dump-config`: passed; Host `dsh-ears` entry composed.
- `dsh --profile web --help`: passed; Host plugin loaded and disposed.
- `dsh --profile web --port 0`: passed; temporary Web surface booted.
- `window.__DSH_BOOT__`: passed; browser entry `/plugins/dsh-ears/client.js` appeared with `inject: []`.

## Current implementation facts

- `src/index.ts` is still only a Host-side Cordis lifecycle/HMR probe.
- The formal Host/Client package exports are not implemented yet.
- `dsh.client`, `conversation.input.right`, `inputActions.setDraft()`, Web Speech, polishing RPC, settings UI, Whisper, cloud ASR, and emotion UI are not implemented.

## Next task: M2

1. Inspect the installed rc.6 client runtime and slot type contracts for `conversation.input.right`.
2. Implement the smallest microphone button in the browser Client entry.
3. Start/stop a Web Speech session with `zh-CN`, `continuous`, and `interimResults`.
4. Update the draft through the verified `inputActions.setDraft()` contract.
5. Verify supported, unsupported, and mid-session failure behavior in the Web surface.

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
- Local Whisper, cloud ASR, emotion labels, and LLM polishing are deferred and must not leak into M2 scope.
- The project license is intentionally undecided; no legal license file has been added.
