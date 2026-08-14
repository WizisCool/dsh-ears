# dsh-ears Implementation Plan (v2.1)

> An English-first, public-safe plan for a DeepSeek Harness voice input plugin. Runtime Chinese prompt text is product data and may remain Chinese where required by the user experience.

## Goal

Give the dsh Web UI a native-feeling voice input flow:

```text
microphone → live transcript → optional dsh LLM polish → editable draft → manual send
```

The first implementation uses the browser Web Speech API. Local Whisper and cloud ASR are later backends. Web Speech API may send audio to a browser vendor, so “zero cost” must not be described as “local/private recognition”.

## Status

- M0: documentation and collaboration baseline complete.
- M1: package shape and load verification complete.
- M2: microphone button, Web Speech pipeline, dsh theme adaptation, and composer ordering fix are complete.
- M3+: not implemented.
- First compatibility target: dsh `0.1.0-rc.6` and Node `^22.19.0 || >=24.0.0`.

## Architecture

The package has two faces:

- Host face: Cordis lifecycle, Host RPC, dsh settings integration, and later `ctx.llm` access.
- Browser face: the microphone UI, Web Speech session, and `inputActions.setDraft()` updates.

M2 Web Speech runs in the browser and is not a PCM recorder. It does not provide an audio stream that can be handed to Whisper after a failure. Later audio backends therefore need their own audio source, session, chunking, cancellation, timeout, and error contracts. The first release does not promise invisible backend switching during one recording.

After recording stops, polishing runs on the Host through dsh's existing LLM runtime and credentials. The plugin stores a selected `{ provider, model }` route, not a second provider configuration.

## Confirmed decisions

| ID | Decision | Status |
|---|---|---|
| D1 | Project name is `dsh-ears`. | Accepted |
| D2 | Click to start, live transcript into an editable draft, stop, then manual send. | Accepted |
| D3 | Polishing is enabled by default and integrated into dsh settings. | Accepted |
| D4 | Users may select any provider/model route already configured in dsh. The plugin does not provide `base_url`, `api_key`, custom provider, or custom model fields for polishing. | Accepted |
| D5 | M2 uses Web Speech API. Later ASR candidates are local Whisper and cloud adapters; same-session automatic switching is not promised. | Accepted |
| D6 | Cloud ASR adapters are optional and separate from the dsh LLM polishing route. | Accepted |
| D7 | Emotion output is deferred. A result field may be reserved, but the first release has no emotion UI or setting. | Accepted |
| D8 | Development starts private; public release and package publishing require a later release decision. | Accepted |
| D9 | First release is validated only against dsh `0.1.0-rc.6`. | Accepted |
| D10 | Web Speech failure preserves the current draft and asks the user to record again. | Accepted |
| D11 | The microphone control follows the Codex composer interaction and visual hierarchy: compact circular toolbar control on the right, microphone when idle, stop square while recording, live draft updates, and manual send only. | Accepted |
| D12 | Plugin configuration is rendered in dsh's native Plugins settings page through `settings.plugin.item`; the project does not add a separate Voice settings tab or section. | Accepted |

## Package shape

```text
dsh-ears/
├── package.json              # Host/Client exports and dsh manifests
├── cordis.patch.yml          # Published bundle patch
├── tsconfig.json
├── tsconfig.build.json        # declaration-only package type build
├── tsdown.config.ts          # Host and Client build entry configuration
├── tsdown.client.ts          # dsh client-module bundle preset
├── README.md
├── AGENTS.md
├── .agent/
├── src/
│   ├── index.ts              # Host plugin entry
│   ├── client.ts             # Client package entry
│   ├── client/
│   │   ├── index.ts          # Client composition
│   │   ├── recorder.ts       # Later audio capture; not part of M2
│   │   └── settings.tsx      # dsh-native settings UI
│   ├── asr/
│   │   ├── base.ts           # Live and final-transcription contracts
│   │   ├── web-speech.ts     # M2 browser backend
│   │   ├── whisper-local.ts  # Later transformers.js backend
│   │   ├── openai-compat.ts  # Later cloud adapter
│   │   └── dashscope.ts      # Later provider-specific adapter
│   ├── polish/
│   │   ├── polish.ts         # Host-side dsh LLM orchestration
│   │   └── prompts.ts        # Product prompt text
│   ├── config.ts             # Runtime settings; no credentials
│   └── emotion.ts            # Reserved result mapping; no first-release UI
└── tests/
```

The published manifest must expose both faces and declare the two dsh mechanisms:

```json
{
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/client.d.ts",
      "default": "./lib/client.js"
    }
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": []
    }
  }
}
```

The development `.dsh/cordis.patch.yml` is machine-local and HMR-only. The plugin itself is installed into the local profile once with `dsh plugin --profile web add <path>`; the development patch must not insert a second `dsh-ears` loader entry or replace the published bundle patch.

## dsh integration contract

- The bundle patch activates the Host package entry when installed into a profile.
- `dsh.client` declares the browser package and its injected runtime dependencies.
- M2 uses `conversation.input.right` and `inputActions.setDraft()` in the browser face.
- M2 uses dsh public `data-slot` topology plus semantic CSS tokens to adapt the control to rc.6 ordering and light/dark themes.
- M2 does not use RPC, MediaRecorder, AudioWorklet, PCM, or Whisper.
- M3 uses a named plugin RPC for text-only polishing. The Host invokes dsh `ctx.llm`; the Client sends text and a route reference, never audio or credentials.
- Later audio RPC must define a channel, endpoint, payload/chunk size, cancellation, timeout, and error schema before implementation.
- Settings use the dsh-native Plugins page and its `settings.plugin.item` list slot after the rc.6 surface is verified. No standalone `settings.section` or `settings.general.item` entry is planned.

