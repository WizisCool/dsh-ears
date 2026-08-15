# dsh-ears

An open-source voice-input plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): give the text-only DeepSeek a pair of ears.

The interaction is deliberately close to Codex Desktop:

```text
microphone → transcription → optional dsh LLM polishing → editable draft → manual send
```

The microphone control is registered in dsh's composer. Configuration lives in dsh's native `Plugins` settings page; dsh-ears does not add a separate settings tab.

## Compatibility

- dsh: `0.1.0-rc.6`
- Node.js: `^22.19.0 || >=24.0.0`
- Package manager: pnpm
- First browser target: a Chromium browser with the required speech or microphone APIs

The compatibility promise is intentionally narrow until another dsh release is tested.

## Capabilities

### Speech recognition

- Web Speech: live interim/final transcript updates in the browser.
- Local Whisper: Host-side `whisper` CLI execution after recording stops.
- OpenAI-compatible cloud ASR: Host-side multipart request with `file`, `model`, and optional language.

The final-result backends use the browser `MediaRecorder` and a bounded one-shot audio RPC. They do not switch backends invisibly during one recording.

### Polishing

After transcription, dsh-ears can ask any provider/model route already configured in dsh to clean up the transcript. The plugin stores only `{ provider, model }`; it does not add a provider, API key, base URL, or browser-side LLM request. A failed or cancelled polish leaves the raw transcript usable in the draft.

### Settings

Open `Settings → Plugins → Plugin configuration` in dsh. The card provides:

- recognition language and recording limit;
- ASR backend and local Whisper model;
- cloud endpoint, model, and dsh credential reference;
- polishing toggle and dsh provider/model route.

Credential fields accept references such as `OPENAI_API_KEY`, not secret values. The secret is resolved by dsh Host credentials for one operation and is never returned to the browser.

## Local development

```sh
pnpm install
dsh plugin --profile web add "$PWD"
pnpm check
pnpm test
pnpm build
pnpm dev:config
pnpm dev:web
```

For source iteration, run the compiler watcher in another terminal:

```sh
pnpm dev:watch
```

`pnpm dev:config` creates the ignored `.dsh/cordis.patch.yml` HMR overlay. It watches the generated `lib/` output and does not add a duplicate plugin loader entry. `cordis.patch.yml` is the small publish-time bundle patch.

## Backend notes

Local Whisper must be installed on the dsh Host and available as `whisper` on `PATH`. Model weights belong to that installation; dsh-ears does not bundle or upload them. Temporary audio files are created in a private temporary directory and removed after each operation.

Cloud ASR sends audio to the endpoint configured by the user. Use HTTPS for remote services, do not embed credentials in the URL, and consider the privacy and retention policy of the chosen provider. Localhost/private endpoints are allowed because endpoint configuration is an explicit Host-side administrator action; the plugin does not discover or probe arbitrary endpoints.

Web Speech may send audio to a browser-vendor recognition service. “No additional plugin cost” does not mean local-only recognition.

## Verification

The repository currently has 29 focused tests across 7 test files. The verified local dsh smoke path includes:

- dsh Host and browser plugin loading;
- native Plugins settings persistence;
- light/dark composer layout and dsh semantic color tokens;
- real local Whisper transcription through `dshEars/transcribe`;
- Web Speech and MediaRecorder lifecycle failure paths.

See [PLAN.md](./PLAN.md) for the full implementation plan, [SECURITY.md](./SECURITY.md) for the threat and data-handling boundary, and [PROGRESS.md](./PROGRESS.md) for the current delivery record.

## Project documents

- [AGENTS.md](./AGENTS.md) — repository instructions for coding agents.
- [.agent/agent.md](./.agent/agent.md) — current handoff and verification state.
- [.agent/context.md](./.agent/context.md) — durable architecture context.
- [.agent/decisions.md](./.agent/decisions.md) — append-only architecture decisions.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution and review expectations.

The project is released to the private GitHub repository `WizisCool/dsh-ears` under the MIT license. npm publishing and any public visibility change still require an explicit release decision.
