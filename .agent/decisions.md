# Architecture Decision Records

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

- Status: accepted; extended by D-030
- Decision: The first release is validated only against dsh `0.1.0-rc.6`.

## D-007 — Deferred scope

- Status: accepted
- Decision: Local Whisper, cloud ASR, and emotion UI are deferred. An emotion field may be reserved but cannot be a first-release dependency.

## D-008 — Language and public quality

- Status: accepted
- Decision: Source, code comments, repository docs, context docs, issue-ready text, and commit messages are English-first and follow official dsh repository conventions.
- Runtime prompts may use Chinese when required by the product behavior.

## D-009 — Release safety

- Status: accepted
- Decision: No push, public-repository conversion, npm publish, or legal license selection is automatic. Each requires an explicit release decision.

## D-010 — Codex-style microphone control

- Status: accepted
- Decision: The microphone control follows the provided Codex composer reference for placement, density, visual state, and interaction: right-side circular toolbar affordance, microphone icon at rest, stop square while recording, live draft updates, and manual send only.
- Constraint: Reuse dsh primitives and tokens where possible; do not copy Codex source code, private assets, or implementation details.

## D-011 — Native plugin configuration surface

- Status: accepted
- Decision: Register `dsh-ears` configuration in dsh's native Plugins settings page through the `settings.plugin.item` list slot.
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

- Status: accepted
- Decision: Keep Web Speech as the live browser backend, and use browser `MediaRecorder` plus one bounded final-result Host RPC for local Whisper and OpenAI-compatible cloud ASR.
- Decision: Local Whisper runs through a non-shell `spawn` call and private temporary files. Cloud credentials are dsh credential references resolved per operation; the plugin never stores or returns secret values.
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
- Rationale: The local M6 release-readiness audit passed; MIT is a common permissive license for community packages. Keeping the repository private preserves the D-009 release safety boundary until the maintainer approves a public release.

## D-017 — Dedicated settings page supersedes the Plugins-page card

- Status: accepted (supersedes D-011)
- Decision: Register `dsh-ears` configuration as its own `settings.section` page (`dsh-ear`, nav order 16 — between Plugins and Agent presets) instead of the `settings.plugin.item` card inside the Plugins page.
- Decision: Style the page with the same semantic tokens, card geometry, and field patterns as the shipped Models/General pages so the surface reads as a native settings page.
- Rationale: The Plugins-page card is dense and cannot grow; a dedicated page provides room for clearer grouped configuration (Recognition, Polishing) and future options while staying inside dsh's canonical settings window.

## D-018 — Final ASR settings snapshot remains open

