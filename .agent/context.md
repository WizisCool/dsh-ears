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

- Published maintenance line: dsh-ears versions before 0.3.0 support dsh through `0.1.1-rc.2` under D-035.
- Current release line: dsh-ears `0.3.0` targets only the breaking dsh 0.1.2 family, compiles and smokes against exact `0.1.2-rc.1`, and declares a strict `^0.1.2-rc.1` floor (D-050). Users on dsh 0.1.1 must install dsh-ears `<0.3.0`; there is no runtime compatibility layer.
- Node: `^22.19.0 || >=24.0.0`.
- Promotion from `next`, npm publication, and release tags require explicit authorization after automated certification and the Windows browser release smoke.

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
  ├─ bundled whisper.node native runtime and model lifecycle
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

The browser records a bounded one-shot payload, downmixes and resamples it to mono 16 kHz PCM16 WAV, and sends it through the final Host RPC. The Host writes the WAV to a private `mkdtemp()` directory and uses the bundled whisper.node native context. Model weights stay in the plugin's separate local model cache.

Model availability uses `dshEars/getWhisperModelState` and `dshEars/downloadWhisperModel`. A model file counts as downloaded only when a `.dsh-ears-done` completion marker sits beside it (D-020). `transcribe()` rejects an unavailable native runtime or unmarked model instead of auto-downloading inside the 120-second transcription timeout. The native runtime is disposed with the plugin scope. The selected Default/Vulkan/CUDA variant is fixed after first native load, so changing acceleration requires a dsh Host restart.

### Cloud ASR

A Host-side registry (`src/asr/providers.ts`) owns Groq, Deepgram, Bailian, Tencent Cloud, MiMo, SiliconFlow, Volcengine, and Custom:

- Groq: pinned OpenAI-compatible endpoint, live `GET {baseUrl}/models` listing, required inline key.
- Deepgram: Listen V1 REST (`/v1/listen`) and streaming (`wss://…/v1/listen`) protocols at `api.deepgram.com` with `recording-file` and `realtime` services, `nova-3` default model, automatic language detection on pre-recorded audio (`detect_language=true`), and smart formatting. The in-repo adapters issue only Listen V1, so a model that requires a newer generation is not executable here: Flux models need Listen V2 `/v2/listen` and are kept out of both services. Whisper Cloud is pre-recorded only, so its streaming flag is forced off even though the live `/v1/models` catalog reports `streaming: true` for every Whisper entry.
- Custom: user HTTP(S) `/audio/transcriptions` endpoint, `whisper-1` default.
- Bailian (Alibaba Cloud Model Studio): DashScope sync `multimodal-generation` at `{origin}/api/v1/services/aigc/multimodal-generation/generation`. Qwen3-ASR-Flash and Fun-ASR-Flash / Qwen-Audio-3.0-ASR-Flash use different request shapes. Filetrans and realtime are not implemented. Recordings cap at 300 seconds.
- Tencent Cloud: one provider entry with `recording-file` and `realtime` service choices. Standard recording uses the Host-side API 3.0 `CreateRecTask` and `DescribeTaskStatus` calls; realtime uses a Host-owned WebSocket session and browser PCM chunks. AppID, SecretID, SecretKey, engine type, audio payloads, and signing material stay inside the Host adapter.
- Xiaomi MiMo: one provider entry with `api` and `token-plan` service choices. Token Plan supports `cn`, `sgp`, and `ams` regional clusters. Requests use OpenAI-compatible Chat Completions with `input_audio` WAV payloads. The browser normalizes audio to mono 16 kHz PCM16 WAV before transmission.
- SiliconFlow: CN edition preset over the OpenAI-compatible transcription adapter. The model listing appends `sub_type=speech-to-text` through the registry `modelQuery` (D-047). The international edition is deferred (D-047).
- Volcengine: one provider entry with `recording-file` and `realtime` service choices (D-048). Recording file uses the big-model submit/query tasks with base64 direct upload; realtime uses a Host-owned one-way streaming WebSocket with binary-framed browser PCM chunks and a silence end marker carrying the negative-sequence last flag. Both services authenticate with the new-console `X-Api-Key` only and select a resource id per service while `model_name` stays `bigmodel`. Legacy console auth, the bidirectional streaming interface, and the flash/idle recording variants are out of scope (D-048).

