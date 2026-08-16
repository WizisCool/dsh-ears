# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Current work: post-M6 Whisper robustness hardening (D-020) and composer microphone availability gating (D-021) are complete. The microphone now grays out on positive unavailability signals (backend reported unavailable, Whisper model downloading, or model file with marker missing). D-019 is closed; D-018 remains open.
- Follow-up UI fix: added the `dsh-ear.svg` project asset and corrected the rc.6 composer order to model → ContextMeter → microphone → send. The rc.6 settings-section contract does not expose a custom nav-icon field, so the left settings rail keeps dsh's native fallback icon without a dsh-core change.
- Target compatibility: dsh `0.1.0-rc.6`, Node `^22.19.0 || >=24.0.0`.
- Branch: `master`; the post-audit UI fixes, the Whisper hardening commits, and the microphone gating commit are local-only until the maintainer authorizes another push.
- Latest code commit: `defa4cd feat(client): gray the microphone when the backend cannot transcribe`.
- Latest hardening commits: `e6ab7ae refactor(host): make whisper model lifecycle disposable with failure caching`, `570b7fa feat(host): add whisper download completion markers`, `6e169f4 test(host): cover whisper model lifecycle with a fake python interpreter`, `3ba38ea feat(host): gate local whisper transcription on model readiness`, `0538b75 fix(host): carry whisper stderr tail into transcription errors`, `1f9da53 fix(host): resolve windows python and py launchers via PATHEXT`.
- Repository strategy: MIT license and private GitHub repository `WizisCool/dsh-ears` are recorded; npm publishing, tags, and public visibility remain gated.
- Repository language: English-first for source, docs, context, comments, and commit messages.
- Tooling note: `pnpm` is not on this shell's PATH (corepack is too old for pnpm 11); use the local bins — `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsdown`, `./node_modules/.bin/tsc -p tsconfig.build.json`.

## Completed audit and hardening

- Split the settings view from its asynchronous controller and added request generations for settings, routes, reasoning efforts, and Whisper state.
- Staged incomplete cross-field settings edits: enabling polishing or switching to Cloud ASR waits for required fields instead of submitting a Host-invalid partial patch; valid fields still save independently.
- Made Whisper download/cancel/delete/poll responses latest-wins, kept cancellation authoritative during cleanup, and preserved retry actions after failures.
- Made MediaRecorder start failures terminal and track-safe; late polish results are ignored after abort/unmount even when a Remote implementation ignores cancellation.
- Added Cloud ASR request timeout (120 seconds), early cancellation checks, bounded streamed polish output, and strict rejection of unknown backend/model identifiers.
- Aligned Host and Client Remote cancellation metadata for `updateSettings`; the parity test now compares every endpoint's parameters, codecs, cancellation marker, and result schema.
- Kept the high-risk recording-settings snapshot question and Whisper crash-residue integrity policy open rather than changing the first-release protocol implicitly.

## Completed Whisper robustness hardening (D-020)

- Extracted the module-level whisper state into a per-service, injectable `WhisperModels` instance disposed with the Cordis scope; dispose kills an active download, removes its partial file, and drops cached discoveries.
- Negative-cached interpreter and model-table discovery failures for 30 seconds so a broken environment stops re-spawning expensive `import whisper` probes.
- Added download completion markers (`.dsh-ears-done`): a model file only counts as downloaded with its marker present; marker-less files report as not downloaded, orphaned markers are removed, delete/cancel/dispose clean both (closes D-019).
- Gated Local Whisper transcription on CLI availability and a downloaded, marked model so a missing model is rejected instead of auto-downloaded inside the 120-second transcription timeout.
- Carried the whisper stderr tail (≤800 characters) into transcription errors.
- Fixed Windows python/py launcher probing (`python.exe`/`py.exe` + PATHEXT); Windows stays documented as not yet smoke-tested.
- Documented the scale boundary (`medium`+ needs GPU or faster runtime) in the settings hint and README; the not-downloaded copy no longer promises automatic first-use downloads.
- Added fake-python integration tests for the full lifecycle: download/cancel/delete, progress parsing, marker semantics, dispose cleanup, and negative caches (80 tests total).

## Completed composer microphone availability gating (D-021)

- The microphone grays out (aria-disabled + bilingual tooltip) when the selected backend is reported unavailable by the Host, the Whisper model is still downloading, or the model file with its completion marker is missing.
- Gating is positive-signal-only: loading, failed, and unknown states keep the button enabled, and `starting`/`recording`/`transcribing`/`polishing` states are never gated so the stop affordance stays reachable.
- The decision logic lives in the pure `mic-availability.ts` helper with unit coverage; the slot now injects wrapped backend/whisper store hooks built from a shared `createSnapshotHook` wrapper.