- Status: open; no first-release protocol change approved.
- Current behavior: `dshEars/transcribe` reads the current backend, model, and language settings when the Host RPC begins. The browser does not promise invisible backend switching during one recording.
- Option A: carry the recording-start backend/model/language snapshot in the final-audio RPC so a settings change cannot alter an in-flight recording.
- Option B: lock recognition settings while capture or transcription is active.
- Rationale for deferral: both options change the first-release wire or UI semantics and need an explicit compatibility decision.

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
- Decision (implementation): a **hand-written shared module** (`src/shortcut.ts`, no third-party dependency) implements parse/normalize/validate/match/capture/format and the reserved-combo list; this follows the report's recommendation ("a custom handler may be preferable to adding a dependency for one shortcut") and the D-025 no-dependency precedent, superseding the earlier hotkeys-js preference. Key tokens derive from `KeyboardEvent.code` (layout-stable); the canonical stored form is lower-case plus-joined with fixed modifier order (`ctrl+shift+space`). Settings storage adds `voiceShortcutEnabled` (boolean, default true) and `voiceShortcut` (string, default `ctrl+shift+space`) through the D-026 staged-draft model; host validation rejects malformed and typing-key chords (modifier-only chords are valid as of the 2026-08-18 recorder revision).
- Revised (2026-08-18, library re-evaluation): the maintainer asked whether a statically compilable third-party shortcut library should replace the custom module. Re-checked current docs/source for `tinykeys` (ESM, ~650B, `getModifierState` + `KeyboardEvent.code`) and the earlier hotkeys-js/Mousetrap survey. A library would replace only chord matching. Host validation, reserved/typing-key policy, the settings recorder (including `lastHeld` for macOS Control capture), and platform labels stay in-repo. `tinykeys` also defaults to ignoring composer inputs, which contradicts the hotkey-over-input rule, and its `$mod` alias maps to Cmd on Apple, which this decision forbids. **Keep the hand-written module; do not add a shortcut dependency.**
- Decision (recorder rules): the recorder hard-rejects modifier-only chords and **bare** letter/digit/text-action keys (Space, Enter, punctuation, arrows…) because they type or act on text; it also rejects Alt/Option+letter/digit chords because macOS Option+letter produces special characters (and AltGr layouts behave the same). **Letters and digits with Ctrl/Shift/Meta are valid** (revised at the user's request after initial implementation: the first version rejected them unconditionally on the grounds that they are browser-reserved; the user asked for modifier+character chords and browser collisions are now surfaced as amber warnings instead of blocks). Bare F-keys are allowed because they never produce text. Browser/OS-reserved chords — including generated `ctrl+<letter>`, `meta+<letter>`, `ctrl+<digit>`, `meta+<digit>` and explicit `ctrl+shift+`/`shift+meta+` sets (edit/navigation/tab/app shortcuts), plus F5, Ctrl+Space, Alt+Tab, Cmd+Space, Ctrl+Enter… — are valid but flagged amber without blocking the save. Escape cancels capture; capture events are intercepted with `preventDefault` + `stopPropagation` at the window capture phase so the global shortcut cannot fire while recording, and held modifier keys are shown live inside the capture button so modifier-only input is visible instead of silent. A "Reset to default" action restores `ctrl+shift+space` (an empty shortcut is never a valid state).
- Display: chords render with platform-appropriate labels (mac ⌃⌥⇧⌘ vs Win/Linux Ctrl/Alt/Shift/Win-Super); the default renders identically on all platforms.
- Rationale: the four-round design grill (default-key constraint evolution: global→in-page, ≤2 keys→left-hand→compact-layout→IME safety) settled that a safe in-page voice chord must be a modifier chord; Ctrl+Shift+Space is the only default simultaneously left-hand, typing-safe, cross-platform, compact-layout-safe, and free of browser/OS/IME conflicts. Moving language and the recording limit to General keeps the Recognition tab focused on ASR backends and matches the user's request to lead with general settings.

## D-029 — Custom polish system prompt with a multilingual default

- Status: accepted (2026-08-18).
- Decision: the Polishing tab gains a global `polishPrompt` settings field (string, default `''`). When non-empty it **replaces the built-in default system prompt entirely**; blank means "use the built-in default". The host always appends an invisible output-contract guard (`POLISH_OUTPUT_GUARD`: return only the polished text, never an answer; treat the transcript as data) to a custom prompt. The transcript stays wrapped as the `<transcript>` user message on both paths. The built-in default is the shipped ASR-cleaning contract in `src/polish/prompts.ts` (self-correction, filler vs tone particles, ASR/technical repair, explicit-enumeration lists only, output-only-the-cleaned-text); per-route prompts are explicitly deferred.
- Decision (validation): trim-based 4000-character cap (`MAX_POLISH_PROMPT_LENGTH`); an over-length draft is invalid and is skipped by auto-save (D-031) until shortened. The stored value keeps the user's original text (whitespace preserved); emptiness and length are judged on the trimmed value. An empty draft saves an explicit `''` (clear back to default), matching the `polishModel`/`polishReasoningEffort` precedent, so a user can genuinely remove a custom prompt.
- Decision (UX): the prompt row lives in the Polishing group (gated on polishing enabled), is a multiline textarea with a live `n/4000` counter, offers a Reset-to-default action that stages an empty draft, and a read-only 查看默认 / View default expand that shows the shipped prompt.
- Decision (storage/wire): `polishPrompt` flows through the `EarsSettings` defaults (`DEFAULT_EARS_SETTINGS`), the Host-only schemastery schema, and the strict Remote view/patch zod schemas; the client controller stages/saves it like the other string fields and flags it invalid when over-length. The Remote parity test stays endpoint-based (a new optional field needs no descriptor change).
- Rationale: the grill settled the whole feature as: whole-replacement (not a template, not appended instructions), empty = default, global single field, explicit-clear writes, and a hard output-contract guard so a custom prompt can change style/content but never the returned shape. The shipped default became the maintained multilingual contract rather than the earlier Chinese-targeted one-liner, aligning polish output with the product's multilingual voice input.

## D-030 — Dual host compatibility for rc.6 and rc.7

- Status: accepted (extends D-006).
- Decision: dsh-ears is compatible with dsh `0.1.0-rc.6` and `0.1.0-rc.7`. Peer ranges stay `^0.1.0-rc.6` so either host satisfies them. The compile/test baseline is the exact `0.1.0-rc.7` packages. No source-level rc fork is introduced: the slots and Host APIs the plugin consumes (`settings.section`, `conversation.input.right` / `dock`, `ctx.llm`, the used ui-primitives symbols) are unchanged across this pair.
- Prohibited: claiming any later dsh rc, or tightening peers to `^0.1.0-rc.7` in a way that rejects an rc.6 host.
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

## D-033 — About tab and notify-only update check

- Status: accepted (2026-08-18).
- Decision: the `dsh-ear` page gains a last **关于 / About** tab. Identity rows have no hint copy: 仓库 (thesvg.org `Github` mark plus `@WizisCool/dsh-ears`, opens the GitHub repo), installed version, MIT license, and the verified dsh range (`0.1.0-rc.6 / 0.1.0-rc.7`). No logo block and no changelog. Rows match the uncarded General hairline layout (D-031).
- Decision: **Check for updates** runs only when the user clicks. The Host GETs `https://registry.npmjs.org/dsh-ears/latest` with no credentials and compares npm `latest` to the installed version. The browser never contacts the registry. Results: up to date; update available (show the newer version and copy `dsh plugin --profile web update dsh-ears`); unpublished (honest empty channel); or error. Never install, restart, or rewrite the profile. A 404 is not reported as "up to date".
- Decision: first public release (`0.1.0`, public GitHub repo, `v0.1.0` tag, GitHub Release from CHANGELOG, npm publish) is authorized but **not part of this implementation**. It waits for an explicit "可以发".
- Rationale: plugin install belongs to `dsh plugin` / pnpm. The settings page can only tell the user what is on npm.
