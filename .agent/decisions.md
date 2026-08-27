# Architecture Decision Records

Decisions are append-only. Read this status index first. A later ADR that supersedes an earlier one is the live rule; the original body is history and must not be applied as current product law.

## Status index

| ID | Topic | Live status |
| --- | --- | --- |
| D-001 | Project identity | Accepted |
| D-002 | Interaction contract | Accepted |
| D-003 | First ASR milestone | Historical: M2 was Web Speech only. Whisper and cloud ASR later shipped. |
| D-004 | LLM ownership | Accepted |
| D-005 | Host/Client packaging | Accepted |
| D-006 | Compatibility | Extended by D-030, D-034, and D-035. Current: `rc.6` through `0.1.1-rc.2`. |
| D-007 | Deferred scope | Partially superseded. Whisper and cloud ASR shipped. Emotion UI remains deferred (D-015). |
| D-008 | Language and public quality | Accepted. Public landing page is Chinese-first. |
| D-009 | Release safety | Accepted. First public release authorized 2026-08-19. Later push/publish/visibility still need explicit approval. |
| D-010 | Codex-style microphone | Accepted; revised by D-027. |
| D-011 | Plugins-page card | **Superseded by D-017.** Live surface is `settings.section`. |
| D-012 | Theme and composer order | Accepted |
| D-013 | Remote invocation scope | Accepted |
| D-014 | Final ASR backends | Architecture accepted. Cloud key model **reversed by D-023 / D-032** (per-provider `role('secret')`, not dsh credential-references). |
| D-015 | Emotion deferred | Accepted |
| D-016 | License and repository | Accepted. MIT; public GitHub `WizisCool/dsh-ears`; first npm is `0.1.0`. |
| D-017 | Dedicated settings page | Accepted (live) |
| D-018 | Recording-settings snapshot | **Open** |
| D-019 | Whisper cache integrity | Closed by D-020 |
| D-020 | Whisper robustness | Partially superseded by D-039; integrity and lifecycle rules remain live, Python/CLI assumptions do not |
| D-021 | Microphone availability gating | Accepted |
| D-022 | Click-through to settings | Rejected |
| D-023 | Cloud provider presets + secret keys | Accepted; extended by D-032 |
| D-024 | Per-field validate-on-edit | Accepted |
| D-025 | No third-party form library | Accepted |
| D-026 | Save/Discard footer | **Superseded by D-031.** Live save model is per-field auto-save. |
| D-027 | Recognition dock | Accepted |
| D-028 | Voice-input shortcut | Accepted. Default `Ctrl+Shift+Space`. **Modifier-only chords are valid.** |
| D-029 | Custom polish prompt | Accepted |
| D-030 | Dual rc.6 / rc.7 | Accepted; extended by D-034 and D-035. |
| D-031 | Auto-save uncarded settings | Accepted (live save model) |
| D-032 | Bailian + per-provider keys | Accepted |
| D-033 | About tab | Accepted. First public release authorized 2026-08-19. |
| D-034 | Triple host compatibility for rc.6, rc.7, and rc.8 | Accepted; peer floor superseded by D-035 |
| D-035 | dsh 0.1.1 compatibility and open peers | Accepted (live compatibility and peer policy) |
| D-036 | Wire-safe optional fields on strict RPC results | Accepted |
| D-037 | OS-aware Local Whisper setup guidance | **Fully superseded by D-039.** |
| D-038 | User-facing copy style | Accepted; revises D-024's punctuation rule |
| D-039 | Native whisper.node runtime and fixed configuration slots | Accepted |
| D-040 | Tencent Cloud product selector | Superseded by D-041 |
| D-041 | Tencent Cloud standard and realtime recognition | Accepted |
| D-042 | Per-provider recognition language | Accepted. Supersedes the D-028 recognition-language row placement and the D-032 shared-row reference. |
| D-043 | Deepgram cloud ASR and dual recording-file/realtime services | Accepted |
| D-044 | Xiaomi MiMo cloud ASR with API and Token Plan access | Accepted |

## D-001 — Project identity

- Status: accepted
- Decision: The project name is `dsh-ears`.
- Rationale: It matches the “give text-only DeepSeek ears” positioning without using the Typeless trademark.

## D-002 — Interaction contract

- Status: accepted
- Decision: Click to start; stream recognition into an editable draft; stop; let the user send manually.
- Prohibited: automatic send or treating an unconfirmed transcript as a sent message.

## D-003 — First ASR milestone

- Status: accepted
- Decision: M2 implements the browser Web Speech API only.
- Failure behavior: preserve the recognized draft and ask the user to record again.

## D-004 — LLM ownership

- Status: accepted
- Decision: Polishing uses any provider/model route already configured in dsh and stores `{ provider, model }`.
- Prohibited: plugin-owned LLM `base_url`, `api_key`, provider, model input, or browser-side LLM request.

## D-005 — Host/Client packaging

- Status: accepted
- Decision: The package exposes Host `.` and browser `./client` entries and declares `dsh.bundle.patch` plus `dsh.client`.
- Development HMR overlay and published bundle patch remain separate.

## D-006 — Compatibility

- Status: accepted; extended by D-030. Do not read the original decision as live — current compatibility is rc.6 and rc.7.
- Decision (original): The first release is validated only against dsh `0.1.0-rc.6`.
- Live rule: see D-030.

## D-007 — Deferred scope

- Status: partially superseded. Local Whisper and cloud ASR shipped. Emotion UI remains deferred — see D-015.
- Decision (original): Local Whisper, cloud ASR, and emotion UI are deferred. An emotion field may be reserved but cannot be a first-release dependency.
- Live rule: Whisper and cloud ASR are first-release backends. Emotion is still out of scope.

## D-008 — Language and public quality

- Status: accepted
- Decision: Source, code comments, repository docs, context docs, issue-ready text, and commit messages are English-first and follow official dsh repository conventions.
- Runtime prompts may use Chinese when required by the product behavior.
- Revision (2026-08-18): the public landing page is Chinese-first (`README.md`) with an English sibling (`README.en.md`). Source, comments, context, issues, and commits stay English-first.

## D-009 — Release safety

- Status: accepted
- Decision: No push, public-repository conversion, npm publish, or legal license selection is automatic. Each requires an explicit release decision.
- Revision (2026-08-19): the maintainer authorized the first public release (`0.1.0`, public GitHub, `v0.1.0` tag, GitHub Release, npm publish). Later push, publish, tag, and visibility changes still need an explicit decision.

## D-010 — Codex-style microphone control

- Status: accepted
- Decision: The microphone control follows the provided Codex composer reference for placement, density, visual state, and interaction: right-side circular toolbar affordance, microphone icon at rest, stop square while recording, live draft updates, and manual send only.
- Constraint: Reuse dsh primitives and tokens where possible; do not copy Codex source code, private assets, or implementation details.

## D-011 — Native plugin configuration surface

- Status: superseded by D-017. Do not register settings on `settings.plugin.item`.
- Decision (original): Register `dsh-ears` configuration in dsh's native Plugins settings page through the `settings.plugin.item` list slot.
- Prohibited: a separate Voice settings tab, standalone Voice settings section, or plugin-owned settings page outside the native Plugins surface.
- Rationale: dsh's Plugins page is the canonical host-plugin configuration surface and keeps plugin settings discoverable and visually consistent.

