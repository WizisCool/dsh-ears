# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Local release-readiness audit: complete; public release remains gated by an explicit license/release decision.
- Target: dsh `0.1.0-rc.6`.
- Latest implementation commit: `b6467e8 refactor(client): isolate Host settings schema`.
- Latest test/package commits: `242563b test: cover Remote descriptor parity`, `674d656 chore(package): include changelog in tarball`.
- Current HEAD: `8473704 docs: close local release readiness`.
- Previous UI commit: `7bfa752 fix(client): follow dsh composer styling`.
- Remote operations: no push or publish has been performed.
- Repository language: English-first for source, docs, context, comments, and commits.

## Completed implementation

- Official-style Host/Client package exports, `dsh.bundle.patch`, `dsh.client`, and CSS-module client bundling.
- Web Speech live recognition with interim/final draft updates, retryable errors, recording limits, and silent teardown abort.
- dsh-native composer placement and light/dark semantic token adaptation: model selector → microphone → send visually.
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

Real dsh verification already completed:

- dsh Host loaded the plugin and the browser bundle rendered the microphone.
- Native Plugins settings loaded dsh routes, persisted a recording-limit edit, and restored it.
- No `remote.dshEars without inject` regression appeared after fresh boot/hot reload.
- Composer position and dsh semantic colors were measured in both light and dark themes.
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
2. Review the compatibility and license decision before any future public release. Do not add a legal license automatically.

## Blockers

None. A non-empty live dsh polish completion still depends on a usable configured dsh model route; route discovery and failure fallback are verified.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
