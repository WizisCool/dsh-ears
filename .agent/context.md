# Project Context

## Purpose

`dsh-ears` is a DeepSeek Harness voice-input plugin. It adds a Codex Desktop-like interaction to the dsh Web UI:

```text
microphone → transcription → optional dsh LLM polishing → editable draft → manual send
```

The user must always remain in control of the final send action.

## Compatibility

- Supported dsh targets: `0.1.0-rc.6` and `0.1.0-rc.7`.
- First supported Node range: `^22.19.0 || >=24.0.0`.
- The repository makes no compatibility claim for another dsh release until it has been tested.

## Product boundaries

- The microphone is a compact dsh toolbar control in the composer.
- Configuration belongs to a dedicated `settings.section` page in dsh's native settings window.
- Polishing uses any provider/model route already configured in dsh. The plugin stores the route selection only.
- The plugin never owns an LLM API key, base URL, provider, or model credential flow.
- Emotion recognition and emotion UI are intentionally deferred.
- No automatic send and no invisible backend switching during one recording.

## Package faces

```text
Host (`exports["."]`)
  ├─ Cordis lifecycle
  ├─ native dsh settings scope
  ├─ cloud ASR provider registry and write-only role('secret') key storage
  ├─ local Whisper CLI adapter
  ├─ OpenAI-compatible cloud ASR adapter
  ├─ dsh `ctx.llm` route discovery and polishing
  └─ strict Typert Remote descriptors

Browser (`exports["./client"]`)
  ├─ `conversation.input.right` microphone contribution
  ├─ session-scoped `conversation.input.dock` recognition card with live waveform
  ├─ Web Speech live recognition
  ├─ MediaRecorder capture for final ASR backends
  ├─ dedicated `settings.section` page (nav `dsh-ear`, order 16)
  └─ `inputActions.setDraft()` with stale-result protection
```

## ASR architecture

### Web Speech

`WebSpeechSession` configures the browser `SpeechRecognition`/`webkitSpeechRecognition` API for the selected language, continuous recognition, interim results, and one alternative. Interim and final text update the editable draft. Errors preserve the draft. Normal stop emits `onEnd` once; component teardown calls a silent abort that cannot write into an unmounted UI.

### Local Whisper

The browser records a bounded one-shot encoded audio payload. The Host writes it to a private `mkdtemp()` directory and invokes the configured `whisper` executable with an argument array. The adapter uses JSON output, enforces time/size limits, forwards cancellation, and removes the directory in `finally`. Model weights remain owned by the user's Host installation.