## D-012 — rc.6 composer theme and ordering integration

- Status: accepted
- Decision: Keep the microphone contribution in `conversation.input.right`, and use public dsh slot topology selectors to make the visual order model selector → microphone → send button in rc.6.
- Decision: Use dsh semantic CSS tokens for idle, hover, recording, error, and focus states so the control follows the active light/dark theme.
- Prohibited: generated internal class selectors, copied Codex palette values, or a separate theme override that bypasses dsh tokens.
- Rationale: rc.6 renders the right-side list slot before the named model seat, while slot wrappers are `display: contents`; the public `data-slot` attributes are the stable integration seam.

## D-013 — Cordis Remote invocation scope

- Status: accepted
- Decision: Mount the plugin's Typert contribution first, then create the browser contributions inside a Cordis child scope injecting `remote.dshEars`. Pass the concrete `dshEars` namespace to asynchronous controllers and React event handlers.
- Rationale: rc.6 resolves dotted Remote namespaces through the active Cordis injection map. Retaining an unscoped `ctx.remote` value and reading `remote.dshEars` later fails outside the original injection scope.

## D-014 — Host-side final ASR backends

- Status: accepted for Host/MediaRecorder architecture; cloud credential model reversed by D-023 and D-032.
- Decision: Keep Web Speech as the live browser backend, and use browser `MediaRecorder` plus one bounded final-result Host RPC for local Whisper and OpenAI-compatible cloud ASR.
- Decision (original, reversed for keys): Local Whisper runs through a non-shell `spawn` call and private temporary files. Cloud credentials are dsh credential references resolved per operation; the plugin never stores or returns secret values.
- Live key rule: see D-023 and D-032. Each cloud provider stores a write-only `role('secret')` field. The plugin does not use dsh credential-references for cloud ASR.
- Prohibited: bundling model weights, browser-side API keys, invisible backend switching during a recording, or an unbounded generic audio stream in the first release.
- Rationale: This keeps browser UX responsive while preserving Host ownership of processes, credentials, endpoint access, cancellation, and cleanup.

## D-015 — Emotion scope remains deferred

- Status: accepted
- Decision: Do not expose emotion recognition, labels, settings, or UI in the first release.
- Rationale: Emotion output requires an independent model/evaluation contract and risks presenting an uncertain inference as a fact. It is not required for the core voice-to-draft workflow.

## D-016 — License and repository strategy

- Status: accepted
- Decision: License the project under MIT and release the repository to the private GitHub project `WizisCool/dsh-ears` (2026-08-15).
- Decision: npm publishing, release tags, and any public visibility change remain gated behind an explicit maintainer release decision.
- Revision (2026-08-19): the repository is public at `WizisCool/dsh-ears`. The first published npm version is `dsh-ears@0.1.0`.
- Rationale: The local M6 release-readiness audit passed; MIT is a common permissive license for community packages. Keeping the repository private preserved the D-009 release safety boundary until the maintainer approved a public release.

## D-017 — Dedicated settings page supersedes the Plugins-page card

- Status: accepted (supersedes D-011)
- Decision: Register `dsh-ears` configuration as its own `settings.section` page (section id `dsh-ears`, nav order 16 — between Plugins and Agent presets) instead of the `settings.plugin.item` card inside the Plugins page. An earlier card title used the nickname `dsh-ear`; the live id, default nav label, and display-name default are `dsh-ears`.
- Decision: Style the page with the same semantic tokens, card geometry, and field patterns as the shipped Models/General pages so the surface reads as a native settings page.
- Rationale: The Plugins-page card is dense and cannot grow; a dedicated page provides room for clearer grouped configuration (Recognition, Polishing) and future options while staying inside dsh's canonical settings window.

## D-018 — Final ASR settings snapshot remains open

- Status: open; no first-release protocol change approved.
- Current behavior: `dshEars/transcribe` reads the current backend, model, and language settings when the Host RPC begins. The browser does not promise invisible backend switching during one recording.
- Option A: carry the recording-start backend/model/language snapshot in the final-audio RPC so a settings change cannot alter an in-flight recording.
- Option B: lock recognition settings while capture or transcription is active.
- Rationale for deferral: both options change the first-release wire or UI semantics and need an explicit compatibility decision.
- Revision (2026-08-26): "language" throughout this decision means the per-provider recognition-language fields introduced by D-042; the original single global recognition-language setting is removed. The snapshot-or-lock gate itself remains open.

## D-019 — Whisper cache integrity after Host crash

- Status: accepted; resolved by D-020 (completion sidecar).
- Current behavior: normal failure and cancellation paths remove incomplete files, while the startup state check trusts the installed library's cache path and file stat.
- Option A: verify the model URL SHA-256 on demand, with a cache keyed by path/size/mtime to avoid hashing on every poll.
- Option B: write and require a completion sidecar/marker for downloads performed by dsh-ears.
- Rationale for deferral: checksum cost for large models and treatment of pre-existing Whisper caches need maintainer agreement.

## D-020 — Whisper robustness hardening

- Status: accepted (closes D-019).
- Decision: harden the Local Whisper path inside the existing architecture:
  - The whisper model manager is a per-service, injectable, disposable instance wired into the Cordis scope; dispose kills an active download, removes its partial file, and drops cached discoveries so plugin reloads leave no orphan processes.
  - Interpreter and model-table discovery failures are negative-cached for 30 seconds so a broken environment does not re-spawn expensive `import whisper` probes on every retry.
  - A model file is only reported as downloaded when a `.dsh-ears-done` completion marker written by dsh-ears sits next to it; marker-less files are reported as not downloaded with a re-download hint, and orphaned markers are removed. This resolves D-019: a partial file from a killed download can never be reported as complete.
  - `transcribe()` gates Local Whisper on CLI availability plus a downloaded, marked model before spawning the CLI, instead of letting the CLI auto-download weights inside the transcription timeout.
  - Failed transcriptions carry the whisper stderr tail (bounded to 800 characters) instead of a bare exit code.
  - Windows probing resolves `python.exe`/`py.exe` launchers with PATHEXT expansion; Windows remains documented as not yet smoke-tested.
  - `medium` and larger models are documented as impractical on the CPU + 120-second transcription path (honest UI hint and README note, no timeout change).
  - The model lifecycle is covered by fake-python integration tests (download/cancel/delete, progress parsing, marker semantics, dispose cleanup, negative caches).
- Rationale: the review found engineering-hygiene gaps (zero lifecycle tests, orphan processes, silent mid-recording downloads) rather than a reason to replace the library download. The sidecar marker closes the D-019 residual risk without per-poll checksum cost; pre-existing marker-less cache files are conservatively treated as not downloaded, which is cheap to repair with a re-download.

## D-021 — Composer microphone availability gating