Each provider has its own write-only `role('secret')` key (D-023, D-032, D-040, D-043, D-044, D-047, D-048). The Host settings file groups them as `groq`, `deepgram`, `customOpenAi`, `bailian`, `tencent`, `mimo`, `siliconflow`, and `volcengine`. The plugin wire uses explicit per-provider fields, including `cloudAsrDeepgramApiKey`, `cloudAsrTencentSecretKey`, and `cloudAsrMimoApiKey`; `getSettings` redacts secrets and reports configured booleans. `updateSettings` uses absent=keep / set / empty=clear per key. The browser never receives a key value. A first read rewrites a previous flat `cloudAsrApiKey` file into the grouped form.

Model catalogs may include provider-reported capability metadata in addition to model IDs. The selected provider service determines which capability is executable; the registry and browser controller apply that mapping to live catalogs and explicit fallback metadata. A model must both report the capability the service needs and be executable by the in-repo adapter, so a capability and an adapter transport gate are applied together. Two distinct compatibility cases stay separate: when an entire catalog carries no capability metadata at all — an older Host or endpoint — the model list is passed through unchanged for compatibility; when a catalog does carry capability metadata but one model is missing its entry, that single model is filtered conservatively and is not offered for a mapped service. Projected metadata is also corrected against provider architecture metadata rather than model names. An already-saved or manually entered model remains visible as a custom selection so catalog refresh cannot silently erase user configuration.

This reverses D-014's dsh credential-reference model for the cloud ASR surface. LLM polishing still uses dsh-owned credentials.

## Draft and polishing flow

`src/client/voice-flow.ts` is shared by the microphone and tests. Final ASR refuses to overwrite a draft the user changed while transcription was pending. The recognition bar names each stage on the dock card. Polishing runs when `polishingEnabled` is on; an empty local provider/model pair asks the Host to use dsh's `agent-default-model` selection, including its reasoning setting. A complete local pair still takes precedence, and an explicit local reasoning value overrides the Agent default. The raw transcript is written first. A late polish result applies only if the composer still holds that raw draft or the pre-transcript base. A route failure stays on the bar as `polish-error` and keeps the raw text.

Host `transcribe()` and `polish()` return the strict `RemoteTextResult` union: `{ status: 'ok', text }` for completed work or `{ status: 'error', code, message, params? }` for a business failure. Business failures are result values because the Remote gateway normalizes arbitrary thrown errors; caller cancellation and Typert `RemoteError` values remain thrown so gateway cancellation and boundary policy stay authoritative. The browser carries recognized error codes and interpolation parameters through `VoiceInputSession`, then localizes the microphone tooltip and recognition card from the active `settings.dshEars` catalog. Unknown codes or missing interpolation data fall back to the supplied diagnostic or the generic voice error.

## Settings

Persisted Host configuration is organized into four fixed slots: `general`, `recognition`, `cloudAsr`, and `polishing`. The flat Remote wire is retained as a compatibility adapter for the existing per-field client drafts; no registry, factory, or generic slot abstraction is introduced.

The Host registers `dsh-ears` under the `dsh-ears` settings namespace. The browser registers `settings.section` id `dsh-ears` (nav order 16). Tabs:

- **General** (default landing): voice-shortcut enable + recorder (default `ctrl+shift+space`), voice-sound toggle, display name (`dsh-ears` or Voice / 语音), recording limit (default 120 seconds).
- **Recognition**: grouped backend/provider menu (Local: Web Speech / Local Whisper; Cloud: Groq / Deepgram / Bailian / Tencent Cloud / MiMo / SiliconFlow / Volcengine / Custom), Whisper model lifecycle, Default/Vulkan/CUDA acceleration selector, and per-provider key/endpoint/host/model. Web Speech is the default backend for new or incomplete settings, so a fresh install works without a model download; Local Whisper remains selectable and its `default` acceleration is resolved by the Host from platform-supported and installed native variants. Each backend branch carries its own recognition-language row (none for Tencent Cloud; D-042): empty follows the dsh English/中文 locale for Web Speech and means automatic detection — the language parameter is omitted — for Local Whisper, Groq, Bailian, and custom OpenAI-compatible; Tencent Cloud keeps engine type as its language/engine selector with no separate row. Tencent Cloud, Deepgram, and Volcengine expand to a service selector with standard recording and realtime recognition enabled; Volcengine shows one resource-id row per service and keeps one shared recognition-language row (D-042, D-048); hovering a resource-id select shows the raw id in the shared tooltip primitive. MiMo expands to an access-method selector (`api` or `token-plan`) with a regional cluster row for Token Plan. Changing acceleration after the first native load requires restarting the dsh Host.
- **Polishing**: enabled by default, with an optional dsh provider/model/reasoning-effort override; blank persisted route fields follow `agent-default-model`, while the settings card displays its current real provider/model without saving that projection, and the custom prompt remains available (D-029).
- **About**: repository, installed version, MIT, dsh range, click-only npm `latest` check (D-033).