Model availability is surfaced through `dshEars/getWhisperModelState` and `dshEars/downloadWhisperModel`: the Host discovers the installed whisper's Python interpreter (whisper CLI shebang first — Homebrew/pipx venvs — then platform-specific PATH probes with a fast `importlib.util.find_spec` check that never imports the heavy module), reports CLI availability and the library-computed cache file, and downloads missing models through `whisper._download` (the library's own URLs/checks) with tqdm-stderr progress parsing. Downloads are single-flight; discovery self-heals after ENOENT so upgraded Homebrew Cellar paths recover on the next query. All helper scripts exit via `os._exit` after flushing output: on Homebrew python + torch + openblas the regular interpreter teardown races libomp against libgomp and can SIGSEGV during exit cleanup (the crash stays inside the isolated child; the plugin's completion-marker logic keeps the download result authoritative). The client reuses the row's hint line as the status: a spinner plus "checking" text while the first (torch-importing) table load runs, then downloaded / not-downloaded text with a click-to-download link, or progress with a cancel link while downloading; a downloaded model additionally shows a danger delete link with a two-step inline confirm. `dshEars/deleteWhisperModel` removes the library-computed cache file (refusing while a download runs), and cancelling a download also removes its partial file. Downloads write a `.dsh-ears-done` completion marker beside the model file: the state query only reports a file as downloaded when the marker is present, reports marker-less files as not downloaded with a re-download hint, and silently drops orphaned markers (D-020, closing D-019). The manager is a per-service, injectable instance disposed with the plugin scope (dispose kills an active download and removes its partial file), and interpreter/model-table discovery failures are negative-cached for 30 seconds. `transcribe()` gates the backend on CLI availability plus a downloaded, marked model before spawning the CLI, so a missing model is rejected instead of auto-downloaded inside the transcription timeout; failed transcriptions carry the whisper stderr tail (bounded). No state dots are rendered. The authoritative `import whisper` model table is loaded once per Host process, so later queries are plain file stats (≈3 s first query, then instant); the client polls every 800 ms while a download runs.

### OpenAI-compatible cloud ASR

The Host sends multipart form data containing `file`, `model`, and optional language to the provider's transcription endpoint. Preset providers (Groq) pin their endpoint in a Host-side registry (`src/asr/providers.ts`) and fetch their model list from `GET {baseUrl}/models` with the stored inline key (15-second timeout, 4 MiB bounded parse, registry-declared filter, 30-second failure negative cache) through `dshEars/listCloudProviderModels`; the Custom OpenAI-compatible provider accepts a free endpoint/model. The response must be JSON with a string `text` field. Audio and response sizes are bounded. Embedded URL credentials are rejected. The API key lives in the dsh settings store as a schemastery `role('secret')` field: `getSettings` redacts the value and reports only a configured boolean, `updateSettings` uses absent=keep / set / empty=clear semantics, and only the resulting bearer header is sent from the Host.

## Draft and polishing flow

`src/client/voice-flow.ts` is pure flow logic shared by the microphone component and tests. Final ASR refuses to overwrite a draft changed while transcription was pending. Polishing first leaves the raw transcript in the draft; a late result is ignored after a manual edit, and any route failure/cancellation leaves usable raw text.

## Settings

The Host registers `dsh-ears` under the `dsh-ears` settings namespace. The browser face registers a dedicated `settings.section` page (`dsh-ear`, nav order 16 — between Plugins and Agent presets) styled with the shipped pages' semantic tokens and card geometry; it splits fields into Plugins-style tab cards — General (default landing tab: the voice-input shortcut enable switch and Raycast-style recorder, plus the language and recording-limit rows that moved here), Recognition (grouped backend/provider selector with Local and Cloud-provider groups, Whisper model, cloud key/endpoint/model) and Polishing (toggle plus dsh provider/model route and an optional custom polish prompt) — with roving tabindex and arrow-key navigation. The recognition selector renders one grouped menu (本地: Web Speech / Local Whisper; 云提供商: Groq / Custom OpenAI-compatible) through the primitives `MenuLabel`/`MenuSeparator`; entries map onto the `asrBackend` + `cloudAsrProvider` field pair, the selector's hint text follows the active selection, and each backend's settings persist independently across switches. Fields follow the General/Permissions row pattern (title + hint left, pill `Menu` selector or compact text input right, hairline dividers) and stage edits as drafts committed by the footer's Save/Discard buttons (D-026, mirroring the shipped plugin card): Save is blocked unless the page is dirty, has no invalid draft, and is idle; Discard drops every draft and a failed state without confirmation; an invalid draft blocks the whole save and keeps the drafts; a Host-rejected write keeps the drafts with the red saveFailed line; empty text clears a field on save (the API key keeps absent=keep with a staged clear action, and an emptied recording limit resets to the default). Validation is per-field and edit-scoped (D-024): a field turns red only when the user has edited it and its own draft fails its own format rule, immediately on edit; untouched fields are never marked invalid and unconfigured-but-valid states render quietly. Red is reserved for genuinely invalid user input and real failures; page-level notices exist only for the load failure (amber, after the single automatic retry) and read-only providers. The first-load alert no longer appears during loading. The Polishing tab follows the page's progressive-disclosure rule: the toggle row is always visible, and the provider/model/reasoning rows appear only after polishing is enabled. The tab shows provider/model display names only, and offers a reasoning-effort picker: the Host resolves the selected route's supported efforts through dsh `resolveModelInfo` (`dshEars/listReasoningEfforts`), stores the choice in `polishReasoningEffort` (empty = model default), and passes a validated effort into the `dshEars/polish` call; effort labels are the adapter's native names (e.g. `Off`, `High`, `Max`) plus an untranslated `Default` entry, matching the composer model selector. Switching the provider clears the model and reasoning-effort drafts (no stale models from another provider). The custom polish prompt row (D-029) closes the group: a blank prompt uses the multilingual built-in default (language/term/code preservation, spoken self-corrections, enumeration-to-list, few-shot examples); a non-empty prompt replaces it entirely with the host-appended invisible output guard (`POLISH_OUTPUT_GUARD`), a live `n/4000` counter flags over-length drafts invalid (blocking the whole save), Reset-to-default stages an empty draft, and a read-only 查看默认 / View default expand shows the shipped prompt. Polishing is disabled by default, and while it is enabled a complete provider/model pair is required (client save-skip and Host validation agree; a partial or empty pair is invalid, not a no-polish state). This page supersedes the former `settings.plugin.item` card (D-017 supersedes D-011).

The card's editable state comes from the Host `getSettings()` view: `writable` mirrors the dsh settings provider (`settings.writable`; the shipped file provider is always writable). The client controller starts from a fallback view (`available: true, writable: false, loaded: false`) and replaces it after the first successful settings RPC; a failed first fetch shows a dedicated load-failure hint and retries once after 1.5 s — it no longer impersonates the read-only state. Note the operational rule: the browser bundle updates on page refresh, but any Host-side change (wire contracts, service code) requires a `dsh web` restart; until then the strict wire validation fails and the page shows the load-failure hint.

Host validation and client validation share the helpers in `src/config.ts`; the Host-only `src/config-schema.ts` keeps `schemastery` out of the browser bundle. Credential references follow the dsh POSIX-identifier shape and contain no secret value.

## Runtime boundary

```text
Browser Client
  ├─ Web Speech live session OR MediaRecorder final capture
  ├─ conversation.input.right (idle microphone)
  ├─ conversation.input.dock (active recognition card + waveform)
  ├─ inputActions.setDraft()
  └─ dshEars/transcribe + dshEars/polish ──> Host
                                             ├─ dsh ctx.llm
                                             ├─ whisper process
                                             └─ configured cloud endpoint
```

The client receives `remote.dshEars` through a Cordis child scope created after the Typert contribution is mounted. Controllers and React callbacks receive the concrete namespace rather than retaining an unscoped remote object.

## Public-quality target

The project is intended to become a durable community package. Maintain English-first source/docs/context, narrow compatibility claims, deterministic builds, focused tests, real dsh smoke evidence, security boundaries, and atomic history. Do not add a legal license, push, publish, or create release tags without an explicit release decision.

## Current hardening invariants

- The settings controller stages edits as drafts and commits them only through the Save/Discard buttons (D-026): validation is per-field and immediate (D-024), an invalid draft blocks the whole save and keeps the drafts, a Host rejection keeps the drafts with the saveFailed line, discard clears everything staged, empty text clears a field on save (the API key keeps absent=keep with a staged clear), and a mid-save edit survives the in-flight write. There is no unified cross-field validity sweep, and the microphone keeps reading persisted settings. Whisper download, cancel, delete, and polling responses are generation-checked so an older response cannot replace a newer operation or model selection.
- Host final ASR requests are bounded: audio and response sizes remain limited, Cloud ASR has a 120-second request timeout, already-aborted probes/transcribes short-circuit, and unknown backend/model identifiers are rejected rather than mapped to a real default.
- The polish flow bounds streamed output and checks cancellation again after Remote resolution; a late result from a Remote implementation that ignores cancellation cannot write into an unmounted draft. MediaRecorder start failures release tracks and make the session terminal.
- Host and Client Remote descriptors must agree on endpoint IDs, parameter wire shapes, codecs, result schemas, and cancellation metadata. The parity test in `tests/remote-contract.test.ts` is the regression guard for the two hand-written descriptor faces.
- Whisper model downloads are trustworthy only through their `.dsh-ears-done` completion marker; `transcribe()` pre-flights CLI availability and the marked model file, discovery failures are negative-cached for 30 seconds, and the model manager is disposed with the plugin scope. Windows launcher probing (`python.exe`/`py.exe` + PATHEXT) is implemented but not yet smoke-tested; `medium` and larger models are documented as impractical on the CPU + 120-second path.
- The composer microphone grays itself out (D-021) on positive unavailability signals only: the Host reports the selected backend unavailable, the Whisper model is downloading, or the model file with its marker is missing. Loading/failed/unknown states and all active flow states keep the button enabled so the stop affordance is never gated.
- The voice-input shortcut (D-028) is in-page only and toggles the same microphone session action: idle press starts, recording press stops, transcribing/polishing presses are ignored, and `event.repeat`/IME composition never triggers it. The listener ignores events inside `[role="dialog"]` (the settings window included), non-visible pages, and hidden conversation views (`offsetParent === null`). A gated microphone turns the press into a focus of the grayed button so the existing bilingual tooltip explains the unavailability; no recording happens. The stored chord is a canonical `ctrl+shift+space`-style string validated on both faces by `src/shortcut.ts`; typing-key, bare-text-action, and modifier-only chords are rejected, browser/OS-reserved chords only warn, and the field can never be empty (Reset restores the default).

## Open protocol boundaries

- `transcribe()` reads recognition settings when the Host RPC begins. Snapshotting backend/model/language in the recording-start request or locking settings during capture are both viable, but neither is silently chosen because it changes the first-release protocol.
- D-019 (Whisper cache integrity after a Host crash) is closed by the completion sidecar recorded in D-020.

## Design research

- `.agent/research/validation-timing-patterns.md` — industry validation-timing/messaging patterns (Ant, Arco, GOV.UK, Material, Fluent, VS Code) that informed D-024's per-field model.
- `.agent/research/form-library-evaluation.md` — why no third-party form library is adopted (D-025).
