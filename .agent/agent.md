# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Local release-readiness audit: complete; the MIT license decision is recorded and the repository is released privately on GitHub; npm publishing remains gated by an explicit release decision.
- Target: dsh `0.1.0-rc.6`.
- Latest implementation commit: `7a71513 fix(client): align microphone with model selector`.
- Latest docs commit: `3000339 docs: record dedicated settings page decision`.
- Latest client commit: `4b409aa feat(client): show only the active backend's configuration`.
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
- Dedicated `settings.section` page (`dsh-ear`, order 16) with Plugins-style tab cards (Recognition / Polishing), General/Permissions-style rows with pill `Menu` selectors, clean backend labels (`Web Speech` / `Local Whisper` / `Cloud ASR`), active-backend-only configuration rows with matching hint text (settings persist across switches), and debounced auto-save with per-field invalid skipping and native-style feedback (D-017; supersedes the former Plugins-page card and the manual Save/Discard footer).
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

- Completed: moved plugin configuration out of the Plugins page into a dedicated `settings.section` page (`dsh-ear`, nav order 16) styled after the shipped Models page — grouped Recognition/Polishing cards, same semantic tokens, same draft/save/discard flow and read-only fallback; superseded D-011 with D-017 and synced PLAN/context/PROGRESS/changelog.
- Validation: `tsc --noEmit` passed; `vitest run` 29/29 passed; `tsdown` + declaration build passed; the served bundle (`/plugins/dsh-ears/client.js`) contains the `settings.section` registration and no `settings.plugin.item` reference.
- Unfinished: optional hardening — retry `refreshSettings()` after a transient first-fetch failure so the page does not stay read-only — deferred pending maintainer decision.
- Blocked: none.
- Next: browser verification of the new page after reload; push the unpushed local commits after maintainer authorization.
- Commit: `e0117d8 feat(client): move configuration to a dedicated settings page`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
