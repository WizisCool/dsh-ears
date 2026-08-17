# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Current work: D-027 voice recognition surface is complete: a session-scoped standalone `conversation.input.dock` card sits immediately before dsh's queued-message dock, so it remains above pending messages and closest to the composer. It uses a real analyser waveform, native Task/Goal geometry, an authoritative stop action, delayed grid-row/opacity exit, a restrained animated listening dot with reduced-motion support, and the composer microphone remains visible throughout capture and processing. The settings page still uses D-026's staged Save/Discard model and D-024's per-field validation. D-019 is closed; D-018 remains open.
- Latest code commit: `4c2049d fix(client): animate recognition listening indicator`.
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

- Completed: explicit save model (D-026) replacing the auto-save — edits stage as drafts and commit through the footer's separator + Save/Discard buttons mirroring the shipped plugin card (Save blocked unless dirty, valid, and idle; an invalid draft blocks the whole save and keeps the drafts; Host rejection keeps the drafts with the red saveFailed line; Discard drops everything without confirmation; empty text clears a field on save, with the API key keeping absent=keep plus a staged clear action and an emptied recording limit resetting to the default; a mid-save edit survives the in-flight write). The 400 ms debounce, Enter-to-save, and the save-success flash are removed; validation stays per-field and immediate (D-024), the key input became store-driven, and the footer buttons/mark copy the platform card's tokens. Research from the earlier D-024/D-025 record lives in `.agent/research/`.
- Validation: `tsc` typecheck passed; `vitest` passed (121/121 tests across 12 files, settings suite rewritten for staged-draft semantics); `tsdown` & `tsc` builds passed; `git diff --cached --check` passed.
- Unfinished: D-018 (recording-settings snapshot versus locking) remains open; the Groq preset still needs a real rc.6 Web smoke (Host-side changes require a `dsh web` restart outside this session) and a live Groq `zh` transcription smoke with a real key; Windows smoke remains pending. Live symptom round 2 confirmed 2026-08-16: after the user restarted `dsh web` (fresh process, current code), selecting Groq and entering an API key still failed with the red "保存失败" footer — root cause was the settings registration `validate` still enforcing `isCloudConfigurationValid` (and a custom-endpoint completeness rule) on every write, deadlocking key vs model. Fixed in `5a8bb59` with regression tests. Follow-ups after the user's successful live Groq hookup: the cloud model list no longer refetches after a model selection (`5913152`), the API key input opts out of password managers via `data-bwignore`/`data-1p-ignore`/`data-lpignore` (`ced6443`), and the key row gained Enter-to-save plus a success-token flash (`03a6ef7`) — the last two were superseded by the D-026 refactor. All client-only: a browser refresh suffices.
- Blocked: none.
- Commits: `4d110b6 feat(client): validate each settings field on edit instead of a unified sweep`, `de7dbe7 fix(host): stop rejecting a dormant polishing pair at transcription time`, `5a8bb59 fix(host): drop cross-field completeness gates from settings validation`, `5913152 fix(client): stop refetching the cloud model list after a model selection`, `ced6443 fix(client): keep password managers away from the cloud API key input`, `03a6ef7 feat(client): add Enter-to-save and a success flash to the API key row`, `c69f2b5 feat(client): replace auto-save with the platform card save/discard model` (+ docs batch recording D-024/D-025/D-026 and the research files).

## Earlier task record

