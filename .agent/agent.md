# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold and M2 microphone implementation complete; M3 is next.
- Target: dsh `0.1.0-rc.6`.
- Latest commit: `1787a90 feat: add Web Speech microphone input`.
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
- Added the dsh client-module factory wrapper and CSS-module bundling required by the rc.6 browser loader.
- Added `dsh.bundle.patch` and `dsh.client` manifest declarations.
- Installed the local link into the dsh `web` profile and verified Host loading plus the browser `__DSH_BOOT__` entry.
- Added the Codex-style microphone control, Web Speech session, failure state, and draft updates.

## M1 verification

- `pnpm check`: passed.
- `pnpm build`: passed; generated `lib/index.js`, `lib/client.js`, and declarations.
- `pnpm pack --dry-run`: passed; tarball includes both runtime entries and declarations.
- `dsh --profile web --dump-config`: passed; Host `dsh-ears` entry composed.
- `dsh --profile web --help`: passed; Host plugin loaded and disposed.
- `dsh --profile web --port 0`: passed; temporary Web surface booted.
- `window.__DSH_BOOT__`: passed; browser entry `/plugins/dsh-ears/client.js` appeared with the declared client dependency graph.

## M2 verification

- `pnpm test`: passed; 3 tests passed.
- `pnpm check`: passed.
- `pnpm build`: passed; Host ESM, Client factory bundle, CSS, and declarations generated.
- `pnpm pack --dry-run`: passed; tarball contains `lib/client.js` and `lib/client.d.ts`.
- `pnpm dev:web`: passed; the HMR-only patch starts without a duplicate `dsh-ears` loader entry.
- Local dsh Web surface: passed; `Start voice input` rendered in `conversation.input.right`.
- Local browser failure path: passed; clicking the control reached the retryable error state without sending a message.
- Native settings inspection: passed; dsh exposes `设置 → 插件 → 插件配置` as the target surface for future `settings.plugin.item` registration.

## Current implementation facts

- `src/index.ts` remains the minimal Host-side Cordis lifecycle/HMR probe.
- The formal Host/Client package exports and `dsh.client` declaration are implemented.
- `conversation.input.right`, `inputActions.setDraft()`, the Web Speech session, and the Codex-style microphone control are implemented in commit `1787a90`.
- The browser bundle now registers through `window.__ModuleLoader__.load` and the real Web surface renders the microphone control.
- Polishing RPC, native plugin configuration UI, Whisper, cloud ASR, and emotion UI are not implemented.

## Next task: M3

1. Verify the rc.6 Host `ctx.llm` discovery, route selection, and completion contract.
2. Add the Host-side text-only polishing RPC and dsh route selection.
3. Register future configuration in the native Plugins page through `settings.plugin.item`.

## Native settings decision

- Future settings work must register a `dsh-ears` configuration card in `settings.plugin.item`.
- Do not implement a separate Voice settings tab or `settings.section` entry.

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
- Successful spoken recognition still needs a browser with an explicitly granted microphone permission; the local smoke run verified the unavailable/failed path.
- Local Whisper, cloud ASR, emotion labels, and LLM polishing are deferred and must not leak into M2 scope.
- The project license is intentionally undecided; no legal license file has been added.