## Verification evidence

Current local checks after the Whisper hardening commits:

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed.
- `./node_modules/.bin/vitest run` — passed; 87 tests across 10 files.
- `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` — passed; Host ESM, Client factory bundle, CSS, declarations, and source maps generated.
- `git diff --cached --check` — passed after each commit.
- Whisper lifecycle integration tests run against a fake `python3` executable with an isolated `XDG_CACHE_HOME`; they never touch the real whisper installation or `~/.cache/whisper`.
- Real-whisper smoke on this host (`whisper --help` ≈ 1.1–1.8 s; Homebrew fork `20250625_3`) confirmed the availability-probe headroom; no re-download was performed during the review.

Earlier local checks after the final handoff commit:

- `pnpm check` — passed.
- `pnpm test` — passed; 61 tests across 9 files.
- `pnpm build` — passed; Host ESM, Client factory bundle, CSS, declarations, and source maps generated.
- `pnpm pack --dry-run` — passed; package contents include Host/Client entries, declarations, patch, README, changelog, and license.
- `git diff --check` — passed after each code commit.
- Secret scan for common key/private-key patterns — no matches.

Final real rc.6 smoke evidence on the latest build:

- `dsh --version` returned `0.1.0-rc.6`.
- `pnpm dev:config` produced the HMR patch and a temporary Web boot on port 64804 loaded `/plugins/dsh-ears/client.js` (HTTP 200; manifest revision observed).
- Native `dsh-ear` Recognition and Polishing tabs loaded without the load-failure hint; Whisper state RPC rendered; composer order measured as model → microphone → send with computed orders 1, 2, 3.
- Browser warning/error logs were empty.
- Shutdown printed `Invalid revision range c964...HEAD`; this was reproduced as an HMR/environment diagnostic after the plugin had loaded, not attributed to business code.

## Follow-up UI verification

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed.
- `./node_modules/.bin/vitest run` — passed; 61 tests across 9 files.
- `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` — passed; final Host/Client artifacts generated.
- Impeccable detector — clean on the changed UI targets.
- Existing `dsh web` on `127.0.0.1:3080` served the rebuilt Client bundle with HTTP 200 and the final composer-order selectors. No `dev:watch` process is running, so the browser needs a refresh to consume the rebuilt bundle.

## Current boundaries and open decisions

- Web Speech may use a browser-vendor recognition service; it is not claimed to be local-only.
- Cloud ASR is limited to the documented OpenAI-compatible multipart `{ file, model, language? }` and JSON `{ text }` contract.
- Emotion recognition/output and emotion UI remain intentionally deferred.
- The plugin does not bundle Whisper model weights.
- `transcribe()` reads backend/model/language when the Host RPC begins. Option A is a recording-start settings snapshot; Option B is locking recognition settings during capture/transcription. This requires a protocol decision.
- Whisper crash-residue integrity is closed by the `.dsh-ears-done` completion marker (D-020): marker-less files are reported as not downloaded.
- The composer microphone grays out on positive unavailability signals only (D-021); loading/unknown states and active flow states never gray.
- Windows launcher probing is implemented but not yet smoke-tested on Windows; `medium` and larger models are documented as impractical on the CPU + 120-second path.
- No API keys, credentials, user audio, personal paths, private endpoints, or user data belong in Git.

## Remaining release gates

1. Keep the compatibility matrix current when dsh releases change.
2. npm publishing, release tags, and any public visibility change still require an explicit maintainer release decision.

## Final task record

- Completed: composer microphone availability gating (D-021) — the microphone grays out with a bilingual tooltip when the Host reports the selected backend unavailable, the Whisper model is downloading, or the model file with its completion marker is missing; gating is positive-signal-only and never applies to active flow states. Added the pure `mic-availability.ts` helper, wrapped backend/whisper store hooks for the slot, and unit coverage.
- Validation: `tsc` typecheck, `vitest` (87/87 tests across 10 files), `tsdown` & `tsc` builds, and `git diff --cached --check` all passed.
- Unfinished: D-018 (recording-settings snapshot versus locking) remains open; the gray-mic behavior and the earlier Host-side gate still need a real rc.6 Web smoke (Host-side changes require a `dsh web` restart, and the client bundle needs a browser refresh).
- Blocked: none.
- Commit: `defa4cd feat(client): gray the microphone when the backend cannot transcribe`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