- Completed: cloud ASR provider presets (D-023) — Host-side registry with the Groq preset (pinned endpoint, `whisper-*` filter, required inline key) and the Custom OpenAI-compatible provider (`whisper-1` default); `cloudAsrCredentialRef` replaced by the write-only `role('secret')` `cloudAsrApiKey` (redacted `getSettings` + configured boolean, absent=keep/set/clear patch semantics); `dshEars/listCloudProviderModels` RPC replicating the dsh-llm-pi-ai catalog pattern (15 s timeout, 4 MiB bounded parse, 30 s failure negative cache); grouped recognition selector (Local / Cloud providers with `MenuLabel`/`MenuSeparator`) , a write-only key row styled after the shipped SecretField (state rendered as the input placeholder, clear action kept), and a live Groq model row (empty until key, retry on failure, stale-model notice); preset endpoints stay pinned in the registry and are not displayed (the temporary read-only endpoint row and the `cloudAsrEndpointEffective` view field were removed as dead weight); cloud readiness folded into `listAsrBackends` for the D-021 gate.
- Validation: `tsc` typecheck passed; `vitest` passed (111/111 tests across 12 files, including new provider registry, listing-fetch, key-semantics, staging, and parity coverage); `tsdown` & `tsc` builds passed; `git diff --cached --check` passed after each commit.
- Unfinished: D-018 (recording-settings snapshot versus locking) remains open; the Groq preset needs a real rc.6 Web smoke (Host-side changes require a `dsh web` restart, and the client bundle needs a browser refresh — this agent session runs on the current `dsh web`, so the restart must happen outside it) and a live Groq `zh` transcription smoke with a real key (Groq docs do not explicitly list Chinese); Windows smoke remains pending.
- Blocked: none.
- Commits: `5d20866 docs: record Groq provider preset decision and announce file ownership`, `9ae277a feat(host): add cloud ASR provider registry with inline API keys`, `e4827f8 feat(host): list cloud provider models from the live catalog`, `f735a5c feat(client): add grouped provider selector and live cloud model rows`.

## Repository onboarding record (2026-08-17)

