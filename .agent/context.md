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
  ├─ native `settings.plugin.item` card
  └─ `inputActions.setDraft()` with stale-result protection
```

## ASR architecture

### Web Speech

`WebSpeechSession` configures the browser `SpeechRecognition`/`webkitSpeechRecognition` API for the selected language, continuous recognition, interim results, and one alternative. Interim and final text update the editable draft. Errors preserve the draft. Normal stop emits `onEnd` once; component teardown calls a silent abort that cannot write into an unmounted UI.

### Local Whisper

The browser records a bounded one-shot encoded audio payload. The Host writes it to a private `mkdtemp()` directory and invokes the configured `whisper` executable with an argument array. The adapter uses JSON output, enforces time/size limits, forwards cancellation, and removes the directory in `finally`. Model weights remain owned by the user's Host installation.

### OpenAI-compatible cloud ASR

The Host sends multipart form data containing `file`, `model`, and optional language to an explicit HTTP(S) endpoint. The response must be JSON with a string `text` field. Audio and response sizes are bounded. Embedded URL credentials are rejected. An optional dsh credential reference is resolved per operation and only the resulting bearer header is sent from the Host.

## Draft and polishing flow

`src/client/voice-flow.ts` is pure flow logic shared by the microphone component and tests. Final ASR refuses to overwrite a draft changed while transcription was pending. Polishing first leaves the raw transcript in the draft; a late result is ignored after a manual edit, and any route failure/cancellation leaves usable raw text.

## Settings

The Host registers `dsh-ears` under the `dsh-ears` settings namespace. The native card edits language, recording limit, backend, local Whisper model, cloud endpoint/model/credential reference, polishing toggle, and dsh provider/model route. An empty provider/model pair is the explicit no-polish state.

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
