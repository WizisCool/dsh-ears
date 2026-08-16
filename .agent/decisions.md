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

- Status: accepted
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
- Decision: cloud ASR settings store an inline API key through a schemastery `role('secret')` field (`cloudAsrApiKey`), following the shipped `dsh-web-search-deepseek` precedent. The key is write-only across the plugin wire: `getSettings` redacts the value and reports only `cloudAsrApiKeyConfigured`; `updateSettings` treats the patch field as absent=keep / non-empty=set / empty=clear. The `cloudAsrCredentialRef` field is removed (package unreleased; no migration burden).
- Decision: cloud ASR gains a provider dimension (`cloudAsrProvider: 'groq' | 'custom'`, default `groq`) backed by a Host-side static registry (`src/asr/providers.ts`) whose entries declare id, bilingual name, protocol, optional base URL, model filter, optional static models, default model, and endpoint editability. Groq is the first preset; the `custom` entry keeps the free-form endpoint/model behavior with the `whisper-1` default. Future providers plug in as registry entries when OpenAI-compatible, or entries plus adapters when their protocol differs.
- Decision: preset model selectors are populated by the new `dshEars/listCloudProviderModels` RPC. The Host fetches `GET {baseUrl}/models` with the stored key (replicating the `dsh-llm-pi-ai` pattern: bearer header, bounded parse, registry-declared filter, 15-second timeout, 30-second failure negative cache). No key means an empty list; a failed fetch keeps the persisted selection with a retry affordance; transcription does not validate against the fetched list.
- Decision: `listAsrBackends` folds preset readiness into the `cloud-openai` availability signal — a provider that requires a key reports unavailable until the key and model are configured — extending D-021 positive-signal gating to cloud readiness.
- Decision: the Recognition backend selector becomes one grouped menu (本地: Web Speech, Local Whisper / 云提供商: preset entries, Custom OpenAI-compatible) rendered with the primitives `MenuLabel`/`MenuSeparator`; menu entries map onto the existing `asrBackend` + `cloudAsrProvider` fields without new wire semantics.
- Rationale: the design review settled that Groq's transcription endpoint is the existing OpenAI-compatible contract, so a preset is data, not a new backend; the shipped `role('secret')` mechanism is the dsh-native way to store plugin-owned keys without echoing them across the wire; a Host-side registry keeps future providers a data addition while strict validation stays intact.

## D-024 — Per-field validate-on-edit settings model

- Status: accepted (2026-08-16); revises the D-023-era staging note and PLAN D3's pair rule.
- Decision: the settings page validates **only the field being edited**, at the same 400 ms cadence as the auto-save debounce. A field shows a red error (plus `aria-invalid` and `role="alert"` where applicable) only when the user has edited it and its own draft fails its own format rule — an untouched field is never marked invalid, and an unconfigured-but-valid state is never an error. There is no unified cross-field validity sweep and no page-level "some fields are invalid" summary (research: Ant/Arco per-field `validateTrigger`, GOV.UK "do not validate before the user has finished", VS Code per-field squiggles, and the shipped dsh plugin card-form, which validates one field's own parse and lets an invalid field block only its own write).
- Decision: prompts appear only for real problems. Red is reserved for genuinely invalid user input (illegal endpoint URL, over-long API key, empty language, out-of-range recording limit) and real failures (save failure, model-list fetch failure, Whisper operation failures, a stale cloud model). "Not yet configured" guidance prompts (the backend-unavailable line, the no-key model hint, amber incomplete hints) are removed; the composer microphone's D-021 gray-out with tooltip remains the readiness signal. The first-load alert is split from loading: nothing shows while the initial fetch is in flight, and only after the single automatic retry also fails does an amber notice appear ("无法读取插件配置，请稍后重试。"/"Could not load the plugin configuration. Please try again later.").
- Decision: every valid field value saves immediately and independently; an invalid draft skips only its own write. Selecting a cloud backend/provider now persists at once (the previous deadlock — no key → no live model list → no model → the switch never persisted — is gone). Empty drafts mean "no write" for key/endpoint/model, except `polishModel`/`polishReasoningEffort`, whose empty drafts persist as explicit clears from the provider/model cascades.
- Decision: PLAN D3's pair rule is revised — enabling polishing saves immediately; an incomplete provider/model pair leaves polishing **dormant** (the Host `dshEars/polish` call already returns the raw transcript for an empty pair), and it activates once a complete pair is selected. No cross-field blocking remains in the settings model.
- Rationale: a fresh user exploring Groq, Local Whisper, or polishing must see setup guidance-free, quiet defaults; red text signals something the user did wrong, and a configuration the user never made is not a fault. The per-field model matches both the platform's own plugin card-form and the industry research, and removes the cross-field staging machinery entirely.

## D-025 — No third-party form library

- Status: accepted (2026-08-16).
- Decision: keep the hand-written settings controller; do not adopt react-hook-form, TanStack Form, Formik, or rc-field-form.
- Rationale: the controller's complexity lives in exactly the parts form libraries do not target — a `SnapshotStore` shared with the composer microphone, a 400 ms-debounced per-field `updateSettings` RPC with no submit button, per-field generation-guarded async responses (Whisper state/mutations, cloud model listing, reasoning efforts) — and every library owns its own internal field-state copy, which would add a second source of truth and a bridging layer instead of removing the store logic. The per-field validation timing semantics (onChange/onBlur/touched, debounced re-validation) are adopted from the libraries' documented models without adopting the libraries. Evidence: `.agent/research/form-library-evaluation.md`.
