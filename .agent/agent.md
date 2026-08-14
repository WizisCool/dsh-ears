# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone implementation, M3 polishing, and M4 native settings complete; M5 is next.
- Target: dsh `0.1.0-rc.6`.
- Latest commit: `4b22fd9 feat: add dsh-owned polishing and native settings`.
- Recent UI baseline: `b2d65ad docs: record composer theme and ordering fix`.
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
- Adapted the microphone control to dsh semantic color tokens and both dsh light/dark themes.
- Corrected rc.6 composer ordering to model selector → microphone → send button.
- Added strict Typert Host RPCs for settings, dsh route discovery, and text-only transcript polishing.
- Added the native `settings.plugin.item` configuration card with dsh provider/model route selection and persistence.
- Bound asynchronous Client controllers and React callbacks to a Cordis scope that injects `remote.dshEars`.
- Added Host route/fallback, prompt, and Remote contract tests.

## M1 verification

- `pnpm check`: passed.
- `pnpm build`: passed; generated `lib/index.js`, `lib/client.js`, and declarations.
- `pnpm pack --dry-run`: passed; tarball includes both runtime entries and declarations.
- `dsh --profile web --dump-config`: passed; Host `dsh-ears` entry composed.
- `dsh --profile web --help`: passed; Host plugin loaded and disposed.
- `dsh --profile web --port 0`: passed; temporary Web surface booted.
- `window.__DSH_BOOT__`: passed; browser entry `/plugins/dsh-ears/client.js` appeared with the declared client dependency graph.

## M2 verification

- `pnpm test`: passed; 9 tests passed.
- `pnpm check`: passed.
- `pnpm build`: passed; Host ESM, Client factory bundle, CSS, and declarations generated.
- `pnpm pack --dry-run`: passed; tarball contains `lib/client.js` and `lib/client.d.ts`.
- `pnpm dev:web`: passed; the HMR-only patch starts without a duplicate `dsh-ears` loader entry.
- Local dsh Web surface: passed; `Start voice input` rendered in `conversation.input.right`.
- Local browser failure path: passed; clicking the control reached the retryable error state without sending a message.
- Local browser light-theme path: passed; model selector, microphone, and send button retained the expected order and positions.
- Local browser dark-theme path: passed; the same order and dsh semantic tokens rendered without a light-theme-only color fallback.
- Impeccable UI detector: passed with no findings.
- Native settings inspection: passed; `设置 → 插件 → 插件配置` renders the `语音输入` card.

## Current implementation facts

- `src/index.ts` loads the Host-side `PolishService`; its strict Typert contract is exported through `src/typert.ts` and `src/remote.ts`.
- The formal Host/Client package exports and `dsh.client` declaration are implemented.
- `conversation.input.right`, `inputActions.setDraft()`, the Web Speech session, and the Codex-style microphone control are implemented in commit `1787a90`.
- The browser bundle now registers through `window.__ModuleLoader__.load` and the real Web surface renders the microphone control.
- The browser bundle mounts the dsh-ears Remote contribution and passes the injected `dshEars` namespace into the microphone and settings controllers.
- Native plugin configuration includes language, recording limit, polishing toggle, and any dsh-configured provider/model route.
- Whisper, cloud ASR, ASR backend selection, and emotion UI are not implemented.

## M2 UI fix verification

- `src/client/MicrophoneButton.module.css` uses public `data-slot` topology selectors because rc.6 renders the right list slot before the named model seat and slot wrappers use `display: contents`.
- The control uses dsh semantic tokens for toolbar, information, primary-label, error, and focus colors; it does not hardcode Codex palette values.
- Browser measurements at the local Web surface confirmed model → microphone → send in both light and dark themes.

## M3/M4 verification

- `pnpm check`: passed.
- `pnpm test`: passed; 9 tests passed.
- `pnpm build`: passed; Host ESM, Client factory bundle, CSS, and declarations generated.
- `pnpm pack --dry-run`: passed; the package contains both runtime entries, declarations, the Typert contract, and the public bundle patch.
- Fresh dsh Web boot on temporary port `3091`: passed; the microphone and native settings card loaded.
- Native `Plugins → 插件配置`: passed; provider/model routes were listed and the recording limit was changed and restored through the card.
- Cordis Remote regression: passed; no `remote.dshEars without inject` error appeared on the fresh boot or after hot reload.
- Composer measurements: passed in light and dark themes; model selector → microphone → send button.
- Theme measurements: passed in light and dark themes; microphone color follows dsh semantic tokens.

The real dsh route list was exercised. A successful non-empty polish completion still needs a browser run with a usable configured model; mocked tests cover route failure and raw-transcript fallback.

## Next task: M5

1. Define the audio capture contract before adding a non-Web-Speech backend.
2. Evaluate local Whisper and cloud adapters separately with real endpoint and cancellation tests.
3. Add privacy documentation, broader browser coverage, and stale/manual draft protection tests.

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

- The exact rc.6 `ctx.llm` model discovery, route selection, and completion types are implemented and verified for route listing; a successful live polish completion remains environment-dependent.
- Successful spoken recognition still needs a browser with an explicitly granted microphone permission; the local smoke run verified the unavailable/failed path.
- Local Whisper, cloud ASR, ASR backend selection, and emotion labels are deferred and must not leak into M5 scope without separate contracts.
- The project license is intentionally undecided; no legal license file has been added.