User-facing copy never ends with a full stop in either locale, across hints, errors, statuses, and notices (D-038); multi-sentence strings use commas or semicolons, and internal jargon such as "Host" is avoided. `tests/locale.test.ts` enforces the no-full-stop rule.

Save model is per-field auto-save (D-031, supersedes D-026 Save/Discard): a 400 ms debounce, text-field blur, or section unmount flushes persistable fields. An invalid draft is skipped and stays local with a red hint. A Host rejection keeps the drafts, shows `saveFailed`, and does not retry in a loop. Empty text clears a field on flush (API keys keep absent=keep with a staged clear). Validation is per-field and edit-scoped (D-024): untouched fields are never marked invalid; unconfigured-but-valid states render quietly.

Canonical persistence remains nested fixed slots; the flat Remote shape is a compatibility projection. Provider field-to-storage mappings and secret paths are derived from the Cloud ASR registry, while historical aliases stay explicit in migration code. The browser controllers use latest-intent guards: save revisions preserve newer drafts across an older response, model catalog requests cancel and ignore stale results, credential edits and discarded provider switches invalidate catalogs until the persisted settings can be queried again, route/reasoning responses are request-scoped, and Whisper download/cancel/delete mutations do not overlap.

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
- Realtime sessions own their socket and idle timer; open failure, open timeout, external abort, failed send, finish, cancel, idle expiry, Host disposal, and aborted browser startup all release the session. A normal socket close is only a successful finish after a terminal metadata message or a final result, so an incomplete stream never becomes an empty success. Local Whisper model deletion crosses an exclusive context-release barrier: the active job is stopped, the native context is released, and the backing file is removed before any queued transcription may reopen the model.
- Strict Remote result objects keep optional fields absent rather than explicitly `undefined`; the wire test replays the gateway's JSON-safety check (D-036).
- Local Whisper uses the bundled native package and a separately downloaded whisper.cpp GGML model. Browser capture is normalized to mono 16 kHz PCM16 WAV. Runtime failures stay concise: the settings page reports native package or selected acceleration unavailability, with no Python/FFmpeg/CLI setup guide.
- The composer microphone grays out (D-021) on positive unavailability signals only. Active flow states stay enabled so stop remains reachable. Cloud readiness (key + model, plus Bailian host) is folded into the cloud backend's availability signal.
- The voice shortcut (D-028) is in-page only. Idle starts, recording stops, transcribing/polishing is ignored. IME composition and key auto-repeat never trigger it. Events inside `[role="dialog"]` and hidden views are ignored. A gated microphone focuses the gray button instead of recording. Stored form is a canonical `ctrl+shift+space`-style string. Modifier-only chords are valid. Bare typing keys and Alt/Option+letter chords are rejected. The field cannot be empty; Reset restores the default.

## Open protocol boundaries

- `transcribe()` reads recognition settings when the Host RPC begins (D-018). Snapshotting backend/model plus the per-provider recognition-language fields (D-042) at recording start, or locking settings during capture, is not silently chosen.
- D-019 is closed by the D-020 completion sidecar.

## Design research

Optional evidence, not a live spec:

- [`.agent/research/validation-timing-patterns.md`](./research/validation-timing-patterns.md) — D-024
- [`.agent/research/form-library-evaluation.md`](./research/form-library-evaluation.md) — D-025
- [`.agent/research/voice-dictation-shortcuts.md`](./research/voice-dictation-shortcuts.md) — D-028
