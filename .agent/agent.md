# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Local release-readiness audit: complete; the MIT license decision is recorded and the repository is released privately on GitHub; npm publishing remains gated by an explicit release decision.
- Target: dsh `0.1.0-rc.6`.
- Latest implementation commit: `7a71513 fix(client): align microphone with model selector`.
- Latest docs commit: `004d799 docs: sync license and release decisions`.
- Latest client commit: `da4c2ed fix(client): update settings card title and read-only hint`.
- Latest test/package commits: `242563b test: cover Remote descriptor parity`, `674d656 chore(package): include changelog in tarball`.
- Current branch: `master`; the handoff commit for this refinement follows the implementation commit.
- Previous UI commit: `7bfa752 fix(client): follow dsh composer styling`.
- Previous icon commit: `e7c4c94 fix(client): refine microphone icon`.
- Remote operations: pushed to the private GitHub repository `WizisCool/dsh-ears`; no npm publish, release tag, or public visibility change has been performed.
- Repository language: English-first for source, docs, context, comments, and commits.

## Completed implementation

- Official-style Host/Client package exports, `dsh.bundle.patch`, `dsh.client`, and CSS-module client bundling.
- Web Speech live recognition with interim/final draft updates, retryable errors, recording limits, and silent teardown abort.
- dsh-native composer placement and light/dark semantic token adaptation: model selector → microphone → send visually.
- Refined the 16px microphone SVG with dsh-compatible optical weight, rounded geometry, and currentColor theming.
- Matched microphone default/hover/focus behavior and label-secondary color to the native model selector.
- Host-owned dsh LLM route discovery and optional transcript polishing with raw-transcript fallback.
- Native `settings.plugin.item` card for language, recording limit, backend, Whisper model, cloud endpoint/model/credential reference, and dsh polish route.
- Local Whisper Host adapter using a non-shell child process, private temporary files, cancellation, timeout, and cleanup.
- OpenAI-compatible cloud ASR adapter using bounded multipart input/response handling and per-operation dsh credential resolution.
- MediaRecorder capture with constrained mono audio, idempotent stop, error cleanup, track release, and manual draft protection.
- Browser-side recording buffers are bounded before finalization; overflow stops capture and releases tracks.
- Typed Typert Host/Client Remote contracts and Cordis child-scope injection of `remote.dshEars`.
- Shared settings validation and pure draft-flow helpers with focused tests.

## Verification evidence

Commands currently passing:

- `pnpm check`
- `pnpm test` — 29 tests across 7 files
- `pnpm build`
- `pnpm pack --dry-run` — passed; tarball contents reviewed
- `git diff --check`
- `node /Users/junze/.agents/skills/impeccable/scripts/detect.mjs --json src/client/MicrophoneButton.tsx` — passed with no findings
- Microphone and model selector computed text colors matched in both dsh themes; default microphone background was transparent and focus ring used `--dsw-alias-border-l3`.

Real dsh verification already completed:

- dsh Host loaded the plugin and the browser bundle rendered the microphone.
- Native Plugins settings loaded dsh routes, persisted a recording-limit edit, and restored it.
- No `remote.dshEars without inject` regression appeared after fresh boot/hot reload.
- Composer position and dsh semantic colors were measured in both light and dark themes.
- The refined microphone SVG hot-loaded in the local dsh browser and was visually checked in light and dark composer states; the original light theme setting was restored afterward.
- A generated audio file was transcribed by the installed local Whisper command.
- A real dsh Host `dshEars/transcribe` wire request returned the expected transcript.

## Current boundaries

- Compatibility is promised only for dsh `0.1.0-rc.6` until another release is tested.
- Web Speech may use a browser-vendor recognition service; it is not claimed to be local-only.
- Cloud ASR is limited to the documented OpenAI-compatible multipart `{ file, model, language? }` and JSON `{ text }` contract.
- Emotion recognition/output and emotion UI remain intentionally deferred.
- The plugin does not bundle Whisper model weights.
- No API keys, credentials, user audio, personal paths, private endpoints, or user data belong in Git.

## Remaining release work

1. Keep the compatibility matrix current when dsh releases change.
2. npm publishing, release tags, and any public visibility change require an explicit maintainer release decision.

## Blockers

None. A non-empty live dsh polish completion still depends on a usable configured dsh model route; route discovery and failure fallback are verified.

## Latest task record

- Completed: renamed the plugin configuration card title to `dsh-ear` and expanded the read-only hint in both locales (zh/en parity); investigated the live read-only message with a temporary Host diagnostic plugin — the running settings service reports `writable: true` and dsh-ears `getSettings()` returns `writable: true`, so the message in the GUI was the client fallback view kept after a failed first settings RPC (stale served bundle / transient fetch failure).
- Validation: `tsc --noEmit` passed; `vitest run` 29/29 passed; `tsdown` + declaration build passed; the served bundle (`/plugins/dsh-ears/client.js`) was verified to contain the new copy after rebuild; `git diff --cached --check` passed.
- Unfinished: optional hardening — retry `refreshSettings()` after a transient first-fetch failure so the card does not stay read-only — deferred pending maintainer decision.
- Blocked: none.
- Next: push the unpushed local commits after maintainer authorization.
- Commit: `da4c2ed fix(client): update settings card title and read-only hint`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
