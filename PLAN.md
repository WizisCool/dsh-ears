# dsh-ears Implementation Plan (v2.1)

> An English-first, public-safe plan for a DeepSeek Harness voice input plugin. Runtime Chinese prompt text is product data and may remain Chinese where required by the user experience.

## Goal

Give the dsh Web UI a native-feeling voice input flow:

```text
microphone → live transcript → optional dsh LLM polish → editable draft → manual send
```

The implementation supports browser Web Speech, Host-side local Whisper, and an OpenAI-compatible cloud ASR backend. Web Speech API may send audio to a browser vendor, so “zero cost” must not be described as “local/private recognition”.

## Status

- M0: documentation and collaboration baseline complete.
- M1: package shape and load verification complete.
- M2: microphone button, Web Speech pipeline, dsh theme adaptation, and composer ordering fix are complete.
- M3: dsh-owned text polishing and route discovery are implemented.
- M4: native Plugins settings card and persistence are implemented.
- M5: local/cloud ASR backends and lifecycle hardening are implemented.
- M6: release-readiness review is in progress.
- First compatibility target: dsh `0.1.0-rc.6` and Node `^22.19.0 || >=24.0.0`.

## Architecture

The package has two faces:

- Host face: Cordis lifecycle, Host RPC, dsh settings integration, local/cloud ASR, and dsh `ctx.llm` access.
- Browser face: the microphone UI, Web Speech session, MediaRecorder capture for final ASR, and `inputActions.setDraft()` updates.

Web Speech runs in the browser and is not a PCM recorder. Local Whisper and cloud ASR use a separate MediaRecorder source and final-result Host RPC; the first release does not promise invisible backend switching during one recording.

After recording stops, polishing runs on the Host through dsh's existing LLM runtime and credentials. The plugin stores a selected `{ provider, model }` route, not a second provider configuration.

## Confirmed decisions

| ID | Decision | Status |
|---|---|---|
| D1 | Project name is `dsh-ears`. | Accepted |
| D2 | Click to start, live transcript into an editable draft, stop, then manual send. | Accepted |
| D3 | Polishing is enabled by default and integrated into dsh settings. | Accepted |
| D4 | Users may select any provider/model route already configured in dsh. The plugin does not provide `base_url`, `api_key`, custom provider, or custom model fields for polishing. | Accepted |
| D5 | M2 starts with Web Speech API; final local Whisper and cloud adapters use a separate MediaRecorder path. Same-session automatic switching is not promised. | Accepted |
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
│   │   ├── MicrophoneButton.tsx # Composer control and backend dispatch
│   │   ├── voice-flow.ts     # Draft, polish, and stale-result protection
│   │   └── settings.tsx      # dsh-native settings UI
│   ├── asr/
│   │   ├── types.ts          # Final audio/backend metadata
│   │   ├── media-recorder.ts # Browser capture for final backends
│   │   ├── web-speech.ts     # Browser live backend
│   │   ├── local-whisper.ts  # Host Whisper CLI adapter
│   │   └── openai-compatible.ts # Host cloud adapter
│   ├── polish/
│   │   ├── service.ts        # Host-side ASR/settings/polish orchestration
│   │   └── prompts.ts        # Product prompt text
│   ├── config.ts             # Shared constants, types, and validation
│   ├── config-schema.ts      # Host-only schemastery settings schema
│   └── remote-contract.ts     # Strict Host/Client wire schemas
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
- Web Speech remains a browser live backend, but its recognition service may be provided by the browser vendor.
- Local Whisper and cloud ASR use MediaRecorder audio and a final-result Host RPC; they do not attempt invisible backend switching during one recording.
- The Host rejects oversized audio, uses bounded temporary files and response bodies, and removes local Whisper temporary directories in `finally` blocks.
- M3 uses a named plugin RPC for text-only polishing. The Host invokes dsh `ctx.llm`; the Client sends text and a route reference, never audio or credentials.
- Client Remote calls use a Cordis child scope that injects `remote.dshEars`; asynchronous controllers and React event callbacks receive the concrete namespace rather than retaining an unscoped `ctx.remote` object.
- The final-audio RPC accepts one bounded base64 payload and MIME type, carries an AbortSignal, and returns a strict transcript string. Streaming/chunked audio is intentionally not part of the first final-backend contract.
- Settings use the dsh-native Plugins page and its `settings.plugin.item` list slot after the rc.6 surface is verified. No standalone `settings.section` or `settings.general.item` entry is planned.

## LLM polishing

Polishing is owned by dsh:

- Discover models from dsh's configured provider/model routes.
- Store `{ provider, model }`; provider is required because model IDs may collide.
- Reuse dsh Host credentials and the dsh LLM runtime.
- Do not hardcode `deepseek-v4-flash`, `gemini-3.7-flash-high`, or any other model name as a plugin preset.
- Do not force DeepSeek-specific `thinking` fields. Reasoning mode, endpoint, and credentials belong to the selected dsh route.
- If the selected route is missing, unavailable, times out, or fails, return the original transcript and never block the draft.
- An empty provider/model selection is valid and means that polishing is disabled for the recording; it is not a settings validation error.

The polishing prompt removes filler words, repairs likely ASR errors, restores punctuation, preserves meaning, formats explicit enumerations as lists, and treats transcript text as data rather than instructions. The runtime prompt may be Chinese; its implementation and tests remain English-documented.