- Status: accepted.
- Decision: the composer microphone disables itself (gray `aria-disabled` state with a bilingual tooltip) when the configured backend provably cannot transcribe: the Host reports the selected backend unavailable, the selected Whisper model is still downloading, or the model file with its completion marker is missing.
- Decision: availability is gated on positive signals only. Loading, failed, and unknown states keep the button enabled, and `starting`/`recording`/`transcribing`/`polishing` states are never gated so the stop affordance stays reachable.
- Rationale: a definitely broken configuration should not invite a click that is guaranteed to fail; graying on positive Host signals avoids false negatives while keeping the stop control authoritative during an active flow.

## D-022 — Composer microphone click-through to settings

- Status: rejected (2026-08-16); no implementation.
- Proposal: let the grayed microphone remain clickable and jump to the `dsh-ear` settings section.
- Finding: dsh rc.6 exposes no public endpoint for opening the settings panel at a section. The shell (`dsh-client-ui-settings-general`) owns panel open state and the active section id as private React state inside `SettingsRoot`; `openSection(id)` is passed only to `settings.onboarding` steps, and no service, event, or window bridge exports it. Reaching it would require fragile DOM automation of the shell's private trigger/nav chrome.
- Rationale: the implementation effort (private-state reach-around or DOM hacks, both against the project's stable-seam policy) outweighs the design value; the gray tooltip already points users to the settings page.

## D-023 — Cloud ASR provider presets with inline `role('secret')` keys

- Status: accepted (2026-08-16); reverses D-014 for the cloud ASR surface only.
- Decision: cloud ASR settings store inline API keys through schemastery `role('secret')` fields, following the shipped `dsh-web-search-deepseek` precedent. Extended by D-032: Groq, custom, and Bailian each have their own key field. Keys are write-only across the plugin wire; `updateSettings` treats each key as absent=keep / non-empty=set / empty=clear. The `cloudAsrCredentialRef` field is removed (package unreleased; no migration burden).
- Decision: cloud ASR gains a provider dimension (`cloudAsrProvider: 'groq' | 'bailian' | 'custom'`, default `groq`) backed by a Host-side static registry (`src/asr/providers.ts`) whose entries declare id, bilingual name, protocol, optional base URL, model filter, optional static models, default model, and endpoint editability. Groq is the first preset; Bailian uses the DashScope adapter (D-032); the `custom` entry keeps the free-form endpoint/model behavior with the `whisper-1` default. Future providers plug in as registry entries when OpenAI-compatible, or entries plus adapters when their protocol differs.
- Decision: preset model selectors are populated by the new `dshEars/listCloudProviderModels` RPC. The Host fetches `GET {baseUrl}/models` with the stored key (replicating the `dsh-llm-pi-ai` pattern: bearer header, bounded parse, registry-declared filter, 15-second timeout, 30-second failure negative cache). No key means an empty list; a failed fetch keeps the persisted selection with a retry affordance; transcription does not validate against the fetched list.
- Decision: `listAsrBackends` folds preset readiness into the `cloud-openai` availability signal — a provider that requires a key reports unavailable until the key and model are configured — extending D-021 positive-signal gating to cloud readiness.
- Decision: the Recognition backend selector becomes one grouped menu (本地: Web Speech, Local Whisper / 云提供商: preset entries, Custom OpenAI-compatible) rendered with the primitives `MenuLabel`/`MenuSeparator`; menu entries map onto the existing `asrBackend` + `cloudAsrProvider` fields without new wire semantics.
- Rationale: the design review settled that Groq's transcription endpoint is the existing OpenAI-compatible contract, so a preset is data, not a new backend; the shipped `role('secret')` mechanism is the dsh-native way to store plugin-owned keys without echoing them across the wire; a Host-side registry keeps future providers a data addition while strict validation stays intact.

## D-024 — Per-field validate-on-edit settings model

- Status: accepted (2026-08-16); revises the D-023-era staging note and PLAN D3's pair rule.
- Decision: the settings page validates **only the field being edited**, at the same 400 ms cadence as the auto-save debounce. A field shows a red error (plus `aria-invalid` and `role="alert"` where applicable) only when the user has edited it and its own draft fails its own format rule — an untouched field is never marked invalid, and an unconfigured-but-valid state is never an error. There is no unified cross-field validity sweep and no page-level "some fields are invalid" summary (research: Ant/Arco per-field `validateTrigger`, GOV.UK "do not validate before the user has finished", VS Code per-field squiggles, and the shipped dsh plugin card-form, which validates one field's own parse and lets an invalid field block only its own write).
- Decision: prompts appear only for real problems. Red is reserved for genuinely invalid user input (illegal endpoint URL, over-long API key, empty language, out-of-range recording limit) and real failures (save failure, model-list fetch failure, Whisper operation failures, a stale cloud model). "Not yet configured" guidance prompts (the backend-unavailable line, the no-key model hint, amber incomplete hints) are removed; the composer microphone's D-021 gray-out with tooltip remains the readiness signal. The first-load alert is split from loading: nothing shows while the initial fetch is in flight, and only after the single automatic retry also fails does an amber notice appear ("无法读取插件配置，请稍后重试。"/"Could not load the plugin configuration. Please try again later.").
- Decision: every valid field value saves immediately and independently; an invalid draft skips only its own write. Selecting a cloud backend/provider now persists at once (the previous deadlock — no key → no live model list → no model → the switch never persisted — is gone). Empty drafts mean "no write" for key/endpoint/model, except `polishModel`/`polishReasoningEffort`, whose empty drafts persist as explicit clears from the provider/model cascades.
- Decision: PLAN D3's pair rule is revised — enabling polishing saves immediately; an incomplete provider/model pair leaves polishing **dormant** (the Host `dshEars/polish` call returns the raw transcript for an empty pair, and the transcription-time settings validation no longer requires the pair), and it activates once a complete pair is selected. No cross-field blocking remains.
- Correction (2026-08-16, `5a8bb59`): the first D-024 implementation left one Host-side cross-field gate in place — the settings registration `validate` still ran `isCloudConfigurationValid` plus a custom-endpoint completeness rule on **every** write. Live symptom: after selecting Groq and entering an API key, every save was rejected with "Cloud ASR configuration is incomplete" while the model selector stayed disabled until the key saved (a hard deadlock: the key needs a model, the model needs the key). The registration validate now enforces field-level integrity only; runtime readiness remains guarded by `transcribe()`'s own model/key/endpoint checks and the D-021 microphone gating.
- Rationale: a fresh user exploring Groq, Local Whisper, or polishing must see setup guidance-free, quiet defaults; red text signals something the user did wrong, and a configuration the user never made is not a fault. The per-field model matches both the platform's own plugin card-form and the industry research, and removes the cross-field staging machinery entirely.

## D-025 — No third-party form library

- Status: accepted (2026-08-16).
- Decision: keep the hand-written settings controller; do not adopt react-hook-form, TanStack Form, Formik, or rc-field-form.
- Rationale: the controller's complexity lives in exactly the parts form libraries do not target — a `SnapshotStore` shared with the composer microphone, a 400 ms-debounced per-field `updateSettings` RPC with no submit button, per-field generation-guarded async responses (Whisper state/mutations, cloud model listing, reasoning efforts) — and every library owns its own internal field-state copy, which would add a second source of truth and a bridging layer instead of removing the store logic. The per-field validation timing semantics (onChange/onBlur/touched, debounced re-validation) are adopted from the libraries' documented models without adopting the libraries. Evidence: `.agent/research/form-library-evaluation.md`.

## D-026 — Explicit save via the platform card footer buttons

- Status: superseded by D-031 (2026-08-18); the presentation rules it preserved (per-field edit-scoped validation, no "not yet configured" prompts, red only for real problems) remain.
- Decision: replace the 400 ms debounced auto-save with the shipped plugin card's staged-draft model. Edits stage as drafts; the footer gains the card's separator plus always-visible Save and Discard buttons. Save is blocked unless the page is dirty, has no invalid draft, and is idle; Discard drops every draft and a failed state without confirmation. An invalid draft blocks the whole save and keeps the drafts; a Host-rejected write keeps the drafts with the red saveFailed line. Empty text clears a field on save (endpoint/model/polish fields write `''`); the API key keeps absent=keep semantics with a staged clear action (typing a new key cancels the pending clear), and an emptied recording limit resets to the default. A mid-save edit survives the in-flight write and stays dirty.
- Revision (2026-08-17): the footer does not show a redundant `未保存` / `Unsaved` label, and the Save button keeps its stable `保存` / `Save` text while a write is in flight. The internal saving gate remains in place to prevent duplicate submissions and conflicting discard actions without introducing a fast text-width jump. Closing the settings panel or navigating to another settings section unmounts this section and discards every uncommitted draft, matching an explicit close without Save to the Discard action.
- Decision: validation stays per-field and immediate (D-024); the composer microphone and D-021 gating keep reading the persisted settings — drafts never affect recording until saved.
- Rationale: the auto-save plus cross-field staging machinery produced the save-failure bug chain; the platform card's staged-draft state machine is the simplest predictable model and matches the native Plugins card behavior. D-017's dedicated page layout is unchanged.

## D-027 — Native recognition dock and live waveform

- Status: accepted (2026-08-18).
- Decision: expose the active voice session through a session-scoped `conversation.input.dock` entry above the composer. The dock is a standalone 36px card with the same width, radius, border, surface, spacing, and typography conventions as dsh's shipped Task and Goal bars; it does not visually attach to the input card. Typography uses the native dsh taskbar convention: the shared `--dsw-font-xs-13` face, 13px, 500 weight, and 24px line height.
- Decision: the dock shows only recognition status, a stop action, and a rolling waveform. It never duplicates live transcript text. The waveform is populated from a browser `AudioContext`/`AnalyserNode` reading the active microphone stream; samples append from left to right, fill the available waveform lane with fixed slots, and retain a bounded rolling history. If waveform analysis is unavailable, recognition continues without audio visualization.
- Decision: the composer microphone remains mounted throughout recognition to preserve toolbar continuity. During capture it stays highlighted and delegates to the same stop request as the card; during final transcription/polishing it remains visible but disabled. The card is ordered immediately before the native queue dock so active recognition stays above pending messages and closest to the composer. Processing states show the native loading icon. The card stop square stays enabled only while recording; once it would be disabled (`transcribing` / `polishing`), it becomes the same `IconTrashOutline16` trash used on in-progress Goal rows so the user can discard that voice task. Discard aborts the in-flight Host transcribe/polish, ignores a late result, and returns to idle through the same exit animation as a normal completion. The active listening indicator uses a restrained breathing pulse to make capture state legible; the pulse is disabled under reduced-motion preferences. Exit uses a short opacity/translate/grid-row transition, with reduced-motion support and a delayed unmount so successful completion does not abruptly remove the card or jump the composer.
- Rationale: dsh's `conversation.input.dock` is the stable public seam explicitly intended for full-width rows above the composer. Matching the shipped Task/Goal card geometry rather than borrowing private class names gives the plugin a clearly native standalone surface while preserving the host's semantic tokens and lifecycle.

## D-028 — General settings tab with an in-page voice-input shortcut

- Status: accepted (2026-08-17).
- Decision: add a **通用 (General)** tab before the existing Recognition and Polishing tabs in the `dsh-ear` settings page; it becomes the default landing tab. It hosts the configurable **voice-input keyboard shortcut** (an enable switch plus a Raycast-style recorder) and absorbs the Recognition tab's language and recording-limit rows, which are general recognition parameters. Online research (`.agent/research/voice-dictation-shortcuts.md`, primary sources: MDN, W3C, Apple, Microsoft, Google, Electron, Raycast, Wispr Flow) confirmed the design constraints.
- Decision (shortcut scope): the shortcut is **in-page only** — it starts/stops voice input while the dsh page is focused and the chat composer is visible without a modal overlay. A web page cannot register an OS-global hotkey (W3C/MDN UI Events), and global dictation defaults (Windows `Win+H`, macOS Fn/Globe, ChromeOS Search+D) are OS-level; dsh-ears does not add a native companion.
- Decision (default): **`Ctrl+Shift+Space` on all three platforms** (no Cmd mapping — macOS `Cmd+`` ` is the system window-cycle grab). The default is typed-key-free, left-hand reachable in one hand (left Ctrl + left Shift + left-thumb Space), free in Chrome/Firefox/Edge on Windows/Linux/macOS, and layout-stable (Space exists on every keyboard, including 60%/65%/68-key compact boards). Bare `Ctrl+Space` is explicitly rejected because it is the Chinese IME toggle on Windows, the input-source switch on macOS, and the autocomplete trigger in IDEs; the Shift escapes the IME grab. Single-key defaults were rejected: F-keys are media keys on macOS by default, are absent on compact keyboards (Fn layer only), and no mainstream web product reserves a bare letter for voice.
- Decision (trigger semantics): idle press = start recording (same session action as the microphone click), recording press = stop and transcribe, transcribing/polishing press = ignored, `event.repeat` and IME composition ignored. When the D-021 gate blocks the microphone, the shortcut focuses the (gray) microphone button so its existing bilingual tooltip surfaces the reason — no recording happens. Revised (2026-08-17): the hotkey listens on **window capture** and calls `preventDefault` + `stopPropagation` when the chord matches, so it **outranks text input** — editor/composer keydown handlers (which bubble and may swallow or stop the event) never see a matched combination, and pressing the shortcut inside the composer or any text field always wins over the input layer. Non-matching keys, disabled, and gated states leave the event untouched.
- Decision (activation guard): the listener lives in the composer `MicrophoneButton` and ignores the chord when the event target is inside `[role="dialog"]` (the settings window is `role="dialog" aria-modal="true"`), when the page is not visible, or when the button itself is not laid out (`offsetParent === null`, covering hidden conversation views).
- Decision (implementation): a **hand-written shared module** (`src/shortcut.ts`, no third-party dependency) implements parse/normalize/validate/match/capture/format and the reserved-combo list; this follows the report's recommendation ("a custom handler may be preferable to adding a dependency for one shortcut") and the D-025 no-dependency precedent, superseding the earlier hotkeys-js preference. Key tokens derive from `KeyboardEvent.code` (layout-stable); the canonical stored form is lower-case plus-joined with fixed modifier order (`ctrl+shift+space`). Settings storage adds `voiceShortcutEnabled` (boolean, default true) and `voiceShortcut` (string, default `ctrl+shift+space`) through the D-031 auto-save model; host validation rejects malformed and typing-key chords. Modifier-only chords are valid.
- Revised (2026-08-18, library re-evaluation): the maintainer asked whether a statically compilable third-party shortcut library should replace the custom module. Re-checked current docs/source for `tinykeys` (ESM, ~650B, `getModifierState` + `KeyboardEvent.code`) and the earlier hotkeys-js/Mousetrap survey. A library would replace only chord matching. Host validation, reserved/typing-key policy, the settings recorder (including `lastHeld` for macOS Control capture), and platform labels stay in-repo. `tinykeys` also defaults to ignoring composer inputs, which contradicts the hotkey-over-input rule, and its `$mod` alias maps to Cmd on Apple, which this decision forbids. **Keep the hand-written module; do not add a shortcut dependency.**
- Decision (recorder rules): the recorder **accepts modifier-only chords** (`Ctrl`, `Ctrl+Shift`, …) by committing the peak simultaneous modifier set when every modifier is released. It still hard-rejects **bare** letter/digit/text-action keys (Space, Enter, punctuation, arrows…) because they type or act on text, and it rejects Alt/Option+letter/digit chords because macOS Option+letter produces special characters (and AltGr layouts behave the same). **Letters and digits with Ctrl/Shift/Meta are valid** (revised after an earlier version rejected them as browser-reserved; collisions are now amber warnings instead of blocks). Bare F-keys are allowed because they never produce text. Browser/OS-reserved chords — including generated `ctrl+<letter>`, `meta+<letter>`, `ctrl+<digit>`, `meta+<digit>` and explicit `ctrl+shift+`/`shift+meta+` sets, plus F5, Ctrl+Space, Alt+Tab, Cmd+Space, Ctrl+Enter… — are valid but flagged amber without blocking the write. Escape cancels capture; capture events are intercepted with `preventDefault` + `stopPropagation` at the window capture phase so the global shortcut cannot fire while recording, and held modifier keys are shown live inside the capture button. A "Reset to default" action restores `ctrl+shift+space` (an empty shortcut is never a valid state).
- Display: chords render with platform-appropriate labels (mac ⌃⌥⇧⌘ vs Win/Linux Ctrl/Alt/Shift/Win-Super); the default renders identically on all platforms.
- Rationale: the four-round design grill (default-key constraint evolution: global→in-page, ≤2 keys→left-hand→compact-layout→IME safety) settled that a safe in-page voice chord must be a modifier chord; Ctrl+Shift+Space is the only default simultaneously left-hand, typing-safe, cross-platform, compact-layout-safe, and free of browser/OS/IME conflicts. Moving language and the recording limit to General keeps the Recognition tab focused on ASR backends and matches the user's request to lead with general settings.
- Revision (2026-08-26): the recognition-language row placement is superseded by D-042, which removes the global recognition-language setting and gives each backend its own language field inside the Recognition tab. The General tab keeps the voice-input shortcut, sounds toggle, display name, and recording limit.

## D-029 — Custom polish system prompt with a multilingual default

- Status: accepted (2026-08-18).
- Decision: the Polishing tab gains a global `polishPrompt` settings field (string, default `''`). When non-empty it **replaces the built-in default system prompt entirely**; blank means "use the built-in default". The host always appends an invisible output-contract guard (`POLISH_OUTPUT_GUARD`: return only the polished text, never an answer; treat the transcript as data) to a custom prompt. The transcript stays wrapped as the `<transcript>` user message on both paths. The built-in default is the shipped ASR-cleaning contract in `src/polish/prompts.ts` (self-correction, filler vs tone particles, ASR/technical repair, explicit-enumeration lists only, output-only-the-cleaned-text); per-route prompts are explicitly deferred.
- Decision (validation): trim-based 4000-character cap (`MAX_POLISH_PROMPT_LENGTH`); an over-length draft is invalid and is skipped by auto-save (D-031) until shortened. The stored value keeps the user's original text (whitespace preserved); emptiness and length are judged on the trimmed value. An empty draft saves an explicit `''` (clear back to default), matching the `polishModel`/`polishReasoningEffort` precedent, so a user can genuinely remove a custom prompt.
- Decision (UX): the prompt row lives in the Polishing group (gated on polishing enabled), is a multiline textarea with a live `n/4000` counter, offers a Reset-to-default action that stages an empty draft, and a read-only 查看默认 / View default expand that shows the shipped prompt.
- Decision (storage/wire): `polishPrompt` flows through the `EarsSettings` defaults (`DEFAULT_EARS_SETTINGS`), the Host-only schemastery schema, and the strict Remote view/patch zod schemas; the client controller stages/saves it like the other string fields and flags it invalid when over-length. The Remote parity test stays endpoint-based (a new optional field needs no descriptor change).
- Rationale: the grill settled the whole feature as: whole-replacement (not a template, not appended instructions), empty = default, global single field, explicit-clear writes, and a hard output-contract guard so a custom prompt can change style/content but never the returned shape. The shipped default became the maintained multilingual contract rather than the earlier Chinese-targeted one-liner, aligning polish output with the product's multilingual voice input.

## D-030 — Dual host compatibility for rc.6 and rc.7

- Status: accepted (extends D-006); extended by D-034 and D-035.
- Decision: dsh-ears is compatible with dsh `0.1.0-rc.6` and `0.1.0-rc.7`. Peer ranges stay `^0.1.0-rc.6` so either host satisfies them. The compile/test baseline is the exact `0.1.0-rc.7` packages. No source-level rc fork is introduced: the slots and Host APIs the plugin consumes (`settings.section`, `conversation.input.right` / `dock`, `ctx.llm`, the used ui-primitives symbols) are unchanged across this pair.
- Prohibited: tightening peers to `^0.1.0-rc.7` in a way that rejects an rc.6 host, or claiming a dsh rc before it is tested. (D-034 later claims rc.8 after verification; D-035 later opens the peers entirely and claims through `0.1.1-rc.2` after verification.)
- Rationale: the rc.6→rc.7 audit found only additive or unrelated host changes; the user asked to keep both hosts working after the local CLI moved to rc.7.

## D-031 — Flat native settings rows with per-field auto-save

- Status: accepted (2026-08-18); supersedes D-026's save mechanism and card chrome. D-024's presentation rules stay. D-025 stays: no third-party form library.
- Decision: the `dsh-ear` tab panels are uncarded hairline rows matching native General (`settings.general.item`): no card surface, radius, or extra inset. Tabs remain as the page's group navigation.
- Decision: edits auto-save through the existing hand-written controller. Valid drafts flush 400 ms after the last edit, on text-field blur, or when the settings section unmounts. An invalid draft is skipped and stays local with its red hint; other valid fields still persist. A Host rejection keeps the drafts, shows the saveFailed notice, and does not retry in a loop — the next edit or a later flush retries. A mid-save edit survives the in-flight write and flushes after it. The composer microphone still reads persisted settings only.
- Decision: there is no Save/Discard footer. Closing the panel flushes valid pending drafts instead of discarding them. The API key keeps absent=keep / staged-clear / undo-before-submit semantics; an emptied recording limit still resets to the default.
- Rationale: the earlier auto-save failed because of cross-field Host gates and a retry loop, not because debounce itself is unsafe. With field-level Host validation and a success-only follow-up flush, auto-save matches native General and removes the extra card chrome the user rejected. Form libraries were reconsidered and still declined: they would duplicate the SnapshotStore shared with the microphone.

## D-032 — Bailian DashScope ASR and per-provider cloud keys

- Status: accepted (2026-08-18).
- Decision: add `cloudAsrProvider: 'bailian'` as a 云提供商 menu item, not a new `asrBackend`. The protocol is DashScope sync `POST {origin}/api/v1/services/aigc/multimodal-generation/generation` with a Data URL. Qwen3-ASR-Flash uses `content: [{ audio }]`; Fun-ASR-Flash / Qwen-Audio-3.0-ASR-Flash use `type: input_audio`. The adapter picks the body from the model name and parses both `output.text` and `output.choices[].message.content`. Filetrans, realtime WebSocket, OSS upload, live model listing, and the official SDK are out of first-release scope.
- Decision: the user types an HTTPS origin (`cloudAsrBailianHost`; loopback may be HTTP) and a model name (`cloudAsrModel`, empty = not ready). Selecting Bailian caps a recording at 300 seconds. Language uses the existing recognition-language row (`zh-CN` → `zh` / `language_hints`), and `auto` omits the language field. No ITN, hotword, or context settings.
- Decision: Groq, custom OpenAI-compatible, and Bailian each store a separate `role('secret')` key. The Host settings file groups them as `groq`, `customOpenAi`, and `bailian` (apiKey / model / endpoint or host). The plugin wire uses explicit names (`cloudAsrGroqApiKey`, `cloudAsrCustomApiKey`, `cloudAsrBailianApiKey`). Switching providers no longer overwrites another provider's key. A first-read rewrite lifts the previous flat keys into those groups.
- Rationale: OpenAI-compatible `chat/completions` only documents Qwen3-ASR-Flash. DashScope sync is the common Flash endpoint. Filetrans still needs a public URL the plugin does not have.
- Revision (2026-08-26): "Language uses the existing recognition-language row" above is superseded by D-042 — Bailian reads its own `cloudAsrBailianLanguage` field, and an empty value omits the language parameter for automatic detection.

## D-033 — About tab and notify-only update check

- Status: accepted (2026-08-18).
- Decision: the `dsh-ear` page gains a last **关于 / About** tab. Identity rows have no hint copy: 仓库 (thesvg.org `Github` mark plus `@WizisCool/dsh-ears`, opens the GitHub repo), installed version, MIT license, and the verified dsh range (`0.1.0-rc.6 / 0.1.0-rc.7`). No logo block and no changelog. Rows match the uncarded General hairline layout (D-031).
- Decision: **Check for updates** runs only when the user clicks. The Host GETs `https://registry.npmjs.org/dsh-ears/latest` with no credentials and compares npm `latest` to the installed version. The browser never contacts the registry. Results: up to date; update available (show the newer version and copy `dsh plugin --profile web update dsh-ears`); unpublished (honest empty channel); or error. Never install, restart, or rewrite the profile. A 404 is not reported as "up to date".
- Decision: first public release (`0.1.0`, public GitHub repo, `v0.1.0` tag, GitHub Release from CHANGELOG, npm publish) is authorized but **not part of this implementation**. It waits for an explicit "可以发".
- Revision (2026-08-19): the maintainer authorized that first public release. The About tab's unpublished 404 path remains for a missing `latest` channel; after `0.1.0` is on npm the check reports up to date or update available.
- Rationale: plugin install belongs to `dsh plugin` / pnpm. The settings page can only tell the user what is on npm.

## D-034 — Triple host compatibility for rc.6, rc.7, and rc.8

- Status: accepted (2026-08-20); extends D-030.
- Decision: dsh-ears is compatible with dsh `0.1.0-rc.6`, `0.1.0-rc.7`, and `0.1.0-rc.8`. Peer ranges stay `^0.1.0-rc.6` — the semver range `>=0.1.0-rc.6 <0.2.0` covers all three, verified empirically with no plugin-caused peer conflicts on an rc.8 host install. The `react` peer widens to `^18.2.0 || ^19.0.0` because the rc.8 host moved to React 19 (react-dom 19.2.8); the live rc.8 boot confirmed the client bundle renders, and rc.6/rc.7 hosts stay on React 18. The compile/test baseline moves to the exact `0.1.0-rc.8` packages. The About tab range constant (`src/about.ts`) now reports `0.1.0-rc.6 / 0.1.0-rc.7 / 0.1.0-rc.8`.
- Decision: `src/client/settings.tsx` imports `@thesvg/react/github` (lowercase) because the package export `./*` maps case-sensitively to `dist/*.js`; the capitalized form resolved on the maintainer's case-insensitive Mac but fails on Linux CI.
- Prohibited: tightening peers to `^0.1.0-rc.8` (rejects rc.6/rc.7 hosts) or claiming any later rc.
- Rationale: the rc.7→rc.8 audit found only additive or unrelated host changes (multimodal image requests, profile-bundle subagents, Windows PTY work, the SQLite storage rewrite). The consumed surfaces — `settings.section`, `conversation.input.right` / `dock`, `createUserMessage`, `settingsNamespace`, `TypertRemoteService`, `createSnapshotStore`, and the used ui-primitives symbols — are unchanged or additively extended on rc.8. rc.8 moved plugin settings onto the plugin's own registered page, which dsh-ears already uses. A live rc.8 boot (isolated `DSH_HOME`; rc.8 storage is incompatible with rc.6) verified the `dsh.client.inject` bundle manifest, the composer microphone, and the dedicated settings page. A bare rc.8 install reproduces an upstream `unmet peer react` warning (rc.8's own React 18 peers vs react-dom 19.2.8) without dsh-ears present.

## D-035 — dsh 0.1.1 compatibility and open peer ranges

- Status: accepted (2026-08-21); extends D-006, D-030, and D-034.
- Decision: the supported dsh set is everything published so far: `0.1.0-rc.6` through `0.1.1-rc.2` (rc.6, rc.7, rc.8, `0.1.1-rc.1`, `0.1.1-rc.2`). dsh ships quickly, so every future dsh release requires an audit before this set grows; the set is stated in docs and in the About tab, never implied by peer ranges.
- Decision: all `@deepseek-ai/dsh-*` peer dependencies become `*`, revising D-034's "peer ranges stay `^0.1.0-rc.6`" floor. Peer ranges now express install acceptance only, decoupled from compatibility claims: installation must not fail on a newly released host while its audit is still pending. D-006's "no claim until tested" rule stays fully in force — it lives in README badges, `.agent/PLAN.md`, `.agent/context.md`, and the About tab's verified-range row (`DSH_COMPATIBILITY`). `@deepseek-ai/cordis` (`^4.0.1`), `@deepseek-ai/schemastery` (`^3.18.1`), and `react` (`^18.2.0 || ^19.0.0`) keep their ranges.
- Evidence (2026-08-21 audit of rc.7 → `0.1.1-rc.2`, on top of D-034's rc.8 audit):
  - The dsh CLI main package's `lib/` is byte-identical across rc.7, rc.8, `0.1.1-rc.1`, and `0.1.1-rc.2`; only config presets, READMEs, and dependency re-pins differ.
  - The sub-packages the plugin consumes directly — `dsh-settings` and `dsh-typert-protocol` — are identical between rc.7 and `0.1.1-rc.2`.
  - The remaining consumed packages (`dsh-api-remotes`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-conversation`, `dsh-client-ui-primitives`, `dsh-client-ui-settings`, `dsh-client-ui-settings-plugins`, `dsh-client-ui-slots`, `dsh-credentials`, `dsh-llm`) changed additively only (new exports, new types, comment revisions); no consumed symbol changed shape.
  - With devDependencies at exact `0.1.1-rc.2`, `pnpm check` and the full unit suite pass with zero source changes; the maintainer's browser smoke on the local `0.1.1-rc.2` CLI passed the full mic → transcript → polish flow.
- Decision: the compile/test baseline moves to the exact `0.1.1-rc.2` packages (D-030/D-034 precedent repeated): devDependencies always track the newest tested host so CI catches regressions first. The release-age exemption file gains the rc.2 set alongside rc.8.
- Prohibited: claiming an untested future dsh release before its audit; reintroducing a single prerelease caret floor that silently rejects newer tuples.
- Rationale: node-semver prerelease matching rejects any version whose `[major, minor, patch]` tuple has no prerelease comparator, so `^0.1.0-rc.6` accepts rc.6/rc.7/rc.8 (tuple `0.1.0`) but silently refuses every `0.1.1-*` host — published `0.1.1` failed peer resolution there. A caret-OR list would fix that today but break installation again at the next dsh release until another plugin release ships; the maintainer chose install-always over install-gating, accepting that untested future hosts may load the plugin before an audit runs.
## D-036 — Wire-safe optional fields on strict RPC results

- Status: accepted (2026-08-25).
- Decision: every object returned across a strict Typert result boundary omits optional fields instead of assigning them an explicit `undefined` value. Result constructors either drop the key or use a conditional spread (`...(value === undefined ? {} : { key: value })`); shared empty-state constants list only their always-present keys.
- Failure context: selecting Local Whisper surfaced "typert gateway: dshEars/getWhisperModelState: business result failed boundary validation". The model manager's empty state carried `errorCode: undefined` and `errorParams: undefined` as own properties; zod v4 preserves present-but-undefined keys through `.optional()`, so they survived schema parsing and the gateway's JSON-safety walk rejected them ("undefined is not JSON-safe"), surfacing as a `result-invalid` TypertGatewayError.
- Decision: no defensive undefined-stripping at the service boundary. The producer stays the single place responsible for wire safety, so a future violation surfaces as a loud gateway error instead of being silently masked; `tests/whisper-model-state-wire.test.ts` replays the gateway check over every no-interpreter path.
- Rationale: the typert gateway validates strict results twice — a zod parse, then a recursive JSON-safety walk — and only absent keys survive both for optional fields.

## D-037 — OS-aware Local Whisper setup guidance

- Status: accepted (2026-08-25).
- Decision: when interpreter discovery fails, `dshEars/getWhisperModelState` attaches two additive optional diagnostics to the state — `platform` (`windows` / `macos` / `linux`) and `environment` (`python-missing` when nothing was found, `whisper-missing` when an interpreter exists without the openai-whisper package). The probe already knew whether any interpreter existed; both fields stay absent on healthy states.
- Decision: with a diagnosis present, the Recognition tab's model row shows the matching sentence plus an expandable 安装指引 / Setup guide: per-platform steps for Python, FFmpeg (a transcription dependency), and openai-whisper, each with one canonical copyable command (`winget` / `brew` / `apt`; `pip` or `pip3`). A `whisper-missing` diagnosis skips the Python step. A 重新检测 / Check again action re-queries state after the user installs pieces; an unknown platform falls back to generic doc advice.
- Decision: the composer microphone keeps its D-021 gray-tooltip behavior unchanged as the short recording-entry hint; guidance lives where the download button lives.
- Rationale: a disabled download button gave no reason and the mic tooltip sat far from the problem surface. Commands stay single canonical ones per step rather than full package-manager surveys.

## D-038 — User-facing copy style

- Status: accepted (2026-08-25); revises D-024's rule that error, validation, and status messages retain sentence punctuation.
- Decision: no user-facing string ends with a full stop (`。` or `.`) in either locale. Multi-sentence strings are rewritten around commas or semicolons instead. Internal dots that are not sentence stops (versions, URLs, commands) are untouched.
- Decision: user-facing copy avoids internal jargon such as "Host"; prefer plain phrasing ("本机 / this computer") or omit the location when obvious. Developer docs and code keep technical terms.
- Enforcement: `tests/locale.test.ts` guards every locale entry against terminal stops; host message strings follow the same style by convention.
- Rationale: terminal punctuation across short UI strings read as machine-generated, and "Host" names an internal deployment concept users have no mental model for.


## D-039 — Native whisper.node runtime and fixed configuration slots

- Status: accepted (2026-08-25); partially supersedes D-020 and fully supersedes D-037.
- Decision: Local Whisper uses the high-level `@fugood/whisper.node` package as the only native runtime. Python, Torch, FFmpeg, interpreter discovery, the `whisper` CLI, and fallback engines are removed from the product path. The Host owns the native runtime and model lifecycle; the browser owns audio normalization.
- Decision: the browser converts captured audio to mono 16 kHz PCM16 WAV before the final Host RPC. The Host keeps a persistent native model context, serializes transcription jobs, forwards cancellation to the native job, and releases the context on Cordis disposal.
- Decision: model files are separate whisper.cpp GGML downloads owned by dsh-ears. Downloads use a fixed manifest, checksum, partial file, atomic rename, and completion marker. Models are not embedded in the npm tarball.
- Decision: Local Whisper acceleration is selected with the concrete flat wire field `localWhisperAcceleration` (`default`, `vulkan`, or `cuda`) and is stored under `recognition.localWhisper.acceleration`. The first native load fixes the process variant; changing acceleration afterwards requires restarting the dsh Host. No automatic fallback is presented or performed.
- Decision: runtime diagnostics are short and concrete: the selected native package or acceleration variant is unavailable, or the Host must restart to apply a changed variant. The old Python/FFmpeg/openai-whisper setup guide is deleted.
- Decision: persisted Host configuration has four fixed slots — `general`, `recognition`, `cloudAsr`, and `polishing`. The Remote/browser contract remains flat for compatibility with per-field drafts and auto-save. This is a fixed dsh-ears data shape, not a registry, factory, generic slot interface, or provider framework.
- Rationale: one native dependency and one concrete Host runtime remove the old TypeScript-to-Python process boundary without introducing a second abstraction layer. Keeping the flat wire avoids coupling this runtime refactor to a client protocol rewrite, while nested Host storage makes ownership and migration legible.

## D-040 — Tencent Cloud provider selection

- Status: superseded by D-041.
- Current Tencent Cloud behavior and rationale are recorded in D-041.

## D-041 — Tencent Cloud standard and realtime recognition

- Status: accepted (2026-08-26); supersedes D-040.
- Decision: expose one Tencent Cloud provider with two executable service ids, `recording-file` and `realtime`, using the same AppID, SecretID, SecretKey, and engine type settings.
- Decision: `recording-file` uses the API 3.0 `CreateRecTask` and `DescribeTaskStatus` operations at `asr.tencentcloudapi.com`. Local mono 16 kHz PCM16 WAV audio is submitted as base64 data with its original byte length, and the Host polls until a final transcript is available.
- Decision: `realtime` uses the documented WebSocket V2 protocol at `asr.cloud.tencent.com`. The Host creates and owns the signed session, accepts browser PCM chunks through Remote calls, streams them to Tencent Cloud, returns incremental text, and closes the session after the final response.
- Decision: stopping commits the final transcript to the editable draft and then follows the existing optional polishing flow. Cancelling closes the Host session and discards the in-flight transcript.
- Decision: AppID and SecretID remain Host settings, SecretKey is a Schemastery `role('secret')` field, and no Tencent credential value crosses the browser Remote boundary.
- Rationale: both supported Tencent Cloud interaction modes now use their current documented protocols while preserving one provider-level configuration and the existing Host/Client ownership boundary.

## D-042 — Per-provider recognition language

- Status: accepted (2026-08-26).
- Decision: remove the global recognition-language setting (`recognition.language`) and its General-tab row (that placement came from D-028).
- Decision: each backend owns its language. New fields `recognition.webSpeech.language`, `recognition.localWhisper.language`, `cloudAsr.groq.language`, `cloudAsr.customOpenAi.language`, and `cloudAsr.bailian.language` map to the flat wire names `webSpeechLanguage`, `localWhisperLanguage`, `cloudAsrGroqLanguage`, `cloudAsrCustomLanguage`, and `cloudAsrBailianLanguage`. Tencent Cloud keeps the per-provider engine type as its language/engine selector (D-041) and receives no new field.
- Decision: empty values follow per-backend semantics. Web Speech with an empty field follows the dsh English/中文 locale through the existing helper. Local Whisper, Groq, custom OpenAI-compatible, and Bailian omit the language parameter when the field is empty, making automatic detection the default and first-class behavior instead of unreachable behind the previous empty-to-locale resolution.
- Decision: each Recognition-tab backend branch renders its own language row — Web Speech, Local Whisper, Groq, Bailian, and custom OpenAI-compatible; Tencent Cloud has no language row.
- Migration: stored `recognition.language` is silently dropped when the settings store rewrites to schema version 4 (`EARS_SETTINGS_SCHEMA_VERSION` 3 → 4). The new fields start empty; no value migrates into them.
- Rationale: the global row was already not shared in substance — Tencent ignored it in favor of engine type, and every adapter re-normalized it differently (full BCP-47 for Web Speech, base codes for Whisper and the OpenAI-compatible contract, `asr_options.language` / `language_hints` for Bailian). Because an empty value resolved to a concrete locale before the adapters ran, their empty/auto branches were unreachable. Per-provider fields match each protocol's real capabilities, follow the existing per-provider credential/model pattern, and let future cloud providers define their own language semantics per provider.
- Prohibited: reintroducing a global language field shared across backends; special-casing the literal `auto` string as a stored value — empty is the automatic-detection representation.

## D-043 — Deepgram cloud ASR and dual recording-file/realtime services

- Status: accepted (2026-08-27).
- Decision: add Deepgram as a first-class cloud ASR provider with protocol `'deepgram'`, default model `nova-3`, and dual executable service ids: `recording-file` (standard pre-recorded audio via REST `POST https://api.deepgram.com/v1/listen`) and `realtime` (live streaming via WebSocket `wss://api.deepgram.com/v1/listen`).
- Decision: `recording-file` submits local audio directly to the Deepgram REST endpoint with `Authorization: Token <api_key>`. When recognition language is empty, it appends `detect_language=true` for automatic language detection; when language is specified, it appends `language=<lang>`. Both `smart_format=true` and `punctuate=true` are enabled by default for natural draft formatting.
- Decision: `realtime` establishes a Host-managed duplex WebSocket connection to the Deepgram streaming endpoint with raw linear16 16kHz mono audio. Streaming does not support `detect_language=true` (Deepgram API restricts language detection to pre-recorded audio), so empty language omits the parameter while explicit language appends `language=<lang>`. The Host buffers interim and final results, merges segments using CJK-aware spacing (`joinSpacedSegments`), and exposes incremental text to the browser client through standard Realtime RPC.
- Decision: Deepgram API key is managed as a Schemastery `role('secret')` field under `cloudAsr.deepgram.apiKey`, mapped to `cloudAsrDeepgramApiKey` on the flat Remote wire. The browser never receives the secret key.
- Rationale: Deepgram's REST and streaming protocols require proprietary endpoints and payload shapes that differ from OpenAI-compatible and DashScope adapters. Reusing the dual-service pattern established by Tencent Cloud (D-041) allows users to choose between high-accuracy one-shot recording transcription and low-latency realtime live recognition under a single unified provider configuration.

## D-044 — Xiaomi MiMo cloud ASR with API and Token Plan access

- Status: accepted (2026-08-27).
- Decision: add Xiaomi MiMo (`mimo`) as a first-class cloud ASR provider with protocol `'mimo'`, default model `mimo-v2.5-asr`, and two selectable access methods: `api` (standard platform API, `https://api.xiaomimimo.com/v1`) and `token-plan` (Token Plan subscription, OpenAI-compatible endpoint).
- Decision: Token Plan supports three regional clusters configured via `cloudAsrMimoCluster`: `cn` (China, `https://token-plan-cn.xiaomimimo.com/v1`), `sgp` (Singapore, `https://token-plan-sgp.xiaomimimo.com/v1`), and `ams` (Europe/Amsterdam, `https://token-plan-ams.xiaomimimo.com/v1`). Default cluster is `cn`. The Host derives the transcription endpoint by appending `/chat/completions`.
- Decision: MiMo ASR uses the multimodal Chat Completions protocol (`messages[].content[].type = "input_audio"` with base64 data URL and format `wav`). Audio input is restricted by MiMo to WAV and MP3; the browser converts captured audio to mono 16 kHz PCM16 WAV before the final Host RPC (matching the Tencent Cloud audio path in `local-whisper-audio.ts`).
- Decision: recognition language follows D-042: stored under `cloudAsr.mimo.language` (flat wire `cloudAsrMimoLanguage`), empty field defaults to `auto`, and explicit inputs support `zh` and `en`.
- Decision: API Key validation follows D-024 (per-field independent validation without cross-field deadlocks). The UI surfaces guidance hints for key formats (`sk-...` for API, `tp-...` for Token Plan) without hard-blocking or cross-field auto-switching.
- Decision: the secret key is stored under `cloudAsr.mimo.apiKey` as a Schemastery `role('secret')` field and masked across the Remote boundary (`cloudAsrMimoApiKeyConfigured: boolean`).
- Rationale: MiMo provides flagship transcription performance with cost-effective Token Plan tiers. Unifying API and Token Plan access under a single `mimo` provider preserves a clean top-level provider list while giving users full access to regional Token Plan clusters.
