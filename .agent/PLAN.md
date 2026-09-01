# dsh-ears product plan

English-first, public-safe plan for a DeepSeek Harness voice-input plugin. Runtime Chinese prompt text is product data and may stay Chinese where the user experience requires it.

## Goal

Give the dsh Web UI a native-feeling voice input flow:

```text
microphone → live transcript → optional dsh LLM polish → editable draft → manual send
```

The implementation supports browser Web Speech, Host-side local Whisper through the bundled `@fugood/whisper.node` native dependency, Groq, Deepgram, Alibaba Cloud Model Studio (Bailian / DashScope), Tencent Cloud standard recording file recognition and real-time speech recognition, Xiaomi MiMo (standard API and Token Plan subscription), SiliconFlow CN cloud ASR, Volcengine streaming and recording-file recognition, and a custom OpenAI-compatible cloud ASR backend. Local Whisper models are separate whisper.cpp GGML downloads; the browser normalizes captured audio to mono 16 kHz PCM16 WAV. Web Speech may send audio to a browser vendor, so “zero cost” must not be described as “local/private recognition”.

## Status

M1–M6 and the first-release product surface through D-033 are implemented. The first public release (`0.1.0`, public GitHub, npm) was authorized on 2026-08-19; the rc.8 compatibility patch (`0.1.1`, D-034) followed on 2026-08-20. Later publish, tag, and visibility changes still need an explicit maintainer decision (D-009).

The `master` / npm `latest` 0.2 maintenance line supports dsh `0.1.0-rc.6` through `0.1.1-rc.2` (D-030, extended by D-034 and D-035). The `next` 0.3 development line targets the dsh 0.1.2 family, initially exact `0.1.2-alpha.3`, and does not extend the stable line's support claim (D-049). Both lines require Node `^22.19.0 || >=24.0.0`.

## Architecture

The package has two faces:

- Host: Cordis lifecycle, Host RPC, native `settings.section`, local/cloud ASR, and dsh `ctx.llm`.
- Browser: composer microphone, session-scoped recognition card, Web Speech, MediaRecorder capture for final ASR, and `inputActions.setDraft()`.

Web Speech runs in the browser and is not a PCM recorder. Local Whisper and file-based cloud ASR use a separate MediaRecorder source and a final-result Host RPC; Tencent realtime recognition uses a Host-owned WebSocket session with browser PCM chunks. Local Whisper receives browser-normalized mono 16 kHz PCM16 WAV, then uses a persistent whisper.node context. The first release does not switch backends during one recording.

After recording stops, polishing runs on the Host through dsh's existing LLM runtime and credentials. The plugin stores a selected `{ provider, model }` route, not a second provider configuration.

Durable detail lives in [`context.md`](./context.md). Live versus superseded decisions live in [`decisions.md`](./decisions.md).

Four fixed Host configuration slots organize persisted settings: `general`, `recognition`, `cloudAsr`, and `polishing`. The Remote/browser view remains flat for compatibility and per-field auto-save; no slot registry, factory, or generic configuration framework is used.

## Current product surface

- Composer microphone in `conversation.input.right` and a Task/Goal-style recognition card in `conversation.input.dock` (D-027). While transcribing or polishing, the stop square becomes a trash control that discards the in-flight voice task.
- Settings page `dsh-ears` (`settings.section` id `dsh-ears`, nav order 16) with General, Recognition, Polishing, and About tabs (D-017, D-028, D-033). Rows are uncarded General-style hairlines with per-field auto-save (D-031): valid drafts flush after 400 ms, on blur, or on unmount. There is no Save/Discard footer.
- Web Speech is the default recognition backend for new or incomplete settings, so a fresh install works without a model download; Local Whisper remains selectable and its `default` acceleration uses the Host's automatic platform/native-variant selection (D-046).
- Polishing is enabled by default and uses dsh's live `agent-default-model` selection when the dsh-ears route fields are empty (D-045).
- Voice shortcut default `Ctrl+Shift+Space` (D-028). Modifier-only chords are valid. Bare typing keys and Alt/Option+letter chords are rejected. Reserved browser/OS chords warn amber.
- Cloud ASR keys are per-provider Host `role('secret')` fields (D-023, D-032). The browser never reads a key value.
- Custom polish system prompt on the Polishing tab (D-029). Blank uses the built-in ASR-cleaning contract.
- Runtime settings and voice-error copy is registered in Chinese and English under `settings.dshEars`. Host voice business failures cross the strict Remote boundary as stable code/message/parameter result values, and the browser localizes them in the microphone tooltip and recognition card.
- About tab: identity rows and a click-only Host npm `latest` check that never installs (D-033).

## Open gates

1. D-018 remains open: `transcribe()` reads backend/model/language when the Host RPC begins — "language" now meaning the per-provider recognition-language fields (D-042). Snapshotting those settings at recording start, or locking them during capture, needs an explicit protocol decision.
2. Live Groq, Bailian, Tencent Cloud, `zh`, and Windows smokes are still pending. Windows launcher probing is implemented but not smoke-tested on Windows.
3. The 0.3 development line may be pushed to `next`, but npm publication, release tags, and promotion to `master` require a separate maintainer decision. Promotion begins only after upstream npm `latest` selects a 0.1.2 release and the D-049 gates pass.
4. Emotion recognition/UI stays deferred (D-015). Tencent Cloud standard recording and realtime services share one provider configuration and keep credentials on the Host.

## dsh integration

- Published `dsh.bundle.patch` activates the Host entry. `dsh.client` declares the browser package.
- Development `.dsh/cordis.patch.yml` is machine-local and HMR-only. Install the plugin once with `dsh plugin --profile web add <path>`; the development patch must not insert a second loader entry.
- Browser slots: `conversation.input.right`, `conversation.input.dock`, `settings.section`.
- Client Remote calls use a Cordis child scope that injects `remote.dshEars`.
- Host rejects oversized audio, unknown backend/model identifiers, and embedded URL credentials. Cloud ASR requests time out at 120 seconds. Polish output is bounded and falls back to the raw transcript.

## Package shape

```text
dsh-ears/
├── package.json              # Host/Client/typert/remote exports and dsh manifests
├── cordis.patch.yml          # Published bundle patch
├── README.md                 # Chinese-first public landing page
├── README.en.md
├── AGENTS.md                 # Coding-agent operating manual
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── assets/                   # README banner
├── .agent/                   # Plan, architecture, ADRs, optional research
├── src/
│   ├── index.ts              # Host plugin entry
│   ├── client.ts / client/   # Browser composition
│   ├── asr/                  # Web Speech, Whisper, Groq, Deepgram, Bailian, Tencent Cloud, MiMo, SiliconFlow, Volcengine, custom
│   ├── polish/               # Host LLM polish
│   ├── config.ts             # Shared constants and validation
│   ├── config-schema.ts      # Host-only schemastery schema
│   ├── shortcut.ts           # Shared voice-shortcut logic
│   └── remote-contract.ts    # Strict Host/Client wire schemas
└── tests/
```

## Quality bar

- English-first documentation and issue-ready reproduction guidance.
- Deterministic builds, focused tests, and real dsh smoke verification.
- No secrets or machine-local paths in tracked content.
- Narrow compatibility claims. Atomic, reviewable commits.

## References

- [DeepSeek Harness development guide](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [DeepSeek Harness GitHub repository](https://github.com/deepseek-ai/deepseek-harness)
- Stable-line `@deepseek-ai/dsh-*` packages at `0.1.1-rc.2` (open peer policy, D-035); development-line packages at `0.1.2-alpha.3` with the strict 0.1.2 floor (D-049)
