# Project context

## Purpose

`dsh-ears` is a DeepSeek Harness voice-input plugin:

```text
microphone → transcription → optional dsh LLM polishing → editable draft → manual send
```

The user always remains in control of the final send action.

## Official dsh documentation

- Site: [DeepSeek Harness quickstart](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart)
- Plugin tutorials: [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/), [插件配置](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config), [打包与安装](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish), [生命周期](https://deepseek-harness.github.io/deepseek-harness/develop/framework/)
- Source of those pages: `docs/user/develop/` in [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

Those tutorials cover Host `apply` / `inject` / `ctx.effect`, cordis.yml `Config` + Schemastery, `dsh.bundle.patch`, and `dsh plugin add`. dsh-ears also uses the browser `dsh.client` half, `settings.section`, `conversation.input.*` slots, and Typert remotes — verify those against the installed packages, not only the basic tutorial.

## Compatibility

- Supported dsh targets: `0.1.0-rc.6` and `0.1.0-rc.7` (D-030).
- Node: `^22.19.0 || >=24.0.0`.
- No compatibility claim for another dsh release until it has been tested.

## Product boundaries

- The microphone is a compact dsh toolbar control in the composer.
- Configuration belongs to a dedicated `settings.section` page (`dsh-ears`), not a Plugins-page card (D-017 supersedes D-011).
- Polishing uses any provider/model route already configured in dsh. The plugin stores the route selection and an optional prompt only. It never owns an LLM API key, base URL, or provider credential flow.
- Emotion recognition and emotion UI are deferred (D-015).
- No automatic send and no invisible backend switching during one recording.

## Package faces

```text
Host (`exports["."]`)
  ├─ Cordis lifecycle
  ├─ native dsh settings scope
  ├─ cloud ASR provider registry and per-provider write-only role('secret') keys
  ├─ local Whisper CLI adapter
  ├─ OpenAI-compatible and DashScope cloud ASR adapters
  ├─ dsh `ctx.llm` route discovery and polishing
  └─ strict Typert Remote descriptors

Browser (`exports["./client"]`)
  ├─ `conversation.input.right` microphone contribution
  ├─ session-scoped `conversation.input.dock` recognition card with live waveform
  ├─ Web Speech live recognition
  ├─ MediaRecorder capture for final ASR backends
  ├─ dedicated `settings.section` page (id `dsh-ears`, order 16)
  └─ `inputActions.setDraft()` with stale-result protection
```

## ASR architecture

### Web Speech

`WebSpeechSession` configures the browser `SpeechRecognition` / `webkitSpeechRecognition` API for the selected language, continuous recognition, interim results, and one alternative. Interim and final text update the editable draft. Errors preserve the draft. Teardown uses a silent abort that cannot write into an unmounted UI.

### Local Whisper

The browser records a bounded one-shot encoded audio payload. The Host writes it to a private `mkdtemp()` directory and invokes the configured `whisper` executable with an argument array (never a shell). Model weights stay owned by the user's Host installation.

Model availability uses `dshEars/getWhisperModelState` and `dshEars/downloadWhisperModel`. A model file counts as downloaded only when a `.dsh-ears-done` completion marker sits beside it (D-020). `transcribe()` rejects a missing CLI or unmarked model instead of auto-downloading inside the 120-second transcription timeout. The manager is disposed with the plugin scope. Windows `python.exe` / `py.exe` + PATHEXT probing is implemented but not yet smoke-tested. `medium` and larger models are documented as impractical on the CPU + 120-second path.

### Cloud ASR

A Host-side registry (`src/asr/providers.ts`) owns Groq, Bailian, and Custom:

- Groq: pinned OpenAI-compatible endpoint, live `GET {baseUrl}/models` listing, required inline key.
- Custom: user HTTP(S) `/audio/transcriptions` endpoint, `whisper-1` default.
- Bailian (Alibaba Cloud Model Studio): DashScope sync `multimodal-generation` at `{origin}/api/v1/services/aigc/multimodal-generation/generation`. Qwen3-ASR-Flash and Fun-ASR-Flash / Qwen-Audio-3.0-ASR-Flash use different request shapes. Filetrans and realtime are not implemented. Recordings cap at 300 seconds.

Each provider has its own write-only `role('secret')` key (D-023, D-032). The Host settings file groups them as `groq`, `customOpenAi`, and `bailian`. The plugin wire uses `cloudAsrGroqApiKey`, `cloudAsrCustomApiKey`, and `cloudAsrBailianApiKey`. `getSettings` redacts secrets and reports configured booleans. `updateSettings` uses absent=keep / set / empty=clear per key. The browser never receives a key value. A first read rewrites a previous flat `cloudAsrApiKey` file into the grouped form.

This reverses D-014's dsh credential-reference model for the cloud ASR surface. LLM polishing still uses dsh-owned credentials.

## Draft and polishing flow

`src/client/voice-flow.ts` is shared by the microphone and tests. Final ASR refuses to overwrite a draft the user changed while transcription was pending. The recognition bar names each stage on the dock card. Polishing runs only when `polishingEnabled` is on; an empty local provider/model pair still asks the Host, which uses the stored route. An incomplete pair leaves polishing dormant (D-024). The raw transcript is written first. A late polish result applies only if the composer still holds that raw draft or the pre-transcript base. A route failure stays on the bar as `polish-error` and keeps the raw text.

## Settings

The Host registers `dsh-ears` under the `dsh-ears` settings namespace. The browser registers `settings.section` id `dsh-ears` (nav order 16). Tabs:

- **General** (default landing): voice-shortcut enable + recorder (default `ctrl+shift+space`), voice-sound toggle, display name (`dsh-ears` or Voice / 语音), language (empty = follow the dsh English/中文 locale), recording limit (default 120 seconds).
- **Recognition**: grouped backend/provider menu (Local: Web Speech / Local Whisper; Cloud: Groq / Bailian / Custom), Whisper model lifecycle, per-provider key/endpoint/host/model.
- **Polishing**: enable toggle, dsh provider/model/reasoning-effort, custom prompt (D-029).
- **About**: repository, installed version, MIT, dsh range, click-only npm `latest` check (D-033).

Save model is per-field auto-save (D-031, supersedes D-026 Save/Discard): a 400 ms debounce, text-field blur, or section unmount flushes persistable fields. An invalid draft is skipped and stays local with a red hint. A Host rejection keeps the drafts, shows `saveFailed`, and does not retry in a loop. Empty text clears a field on flush (API keys keep absent=keep with a staged clear). Validation is per-field and edit-scoped (D-024): untouched fields are never marked invalid; unconfigured-but-valid states render quietly.

The composer microphone reads persisted settings only. Host-side changes (wire contracts, service code) require a `dsh web` restart; the browser bundle updates on refresh.

Host validation and client validation share `src/config.ts`. `src/config-schema.ts` keeps `schemastery` out of the browser bundle.

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

The client receives `remote.dshEars` through a Cordis child scope created after the Typert contribution is mounted.

## Hardening invariants

- Settings auto-save valid drafts (D-031). There is no unified cross-field validity sweep and no Save/Discard footer.
- Host final ASR requests are bounded. Cloud ASR has a 120-second timeout. Unknown backend/model identifiers are rejected.
- Host and Client Remote descriptors must agree on endpoint IDs, parameter shapes, codecs, result schemas, and cancellation metadata (`tests/remote-contract.test.ts`).
- Whisper downloads are trustworthy only through their `.dsh-ears-done` marker. Discovery failures are negative-cached for 30 seconds.
- The composer microphone grays out (D-021) on positive unavailability signals only. Active flow states stay enabled so stop remains reachable. Cloud readiness (key + model, plus Bailian host) is folded into the cloud backend's availability signal.
- The voice shortcut (D-028) is in-page only. Idle starts, recording stops, transcribing/polishing is ignored. IME composition and key auto-repeat never trigger it. Events inside `[role="dialog"]` and hidden views are ignored. A gated microphone focuses the gray button instead of recording. Stored form is a canonical `ctrl+shift+space`-style string. Modifier-only chords are valid. Bare typing keys and Alt/Option+letter chords are rejected. The field cannot be empty; Reset restores the default.

## Open protocol boundaries

- `transcribe()` reads recognition settings when the Host RPC begins (D-018). Snapshotting backend/model/language at recording start, or locking settings during capture, is not silently chosen.
- D-019 is closed by the D-020 completion sidecar.

## Design research

Optional evidence, not a live spec:

- [`.agent/research/validation-timing-patterns.md`](./research/validation-timing-patterns.md) — D-024
- [`.agent/research/form-library-evaluation.md`](./research/form-library-evaluation.md) — D-025
- [`.agent/research/voice-dictation-shortcuts.md`](./research/voice-dictation-shortcuts.md) — D-028