## ASR contracts

The first release has one live browser backend and two final-result backends:

```ts
type FinalAudioRequest = {
  audioBase64: string
  mimeType: string
}

type ASRBackendInfo = {
  id: 'web-speech' | 'local-whisper' | 'cloud-openai'
  available: boolean
  detail: string
}
```

The browser backend uses `SpeechRecognition`/`webkitSpeechRecognition`, `lang: zh-CN`, `continuous`, and `interimResults`. The final backends use `MediaRecorder` with mono, echo-cancellation, noise-suppression, and automatic-gain-control constraints. The control lives in `conversation.input.right` and follows the Codex composer reference: compact circular toolbar button, microphone icon at rest, stop-square icon while recording, and no automatic send. Unsupported browsers show an unavailable state. Mid-session errors preserve the draft and ask for a new recording. Teardown aborts are silent and never write into an unmounted draft.

Local Whisper is invoked on the dsh Host with argument arrays and private temporary files; it does not use a shell. The cloud adapter sends `file`, `model`, and optional language fields to an explicit HTTP(S) endpoint. Cloud credentials are resolved per operation from dsh credential references. The Host RPC accepts one bounded base64 payload, carries cancellation, and returns a strict transcript string; streaming audio is intentionally outside the first contract.

## Settings

The native dsh Plugins page contains a `dsh-ears` plugin configuration card with:

- Language, default `zh-CN`.
- Per-recording limit, default 120 seconds.
- Polishing enabled/disabled.
- A provider/model selector populated from dsh's configured routes. Empty selection is the explicit no-polish state.

ASR backend selection, local Whisper model selection, cloud endpoint/model, and dsh credential-reference fields are implemented in the same native card.

The first release has no emotion toggle and no plugin-owned LLM credential fields. Cloud ASR credentials remain Host-side and separate from polishing; the settings card stores only a dsh credential reference such as `OPENAI_API_KEY`.

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

### M3 — dsh-owned polishing — complete

- Add the text-only Host RPC and dsh `ctx.llm` route selection.
- Populate the selector from dsh provider/model configuration.
- Replace the draft after polishing; always fall back to the raw transcript.
- Add prompt and route failure tests.

### M4 — Native settings — complete

- Register the plugin configuration card in `settings.plugin.item`.
- Keep configuration inside dsh's native Plugins page; do not add a separate Voice settings tab or section.
- Verify dsh-native appearance, persistence, selection, and fallback behavior.

### M3/M4 verification

- `pnpm check`: passed.
- `pnpm test`: passed; 29 tests across 7 files.
- `pnpm build`: passed; Host RPC, Client bundle, CSS modules, and declarations generated.
- Fresh dsh Web boot on a temporary port: passed; the microphone and native settings card loaded.
- Native `Plugins → 插件配置`: passed; the `语音输入` card appeared and loaded dsh provider routes.
- Settings persistence: passed; recording limit changed and was restored through the native card.
- Cordis Remote regression: passed; no `remote.dshEars without inject` error appeared on the fresh boot or after hot reload.
- Composer order: passed in light and dark themes; model selector → microphone → send button.
- Theme tokens: passed in light and dark themes; the microphone computed color/background changed with dsh theme tokens and no Codex palette constants are used.

### M5 — Final ASR backends and hardening — complete

- Design and verify one-shot audio capture, cancellation, cleanup, and memory limits.
- Add the Host-side local Whisper CLI adapter and OpenAI-compatible cloud adapter.
- Resolve cloud credentials through dsh references without storing secret values.
- Protect manual draft edits from late ASR/polish results and preserve raw transcript fallback.
- Verify local Whisper with a real generated audio file and a real dsh Host RPC.
- Keep emotion UI separately gated and intentionally unimplemented.

### M5 verification

- `pnpm check`: passed.
- `pnpm test`: passed; 29 tests across 7 files.
- `pnpm build`: passed; Host ESM, Client factory bundle, CSS, declarations, and source maps generated.
- Local Whisper smoke: passed with a generated AIFF file and the installed `whisper --model tiny` command.
- dsh Host RPC smoke: passed with a real `dshEars/transcribe` request and transcript response.
- Cloud adapter tests: passed for multipart payloads, anonymous endpoints, credential headers, URL credential rejection, and bounded chunked responses.
- Browser lifecycle tests: passed for MediaRecorder cleanup/idempotence, Web Speech silent abort, and synchronous-start failure.
- Draft-flow tests: passed for stale manual edits and late polish results.

### M6 — Release readiness — in progress

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
- The current rc.6 `ctx.llm` discovery, route selection, and completion call shape are verified; a non-empty live polish completion depends on a configured usable route.
- Whisper model cache ownership is delegated to the Host's `whisper` installation; the plugin does not bundle model weights.
- OpenAI-compatible cloud behavior is intentionally limited to the documented multipart `{ file, model, language? }` request and `{ text }` response contract. Other providers need independent adapters.
- A license has not been selected yet; do not add legal licensing terms without an explicit decision.

## References

- [DeepSeek Harness development guide](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
- [DeepSeek Harness GitHub repository](https://github.com/deepseek-ai/deepseek-harness)
- Official dsh client plugin packages installed with dsh `0.1.0-rc.6`.
