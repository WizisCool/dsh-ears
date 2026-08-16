# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Current work: the settings page now follows a per-field validate-on-edit model (D-024): validation recomputes on the 400 ms auto-save cadence for the edited field only, untouched fields never turn red, red appears only for invalid user input and real failures, guidance prompts for "not yet configured" states are removed, backend/provider switches save immediately, an incomplete polishing pair leaves polishing dormant (revises PLAN D3), the first-load alert appears only after the single automatic retry fails, and the API key row surfaces its own over-length error. No third-party form library is adopted (D-025); industry and dsh-platform research lives in `.agent/research/validation-timing-patterns.md` and `.agent/research/form-library-evaluation.md`. D-019 is closed; D-018 remains open.
- Latest code commit: `4d110b6 feat(client): validate each settings field on edit instead of a unified sweep`.
- Target compatibility: dsh `0.1.0-rc.6`, Node `^22.19.0 || >=24.0.0`.
- Branch: `master`; all post-audit work (UI fixes, Whisper hardening, microphone gating, cloud provider presets, per-field settings model) is local-only until the maintainer authorizes another push.
- Earlier work kept for context: Groq cloud ASR provider preset (D-023) — inline `role('secret')` API key, Host provider registry, `listCloudProviderModels` RPC, grouped backend/provider selector, cloud-readiness microphone gating — and the rc.6 composer-order fix (model → ContextMeter → microphone → send; the rc.6 settings-section contract exposes no custom nav-icon field, so the left rail keeps dsh's native fallback icon).
- Latest hardening commits: `e6ab7ae refactor(host): make whisper model lifecycle disposable with failure caching`, `570b7fa feat(host): add whisper download completion markers`, `6e169f4 test(host): cover whisper model lifecycle with a fake python interpreter`, `3ba38ea feat(host): gate local whisper transcription on model readiness`, `0538b75 fix(host): carry whisper stderr tail into transcription errors`, `1f9da53 fix(host): resolve windows python and py launchers via PATHEXT`.
- Repository strategy: MIT license and private GitHub repository `WizisCool/dsh-ears` are recorded; npm publishing, tags, and public visibility remain gated.
- Repository language: English-first for source, docs, context, comments, and commit messages.
- Tooling note: `pnpm` is not on this shell's PATH (corepack is too old for pnpm 11); use the local bins — `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsdown`, `./node_modules/.bin/tsc -p tsconfig.build.json`.

## Completed audit and hardening

- Split the settings view from its asynchronous controller and added request generations for settings, routes, reasoning efforts, and Whisper state.
- Replaced the cross-field settings staging with a per-field validate-on-edit model (D-024): only the edited field is validated, on the auto-save cadence; invalid drafts skip only their own write and every valid value saves independently. The earlier "enabling polishing or switching to Cloud ASR waits for required fields" behavior is superseded — a backend/provider switch persists immediately, and an incomplete polishing pair leaves polishing dormant (revised D3).
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

## Completed per-field settings validation model (D-024, D-025)

- Switched the settings page from a unified cross-field validity sweep to per-field validate-on-edit: validation recomputes on the same 400 ms cadence as the auto-save, for the edited field only (touched gating — untouched fields are never marked invalid, persisted values are never re-flagged).
- Red is reserved for genuinely invalid user input (illegal endpoint URL, over-long API key, empty language, out-of-range recording limit) and real failures (save failure, model-list fetch failure, Whisper operation failures, stale cloud model); all "not yet configured" guidance prompts (backend-unavailable line, no-key model hint, amber incomplete tier) are removed, so a fresh unconfigured page shows no prompts at all. The composer microphone's D-021 gray-out with tooltip remains the readiness signal.
- Save semantics: every valid field value saves immediately and independently, including backend/provider switches (the old no-key → no-model-list → never-persists deadlock is gone); an invalid draft skips only its own write; empty drafts mean "no write" except `polishModel`/`polishReasoningEffort`, which persist as explicit clears from the provider/model cascades. Enabling polishing saves at once; an incomplete provider/model pair leaves polishing dormant (revises PLAN D3; the Host polish call already falls back to the raw transcript).
- The first-load alert is split from loading: nothing shows while the initial fetch is in flight, and only after the single automatic retry also fails does an amber notice appear with neutral wording. The page-level footer now carries only the real save-failure line.
- No third-party form library is adopted (D-025); the timing/touched semantics follow Ant/Arco, GOV.UK, Fluent, VS Code, and the shipped dsh plugin card-form, per the research in `.agent/research/validation-timing-patterns.md` and `.agent/research/form-library-evaluation.md`.

## Verification evidence

Current local checks after the per-field settings model (D-024):

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed.
- `./node_modules/.bin/vitest run` — passed; 115 tests across 12 files (settings suite covers the new per-field cadence, touched gating, dormant polish pair, immediate backend switch, empty-draft skip, and over-long key).
- `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` — passed; Host ESM, Client factory bundle, CSS, declarations, and source maps generated.
- `git diff --cached --check` — passed after each commit.

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
- Cloud ASR is limited to the documented OpenAI-compatible multipart `{ file, model, language? }` and JSON `{ text }` contract; provider presets follow the D-023 registry rules (protocol, base URL, filter, key requirement).
- Emotion recognition/output and emotion UI remain intentionally deferred.
- The plugin does not bundle Whisper model weights.
- `transcribe()` reads backend/model/language when the Host RPC begins. Option A is a recording-start settings snapshot; Option B is locking recognition settings during capture/transcription. This requires a protocol decision.
- Settings validation is per-field and edit-scoped (D-024): only the edited field is validated, on the auto-save cadence; unconfigured-but-valid states show no prompts; the microphone's D-021 gray-out with tooltip is the readiness signal. An incomplete polishing pair leaves polishing dormant (revised D3); no third-party form library is adopted (D-025).
- Whisper crash-residue integrity is closed by the `.dsh-ears-done` completion marker (D-020): marker-less files are reported as not downloaded.
- The composer microphone grays out on positive unavailability signals only (D-021); cloud readiness (key + model configured) is folded into the cloud backend's availability signal per D-023.
- Cloud ASR API keys are plugin-owned `role('secret')` settings fields (D-023 reverses D-014 for the cloud ASR surface): write-only across the plugin wire, redacted reads, absent=keep/set/clear patch semantics. The key value itself never enters Git or the browser.
- Windows launcher probing is implemented but not yet smoke-tested on Windows; `medium` and larger models are documented as impractical on the CPU + 120-second path.
- No API keys, credentials, user audio, personal paths, private endpoints, or user data belong in Git.

## Remaining release gates

1. Keep the compatibility matrix current when dsh releases change.
2. npm publishing, release tags, and any public visibility change still require an explicit maintainer release decision.

## Final task record

- Completed: per-field validate-on-edit settings model (D-024) and the no-form-library decision (D-025) — validation recomputes on the auto-save cadence for the edited field only (touched gating), red only for invalid input and real failures, all "not yet configured" guidance prompts removed (fresh unconfigured page shows no prompts), backend/provider switches save immediately, an incomplete polishing pair leaves polishing dormant (revises PLAN D3), the first-load alert appears only after the single automatic retry fails with neutral wording, and the API key row surfaces its own over-length error. Research delivered in `.agent/research/validation-timing-patterns.md` (Ant/Arco/GOV.UK/Material/Fluent/VS Code + dsh platform card-form) and `.agent/research/form-library-evaluation.md` (RHF/TanStack/Formik/rc-field-form → do not adopt).
- Validation: `tsc` typecheck passed; `vitest` passed (121/121 tests across 12 files); `tsdown` & `tsc` builds passed; `git diff --cached --check` passed.
- Unfinished: D-018 (recording-settings snapshot versus locking) remains open; the Groq preset still needs a real rc.6 Web smoke (Host-side changes require a `dsh web` restart outside this session) and a live Groq `zh` transcription smoke with a real key; Windows smoke remains pending. Live symptom round 2 confirmed 2026-08-16: after the user restarted `dsh web` (fresh process, current code), selecting Groq and entering an API key still failed with the red "保存失败" footer — root cause was the settings registration `validate` still enforcing `isCloudConfigurationValid` (and a custom-endpoint completeness rule) on every write, deadlocking key vs model. Fixed in `5a8bb59` with regression tests. Follow-ups after the user's successful live Groq hookup: the cloud model list no longer refetches after a model selection (`5913152`), the API key input opts out of password managers via `data-bwignore`/`data-1p-ignore`/`data-lpignore` (`ced6443`), and the key row gained Enter-to-save plus a success-token flash (`03a6ef7`). All client-only: a browser refresh suffices.
- Blocked: none.
- Commits: `4d110b6 feat(client): validate each settings field on edit instead of a unified sweep`, `de7dbe7 fix(host): stop rejecting a dormant polishing pair at transcription time`, `5a8bb59 fix(host): drop cross-field completeness gates from settings validation`, `5913152 fix(client): stop refetching the cloud model list after a model selection`, `ced6443 fix(client): keep password managers away from the cloud API key input`, `03a6ef7 feat(client): add Enter-to-save and a success flash to the API key row` (+ docs batch recording D-024/D-025 and the research files).

## Earlier task record

- Completed: cloud ASR provider presets (D-023) — Host-side registry with the Groq preset (pinned endpoint, `whisper-*` filter, required inline key) and the Custom OpenAI-compatible provider (`whisper-1` default); `cloudAsrCredentialRef` replaced by the write-only `role('secret')` `cloudAsrApiKey` (redacted `getSettings` + configured boolean, absent=keep/set/clear patch semantics); `dshEars/listCloudProviderModels` RPC replicating the dsh-llm-pi-ai catalog pattern (15 s timeout, 4 MiB bounded parse, 30 s failure negative cache); grouped recognition selector (Local / Cloud providers with `MenuLabel`/`MenuSeparator`) , a write-only key row styled after the shipped SecretField (state rendered as the input placeholder, clear action kept), and a live Groq model row (empty until key, retry on failure, stale-model notice); preset endpoints stay pinned in the registry and are not displayed (the temporary read-only endpoint row and the `cloudAsrEndpointEffective` view field were removed as dead weight); cloud readiness folded into `listAsrBackends` for the D-021 gate.
- Validation: `tsc` typecheck passed; `vitest` passed (111/111 tests across 12 files, including new provider registry, listing-fetch, key-semantics, staging, and parity coverage); `tsdown` & `tsc` builds passed; `git diff --cached --check` passed after each commit.
- Unfinished: D-018 (recording-settings snapshot versus locking) remains open; the Groq preset needs a real rc.6 Web smoke (Host-side changes require a `dsh web` restart, and the client bundle needs a browser refresh — this agent session runs on the current `dsh web`, so the restart must happen outside it) and a live Groq `zh` transcription smoke with a real key (Groq docs do not explicitly list Chinese); Windows smoke remains pending.
- Blocked: none.
- Commits: `5d20866 docs: record Groq provider preset decision and announce file ownership`, `9ae277a feat(host): add cloud ASR provider registry with inline API keys`, `e4827f8 feat(host): list cloud provider models from the live catalog`, `f735a5c feat(client): add grouped provider selector and live cloud model rows`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