## LLM polishing

Polishing is owned by dsh:

- Discover models from dsh's configured provider/model routes.
- Store `{ provider, model }`; provider is required because model IDs may collide.
- Reuse dsh Host credentials and the dsh LLM runtime.
- Do not hardcode `deepseek-v4-flash`, `gemini-3.7-flash-high`, or any other model name as a plugin preset.
- Do not force DeepSeek-specific `thinking` fields. Reasoning mode, endpoint, and credentials belong to the selected dsh route.
- If the selected route is missing, unavailable, times out, or fails, return the original transcript and never block the draft.

The polishing prompt removes filler words, repairs likely ASR errors, restores punctuation, preserves meaning, formats explicit enumerations as lists, and treats transcript text as data rather than instructions. The runtime prompt may be Chinese; its implementation and tests remain English-documented.

## ASR contracts

The design separates live sessions from final transcription:

```ts
type ASRResult = {
  text: string
  emotion?: string
}

type AudioStream = {
  format: 'pcm_s16le' | 'encoded'
  sampleRate?: number
  channels?: number
  chunks: AsyncIterable<Uint8Array>
}

interface LiveASRSession {
  onInterim(callback: (text: string) => void): () => void
  onFinal(callback: (text: string) => void): () => void
  onError(callback: (error: Error) => void): () => void
  stop(): Promise<ASRResult>
  abort(): void
}

interface ASRBackend {
  id: string
  displayName: string
  mode: 'live' | 'final'
  isAvailable(): Promise<boolean>
  startLive?(options: { language: string; signal: AbortSignal }): Promise<LiveASRSession>
  transcribeFinal?(stream: AudioStream, options: { language: string; signal: AbortSignal }): Promise<ASRResult>
}
```

M2 backend: `SpeechRecognition`/`webkitSpeechRecognition`, `lang: zh-CN`, `continuous`, and `interimResults`. The control lives in `conversation.input.right` and follows the Codex composer reference: compact circular toolbar button, microphone icon at rest, stop-square icon while recording, and no automatic send. Unsupported browsers show an unavailable state. Mid-session errors preserve the draft and ask for a new recording.

Later backends must verify their actual endpoint, multipart fields, response format, streaming support, limits, and cancellation behavior individually. “OpenAI compatible” is not a sufficient proof of identical ASR behavior.

## Settings

The native dsh Plugins page will eventually contain a `dsh-ears` plugin configuration card with:

- ASR backend selection and availability state.
- Language, default `zh-CN`.
- Per-recording limit, default 120 seconds.
- Polishing enabled/disabled.
- A provider/model selector populated from dsh's configured routes.

The first release has no emotion toggle and no plugin-owned LLM credential fields. Cloud ASR credentials, when implemented, remain Host-side and separate from polishing.

## Milestones

### M1 — Installable and loadable package

- Add Host/Client exports, `dsh.bundle.patch`, `dsh.client`, package files, and the official-style build configuration.
- Keep the development HMR overlay separate from the published patch.
- Verify `pnpm check`, package build, `dsh --profile web --dump-config`, and a real Web profile boot.

### M2 — Microphone button and Web Speech

- Register the client button in `conversation.input.right`.
- Match the Codex-style composer affordance: right-aligned circular control, clear idle/recording states, accessible tooltip/label, and no layout jump.
- Stream Web Speech interim/final results into the draft.
- Preserve draft on failure and keep manual send semantics.
- Verify in Chrome with unsupported-browser and mid-session failure cases.
- Verify dsh light/dark themes and model → microphone → send ordering on the real rc.6 Web surface.

### M3 — dsh-owned polishing

- Add the text-only Host RPC and dsh `ctx.llm` route selection.
- Populate the selector from dsh provider/model configuration.
- Replace the draft after polishing; always fall back to the raw transcript.
- Add prompt and route failure tests.

### M4 — Native settings

- Register the plugin configuration card in `settings.plugin.item`.
- Keep configuration inside dsh's native Plugins page; do not add a separate Voice settings tab or section.
- Verify dsh-native appearance, persistence, selection, and fallback behavior.

### M5 — Later ASR backends and hardening

- Design and verify audio capture, chunking, cancellation, and memory limits.
- Add local Whisper and provider-specific cloud adapters only after real smoke tests.
- Add privacy documentation and broaden tests. Emotion UI remains separately gated.

### M6 — Release readiness

- Review license choice, public repository readiness, package contents, changelog/release notes, dependency policy, and security scan.
- Public release, npm publishing, tags, and directory submissions require explicit release approval.

## Quality bar

The project is intended to become a durable, community-maintainable dsh ecosystem package. Before public release, it should have:

- English-first documentation and issue-ready reproduction guidance.
- Deterministic builds, focused tests, and real dsh smoke verification.
- No secrets or machine-local paths in tracked content.
- Clear API boundaries and compatibility statements.
- Atomic history with reviewable commits.
- A documented changelog, license decision, contribution process, and security policy.

## Risks and open questions

- dsh rc APIs may change; keep the first compatibility range narrow and verify against rc.6.
- Web Speech availability and privacy behavior vary by browser and platform.
- The exact rc.6 `ctx.llm` discovery, route selection, and completion call shape must be verified before M3.
- Whisper model size, cache policy, chunk duration, and interim-result strategy remain open before M5.
- Every cloud ASR provider needs an independent protocol adapter and smoke test.
- A license has not been selected yet; do not add legal licensing terms without an explicit decision.

## References

- [DeepSeek Harness development guide](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [DeepSeek Harness GitHub repository](https://github.com/deepseek-ai/deepseek-harness)
- Official dsh client plugin packages installed with dsh `0.1.0-rc.6`.