- Completed: read the required project documents in repository order, reviewed the Hindsight component/convention/decision/initiative pages, traced the current Host/Client/Remote implementation and all 12 test suites, and inspected the installed dsh `0.1.0-rc.6` slot contracts used by the plugin. No business code changed. The authoritative current settings behavior is D-026 explicit staged drafts with Save/Discard; older auto-save wording in historical progress/changelog entries and pre-D-026 Hindsight summaries is superseded.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (121/121 tests across 12 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed (Host ESM, Client factory bundle, CSS, declarations, and source maps). The build emits only the known tsdown `external`/`noExternal` deprecation warnings.
- Runtime note: no `pnpm run dev:web`, `pnpm dev:watch`, or `tsdown --watch` process is active. Client changes therefore require rebuilding and refreshing the existing `http://127.0.0.1:3080`; Host, settings registration, or Remote changes additionally require restarting that existing `dsh web` process. Do not start a replacement server by default.
- Unfinished: D-018, the live rc.6 Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending; npm publishing, release tags, and public visibility remain gated. Historical documentation contains a few superseded references to the Plugins card and debounced auto-save, but no cleanup was included in this onboarding-only task.
- Blocked: none.
- Next: take one maintainer-selected atomic plugin task; verify every affected dsh API against the installed rc.6 declarations/implementation before editing, preserve the Host/browser credential boundary and Remote descriptor parity, then run the smallest relevant type/test/build/live-smoke set.
- Commit: no task commit created; onboarding was performed from baseline `6fab8e8 docs: record D-026 explicit save model and revise the settings docs`.

## Settings UI polish record (2026-08-17)

- Completed: fixed the configured API-key row shifting 52px left by keeping the key control in the same 240px lane as text inputs; moved Clear/Undo inside that lane; added an explicit staged-clear state (`保存后清除` / `Clears on save`) with an Undo action; removed the final-row + footer double separator; added consistent row control wrappers, selector ellipsis, invalid input borders/alert semantics, and narrow-layout stacking for controls and footer actions.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (121/121 tests across 12 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; `node /Users/junze/.agents/skills/impeccable/scripts/detect.mjs --json src/client/settings.tsx src/client/SettingsSection.module.css` returned `[]`; `git diff --check` passed. Live CDP smoke against `http://127.0.0.1:3080` verified API-key/text-input left-edge alignment, one bottom separator, staged clear/undo behavior, and no horizontal overflow at a 560px viewport.
- Unfinished: no Host or Remote behavior was changed; D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending. The existing Web process has no watcher, so users must refresh the current page after the rebuilt Client bundle is served.
- Blocked: none.
- Next: refresh the existing Web UI to inspect the rebuilt Client bundle in the user's visible session; no replacement server was started.
- Commit: `29ad35e fix(client): stabilize settings field controls`.

## Settings footer simplification record (2026-08-17)

- Completed: removed the redundant `未保存` / `Unsaved` footer label and kept the Save button text stable during in-flight writes, eliminating the fast text-width jump. Save/Discard still use the controller's internal saving gate to prevent duplicate or conflicting actions; the footer now renders status space only for a real save failure and keeps actions right-aligned at desktop and narrow widths. D-026 was revised to record the presentation change.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run tests/settings.test.ts` passed (24/24); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; the Impeccable detector returned `[]`; `git diff --check` passed. The existing `http://127.0.0.1:3080` Chrome tab was refreshed, and the served `/plugins/dsh-ears/client.js` returned HTTP 200 with neither unsaved nor saving-label strings.
- Unfinished: no controller, Host, or Remote semantics changed; the existing D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending.
- Blocked: none.
- Next: inspect the refreshed settings footer in the visible Web GUI; no replacement server was started and no watcher is running.
- Commit: `e9873bb fix(client): keep settings footer status stable`.

## Settings close-discard bug fix record (2026-08-17)

- Completed: fixed closing the settings panel (or navigating to another settings section) without Save so it discards all staged drafts. Root cause: `EarsSettingsController` is plugin-scoped and outlives the settings panel, while `EarsSettingsSection` previously had no unmount cleanup; reopening therefore rendered the retained in-memory draft and looked like an automatic save even though no Host write occurred. The section now invokes the existing Discard action on unmount, without changing explicit Save or Host persistence behavior.
- Validation: the deterministic rc.6 CDP repro first failed with persisted value `130`, draft `131`, reopened `131`, then passed after the fix with reopened `130`; the new `tests/settings-section-lifecycle.test.ts` regression passed; `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; the full `./node_modules/.bin/vitest run` passed (122/122 tests across 13 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; Impeccable returned `[]`; `git diff --check` passed.
- Unfinished: no Host or Remote behavior changed; D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending.
- Blocked: none.
- Next: refresh the existing visible Web GUI and verify close/reopen manually if desired; no replacement dsh server was started.
- Commit: `2f3686a fix(client): discard settings drafts on close`.

## Native recognition card record (D-027)

- Completed: added `VoiceInputSession`, analyser-backed `AudioLevelMonitor`, the standalone `VoiceRecognitionBar`, and shared lifecycle wiring for Web Speech and MediaRecorder. The card uses dsh Task/Goal geometry and typography, is registered at order 15 immediately before the native queue dock at order 20, fills the available waveform lane with a bounded rolling history, keeps the composer microphone mounted and actionable during capture, disables it only during final processing, and collapses with reduced-motion-aware opacity/translate/grid-row motion before unmounting. Updated the plan, decision record, README, changelog, and browser-face context.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (130/130 tests across 15 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; the final Impeccable detector over the changed UI targets returned `[]`; `git diff --check` passed. Clean isolated Chrome smoke against `http://127.0.0.1:3080` at 920px and 560px verified 36px card geometry, 12px radius, full waveform lane ending 10px before the stop action, persistent active microphone visibility, and a visible-but-disabled microphone during `transcribing`, with no runtime exceptions. Installed rc.6 inspection confirmed the native queue dock is order 20 and the plugin bundle is order 15.
- Unfinished: real microphone/vendor Web Speech and live Host ASR are environment-dependent and were not used in the deterministic smoke; the visible GUI needs a refresh because no `pnpm run dev:web` watcher is running. D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending.
- Blocked: none.
- Next: refresh the existing `http://127.0.0.1:3080` page to load the rebuilt client; do not push or publish without authorization.
- Commit: `2b3b8a4 feat(client): add native voice recognition dock`.

## Listening indicator refinement (D-027)

- Completed: added a restrained `listening-pulse` animation to the recognition card's left status dot while `starting` or `recording`; the animation changes only transform, opacity, and the local ring and is disabled for `prefers-reduced-motion: reduce`. Updated the D-027 decision and Unreleased changelog.
- Validation: `./node_modules/.bin/vitest run` passed (130/130 tests across 15 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; the final Impeccable detector returned `[]`; `git diff --check` passed. Clean Chrome smoke confirmed `listening-pulse` at `1.2s` with infinite iteration in normal motion and `animationName: none` / `0s` under reduced motion, with no runtime exceptions.
- Unfinished: the existing `http://127.0.0.1:3080` GUI needs a refresh to load the rebuilt client; no watcher is running. Real microphone/vendor Web Speech and live Host ASR remain environment-dependent; D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending.
- Blocked: none.
- Next: refresh the existing dsh page; do not push without explicit authorization.
- Commit: `4c2049d fix(client): animate recognition listening indicator`.

## Polishing route diagnosis and local recovery (2026-08-17)

- Completed: traced the live `dshEars/polish` RPC with the active `opencode-go/deepseek-v4-flash` route. The route returned the transcript unchanged when `polishReasoningEffort` was explicitly `off`, while the same route produced punctuation and wording cleanup when the effort was omitted. The active dsh-ears settings had polishing enabled and the route configured, so the Client/Host wiring was present; the no-op came from the route's explicit effort behavior.
- Recovery: cleared only the local `dsh-ears` `polishReasoningEffort` setting so it uses `Default`; provider, model, ASR settings, and credentials were not changed. A live post-change call returned a polished Chinese sentence.
- Validation: live RPC comparison against the active Host; `opencode-go/deepseek-v4-flash` with `off` returned the input unchanged, the same route with an empty effort returned `这个句子有点不通顺，请帮我整理一下。`; the route list and reasoning-effort metadata RPCs also succeeded. No credential values were copied into the repository or handoff.
- Unfinished: explicit reasoning-effort selections on this private OpenAI-compatible route still need an adapter/gateway contract if users want to retain `Off`/`High`/`Max` rather than use the model default.
- Blocked: none.
- Next: keep polishing on `Default` for this route; if explicit effort controls are required, add a provider-specific compatibility contract and live smoke before changing the plugin behavior.
- Commit: `d748edc docs: record polishing route diagnosis`.

## Voice shortcut research record (2026-08-17)

- Completed: researched in-page voice/dictation shortcuts, native OS defaults, global-hotkey voice apps, shortcut recorder UI precedents, `hotkeys-js`/Mousetrap, and single-/two-key web voice precedent. Wrote the primary/secondary/unverifiable-claim-separated report at `.agent/research/voice-dictation-shortcuts.md`, following the repository's existing `.agent/research/` convention. No code changed.
- Validation: inspected `AGENTS.md`, `PLAN.md`, `.agent/agent.md`, `.agent/context.md`, and existing research files; verified the report is a single structured English Markdown file with adjacent source URLs and explicit claim-quality labels.
- Unfinished: current vendor defaults and library release activity should be rechecked before becoming implementation requirements.
- Blocked: none.
- Next: use the report to choose an in-page shortcut/recorder design if the feature is scoped.
- Commit: no commit created.

## General tab and voice-input shortcut record (D-028)

- Completed: added the leading 通用 (General) tab as the settings page's default landing tab. It hosts the voice-input shortcut enable switch plus a Raycast-style recorder (default `Ctrl+Shift+Space` on all three platforms, Escape to cancel, Reset-to-default, hard rejection of modifier-only/letter/digit/bare-text-action chords, amber non-blocking warnings for browser/OS-reserved chords) and the recognition language and recording-limit rows moved from the Recognition tab. Implemented the hand-written shared `src/shortcut.ts` (no third-party dependency, per the D-025 precedent and the research in `.agent/research/voice-dictation-shortcuts.md`): layout-stable `KeyboardEvent.code` tokens, canonical `ctrl+shift+space` storage, strict modifier-equality matching, platform-aware display (⌃⌥⇧⌘ vs Ctrl/Alt/Shift/Win-Super). The composer microphone now listens for the chord: idle=start, recording=stop and transcribe, transcribing/polishing=ignored, IME composition and key auto-repeat never trigger it, events inside `[role="dialog"]` and hidden views are ignored, and a gated microphone turns the press into a focus of the grayed button so its existing bilingual tooltip explains why. New `voiceShortcutEnabled`/`voiceShortcut` settings flow through the schemastery schema, Remote view/patch schemas, controller staging/validation (an invalid chord blocks the whole save per D-026, reset restores the default), and Host field-level validation. Docs: D-028 ADR, PLAN (status, decisions table, settings, package shape, risks), README settings, CHANGELOG Unreleased, context.md; the research report `.agent/research/voice-dictation-shortcuts.md` is committed as docs.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (153/153 tests across 16 files, incl. new `tests/shortcut.test.ts` and voice-shortcut coverage in settings/config/remote-contract/lifecycle suites); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed; the Impeccable detector returned `[]` on the changed UI targets; `git diff --cached --check` passed after each commit.
- Unfinished: live browser smoke of the General tab recorder and the hotkey on the running dsh web (client bundle rebuilt; the existing `http://127.0.0.1:3080` page needs a refresh; no watcher is running); real microphone/vendor Web Speech and live Host ASR remain environment-dependent; D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending.
- Follow-up fix (`8f9ef44`): the recorder previously ignored modifier-key keydowns silently, so pressing only Shift/Ctrl/etc. gave no feedback and modifier-only releases were invisible. It now shows a live pressed-modifier label (`Ctrl+Shift+…`) inside the capture button, reports the inline "modifier-only" error when every modifier is released without a key, and still completes on the first non-modifier key with Escape resetting.
- Follow-up revision (user request): modifier+character chords are now accepted — letters/digits with Ctrl/Shift/Meta record and save as valid shortcuts; the reserved-chord set is generated (`ctrl+<letter>`, `meta+<letter>`, `ctrl+<digit>`, `meta+<digit>`, explicit `ctrl+shift+`/`shift+meta+` sets) and warns amber instead of blocking. Bare letters/digits/text keys and Alt/Option+letter chords (macOS Option types special characters) remain rejected. Separately, the hotkey now **outranks text input**: the composer listener moved to the window capture phase and calls `preventDefault`/`stopPropagation` on a matched chord, so pressing the shortcut inside the composer/any text field wins over the editor (which bubbles and may swallow the event); non-matching/disabled/gated chords are untouched. Validation: tsc passed; vitest 153/153; tsdown + tsc build passed; Impeccable `[]`; `git diff --cached --check` passed.
- UI alignment fix (user request): the shortcut recorder control was wrapped in the 240px API-key `keyControl` lane with no `justify-content`, so the content-width pill sat at the lane's left while other rows right-align, and the Reset-to-default action floated at the far edge. The pill now renders directly in the right-aligned `rowControl` exactly like the shipped selectors (content-width, `flex-end`), with the reset action as an adjacent sibling button (`shortcutControl`/`shortcutAction` styles); the narrow-width media query stacks them (pill full-width, reset below). Validation: tsc passed; vitest 153/153; tsdown + tsc build passed; Impeccable `[]`; `git diff --cached --check` passed.
- Blocked: none.
- Next: refresh the existing dsh page to verify the General tab, recorder feedback, modifier+letter chords, capture-priority hotkey behavior, and the aligned recorder row in the visible GUI; do not push or publish without authorization.
- Commit: `665085e feat(client): add voice-input shortcut recorder on a new General tab`; `d19143d docs: record General tab and voice-input shortcut decision D-028`; `3cd65d8 fix(client): guard shortcut fields against pre-D-028 host views`; `8f9ef44 fix(client): show live modifier feedback in the shortcut recorder`; `463d262 feat(client): allow modifier-letter chords and prioritize hotkey over input`; `ebf1e4c docs: record modifier-letter chords and hotkey-over-input priority`.

## rc.7 upgrade-readiness pin fix (2026-08-17)

- Completed: audited the deepseek-harness rc.6→rc.7 diff (`fb82698709..99f6f02fec`, 106 commits) against every `@deepseek-ai/*` import dsh-ears makes. The only functional changes touch `dsh-client-ui-settings-plugins` (`settings.plugin.item` list→keyed cards + tab-store), `dsh-client-ui-conversation` (Safari soft-wrap reflow, internal), `dsh-llm` (ReplayEnvelope type hardening), and `dsh-client-ui-primitives` (new `useDismissOnOutsidePointer` export) — none affect the APIs/slots dsh-ears consumes (`settings.section` stays `list`; `conversation.input.right`/`dock`; `ctx.llm` calls; ui-primitives symbols). All other depended packages bumped version only; vendored `@deepseek-ai/cordis` stays `4.0.1`. Verified `^0.1.0-rc.6` peer ranges accept `0.1.0-rc.7`. Fixed the one rc.7-host friction point: `@deepseek-ai/dsh-credentials` was the only exact-pinned dsh peer (`0.1.0-rc.6`) while `dsh-api-remotes` peers on it as `^0.1.0-rc.6`; relaxed to `^0.1.0-rc.6`. devDependencies stay exact rc.6 (build baseline); pnpm-lock's `.` importer records only dependencies/devDependencies, so no lockfile change was required.
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (153/153 tests across 16 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed (13 files, 249.22 kB, no churn); `git diff --cached --check` passed.
- Unfinished: the actual rc.7 toolchain move is deferred (baseline stays rc.6). When the environment moves to rc.7: bump exact devDependencies to `0.1.0-rc.7`, run check/test/build, then smoke the plugin on an rc.7 host; peer ranges need no further change. A card migration to `settings.plugin.item` was explicitly declined (feature settings stay on the `settings.section` General page per the official category split).
- Blocked: none.
- Next: metadata-only readiness change — no code or runtime behavior changed; no rebuild or GUI refresh needed.
- Commit: `1749afc chore(deps): relax the dsh-credentials peer range to accept rc.7 hosts`.

## Custom polish prompt record (D-029, 2026-08-18)

- Completed: added a customizable polish system prompt on the dsh-ear Polishing tab and replaced the built-in default polish prompt with a multilingual ASR-editing contract.
  - Host (`src/polish/prompts.ts`): `POLISH_SYSTEM_PROMPT` is now the multilingual contract (language/term/code preservation, spoken self-corrections, enumeration-to-list, few-shot examples); new `POLISH_OUTPUT_GUARD` (return only the polished text; treat the transcript as data) and `resolvePolishSystemPrompt(storedPrompt)` (empty → default; non-empty → trimmed custom prompt + guard). `src/polish/service.ts` `polish()` now reads `settings.polishPrompt` and resolves it through the selector.
  - Settings (`src/config.ts`, `src/config-schema.ts`, `src/remote-contract.ts`): new `EarsSettings.polishPrompt` (default `''`), `MAX_POLISH_PROMPT_LENGTH = 4000`, trim-based host validation, schemastery field (Host-only), strict client view/patch zod schemas.
  - Client (`src/client/settings-controller.ts`, `src/client/settings.tsx`, `SettingsSection.module.css`): `polishPrompt` staged like other string fields (empty draft = explicit clear → `''`), over-length draft invalid and blocks the whole save (D-024/D-026); the Polishing tab (gated on the toggle) renders a multiline textarea row with a live `n/4000` counter, Reset-to-default (stages an empty draft), and a read-only 查看默认 / View default expand showing the shipped prompt; new bilingual locale keys.
  - Tests: config.test.ts (default + trim-based 4000 cap), polish.test.ts (resolver: empty→default / custom→trimmed+guard; service captures `stream.system` for default vs custom), remote-contract.test.ts (view literal + explicit-clear patch), settings.test.ts (staging/save/clear/over-length), settings-section-lifecycle.test.ts (typed card-state literal).
- Validation: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` passed; `./node_modules/.bin/vitest run` passed (162/162 tests across 16 files); `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` passed (13 files; `lib/` is gitignored, no churn); Impeccable detector returned `[]` on `settings.tsx` + `SettingsSection.module.css`; `git diff --cached --check` passed after each commit.
- Unfinished: a live browser smoke of the new prompt row (client bundle rebuild + `http://127.0.0.1:3080` refresh needed; no watcher running); the new default prompt changed polish output behavior for all existing users (multilingual instead of Chinese-targeted) — verify with a real live polish run; D-018, live Groq/Web and Groq `zh` transcription smokes, and Windows smoke remain pending; per-route custom prompts remain deferred (D-029).
- Blocked: none.
- Next: rebuild/refresh the running Web UI to verify the prompt row visually; optionally run a live polish with the new default and with a custom prompt to confirm system-prompt selection end to end.
- Commits: `27eaa7f feat(host): add customizable polish system prompt with a multilingual default`, `2fd8047 feat(client): add the polish prompt row with counter, reset, and view-default`, `a0f4c82 docs: record custom polish prompt decision and updated default prompt`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
