# Project Context

## Purpose

`dsh-ears` is a DeepSeek Harness voice-input plugin. It adds a Codex Desktop-like interaction to the dsh Web UI:

```text
microphone → transcription → optional dsh LLM polishing → editable draft → manual send
```

The user must always remain in control of the final send action.

## Compatibility

- First supported dsh target: `0.1.0-rc.6`.
- First supported Node range: `^22.19.0 || >=24.0.0`.
- The repository makes no compatibility claim for another dsh release until it has been tested.

## Product boundaries

- The microphone is a compact dsh toolbar control in the composer.
- Configuration belongs to dsh's native Plugins settings page through `settings.plugin.item`.
- Polishing uses any provider/model route already configured in dsh. The plugin stores the route selection only.
- The plugin never owns an LLM API key, base URL, provider, or model credential flow.
- Emotion recognition and emotion UI are intentionally deferred.
- No automatic send and no invisible backend switching during one recording.

## Package faces

```text
Host (`exports["."]`)
  ├─ Cordis lifecycle
  ├─ native dsh settings scope
  ├─ dsh credential-reference resolution
  ├─ local Whisper CLI adapter
  ├─ OpenAI-compatible cloud ASR adapter
  ├─ dsh `ctx.llm` route discovery and polishing
  └─ strict Typert Remote descriptors

Browser (`exports["./client"]`)
  ├─ `conversation.input.right` microphone contribution
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

Model availability is surfaced through `dshEars/getWhisperModelState` and `dshEars/downloadWhisperModel`: the Host discovers the installed whisper's Python interpreter (whisper CLI shebang first — Homebrew/pipx venvs — then platform-specific PATH probes with a fast `importlib.util.find_spec` check that never imports the heavy module), reports CLI availability and the library-computed cache file, and downloads missing models through `whisper._download` (the library's own URLs/checks) with tqdm-stderr progress parsing. Downloads are single-flight; discovery self-heals after ENOENT so upgraded Homebrew Cellar paths recover on the next query. The client reuses the row's hint line as the status: a spinner plus "checking" text while the first (torch-importing) table load runs, then downloaded / not-downloaded text with a click-to-download link, or progress with a cancel link while downloading; a downloaded model additionally shows a danger delete link with a two-step inline confirm. `dshEars/deleteWhisperModel` removes the library-computed cache file (refusing while a download runs), and cancelling a download also removes its partial file. No state dots are rendered. The authoritative `import whisper` model table is loaded once per Host process, so later queries are plain file stats (≈3 s first query, then instant); the client polls every 800 ms while a download runs.

### OpenAI-compatible cloud ASR

The Host sends multipart form data containing `file`, `model`, and optional language to an explicit HTTP(S) endpoint. The response must be JSON with a string `text` field. Audio and response sizes are bounded. Embedded URL credentials are rejected. An optional dsh credential reference is resolved per operation and only the resulting bearer header is sent from the Host.

## Draft and polishing flow

`src/client/voice-flow.ts` is pure flow logic shared by the microphone component and tests. Final ASR refuses to overwrite a draft changed while transcription was pending. Polishing first leaves the raw transcript in the draft; a late result is ignored after a manual edit, and any route failure/cancellation leaves usable raw text.

## Settings

The Host registers `dsh-ears` under the `dsh-ears` settings namespace. The browser face registers a dedicated `settings.section` page (`dsh-ear`, nav order 16 — between Plugins and Agent presets) styled with the shipped pages' semantic tokens and card geometry; it splits fields into Plugins-style tab cards — Recognition (backend, Whisper model, cloud endpoint/model/credential reference, language, recording limit) and Polishing (toggle plus dsh provider/model route) — with roving tabindex and arrow-key navigation. Backend labels are clean (`Web Speech` / `Local Whisper` / `Cloud ASR`), only the active backend's configuration rows are rendered, and the selector's hint text follows the active backend; the active-backend selector only points at the backend used for the next recording, and each backend's settings persist independently across switches. Fields follow the General/Permissions row pattern (title + hint left, pill `Menu` selector or compact text input right, hairline dividers) and auto-save on a 400 ms debounce: valid edits persist through the Host `updateSettings` RPC, edits made mid-save are kept and committed next, invalid drafts are skipped per field (they never stall other fields), and failures keep the draft and show an error line (native pattern — no success or saving text; invalid rows tint their hint red). The Polishing tab follows the page's progressive-disclosure rule: the toggle row is always visible, and the provider/model/reasoning rows appear only after polishing is enabled. The tab shows provider/model display names only, and offers a reasoning-effort picker: the Host resolves the selected route's supported efforts through dsh `resolveModelInfo` (`dshEars/listReasoningEfforts`), stores the choice in `polishReasoningEffort` (empty = model default), and passes a validated effort into the `dshEars/polish` call; effort labels are the adapter's native names (e.g. `Off`, `High`, `Max`) plus an untranslated `Default` entry, matching the composer model selector. Switching the provider clears the model and reasoning-effort drafts (no stale models from another provider). Polishing is disabled by default, and while it is enabled a complete provider/model pair is required (client save-skip and Host validation agree; a partial or empty pair is invalid, not a no-polish state). This page supersedes the former `settings.plugin.item` card (D-017 supersedes D-011).

The card's editable state comes from the Host `getSettings()` view: `writable` mirrors the dsh settings provider (`settings.writable`; the shipped file provider is always writable). The client controller starts from a fallback view (`available: true, writable: false, loaded: false`) and replaces it after the first successful settings RPC; a failed first fetch shows a dedicated load-failure hint and retries once after 1.5 s — it no longer impersonates the read-only state. Note the operational rule: the browser bundle updates on page refresh, but any Host-side change (wire contracts, service code) requires a `dsh web` restart; until then the strict wire validation fails and the page shows the load-failure hint.

Host validation and client validation share the helpers in `src/config.ts`; the Host-only `src/config-schema.ts` keeps `schemastery` out of the browser bundle. Credential references follow the dsh POSIX-identifier shape and contain no secret value.

## Runtime boundary

```text
Browser Client
  ├─ Web Speech live session OR MediaRecorder final capture
  ├─ conversation.input.right
  ├─ inputActions.setDraft()
  └─ dshEars/transcribe + dshEars/polish ──> Host
                                             ├─ dsh ctx.llm
                                             ├─ whisper process
                                             └─ configured cloud endpoint
```

The client receives `remote.dshEars` through a Cordis child scope created after the Typert contribution is mounted. Controllers and React callbacks receive the concrete namespace rather than retaining an unscoped remote object.

## Public-quality target

The project is intended to become a durable community package. Maintain English-first source/docs/context, narrow compatibility claims, deterministic builds, focused tests, real dsh smoke evidence, security boundaries, and atomic history. Do not add a legal license, push, publish, or create release tags without an explicit release decision.
