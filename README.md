# dsh-ears

![dsh-ear icon](./dsh-ear.svg)

An open-source voice-input plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): give the text-only DeepSeek a pair of ears.

The interaction is deliberately close to Codex Desktop:

```text
microphone → transcription → optional dsh LLM polishing → editable draft → manual send
```

The microphone control is registered in dsh's composer. While recognition is active, a standalone native taskbar-style card appears above the input with a full-width rolling microphone waveform and stop action; the transcript remains in dsh's editable draft. Configuration lives in a dedicated `dsh-ear` page in dsh's native settings window; dsh-ears does not add a second settings system.

## Compatibility

- dsh: `0.1.0-rc.6` and `0.1.0-rc.7`
- Node.js: `^22.19.0 || >=24.0.0`
- Package manager: pnpm
- First browser target: a Chromium browser with the required speech or microphone APIs

The compatibility promise is intentionally narrow. Other dsh releases are unsupported until they have been tested.

## Capabilities

### Speech recognition

- Web Speech: live interim/final transcript updates in the browser.
- Local Whisper: Host-side `whisper` CLI execution after recording stops.
- Cloud ASR provider presets: Groq transcription with an inline API key and a live model list; Alibaba Cloud Model Studio (百炼) via DashScope sync (`qwen3-asr-flash`, `fun-asr-flash`, and the same Flash family; HTTPS origin + key + model name; 300-second recording cap); and a Custom OpenAI-compatible option for arbitrary `/audio/transcriptions` endpoints. Groq and Custom requests are multipart `file`, `model`, and optional language. Each cloud provider stores its own write-only API key. Requests are bounded by a 120-second timeout. Bailian Filetrans / realtime are not included.

The final-result backends use the browser `MediaRecorder` and a bounded one-shot audio RPC. They do not switch backends invisibly during one recording. When the selected backend or Whisper model provably cannot transcribe, the composer microphone grays out with an explanatory tooltip.

### Polishing

After transcription, dsh-ears can ask any provider/model route already configured in dsh to clean up the transcript. The plugin stores only `{ provider, model, polishPrompt }`; it does not add a provider, API key, base URL, or browser-side LLM request. A failed or cancelled polish leaves the raw transcript usable in the draft.

Polishing runs on a built-in multilingual ASR-editing prompt that preserves the transcript's original language and technical/code terminology, resolves spoken self-corrections, formats enumerations as lists, and carries few-shot examples. On the Polishing tab you can replace it with your own system prompt: type a custom prompt, or leave it blank to use the built-in default. The host always appends an invisible output guard — the model returns only the polished text and never answers the transcript — and an over-length custom prompt (more than 4000 characters) blocks the save.

### Settings

Open `Settings → dsh-ear` in dsh. The page opens on a **General** tab and provides:

- a voice-input keyboard shortcut: an enable switch plus a recorder to capture any supported combination. The default is `Ctrl+Shift+Space` (same on Windows, Linux, and macOS): press it while the dsh page is focused to start voice input, and press it again to stop and transcribe. The shortcut works only inside the dsh page — a web page cannot register a system-wide hotkey, so it never intercepts other applications. Bare letter/digit/text keys (they would type) and Alt/Option+letter combinations (which type special characters on macOS) are rejected, as are modifier-only chords; letters and digits with Ctrl/Shift/Meta are accepted. Combinations reserved by the browser or OS are flagged with a warning but can still be saved. The shortcut runs at priority over text entry inside the dsh page — pressing it while typing in the composer triggers voice input instead of being swallowed by the input field. When the configured backend cannot record (see Backend notes), the shortcut surfaces the same unavailable hint as the grayed microphone button instead of recording.
- recognition language and recording limit (moved to the General tab);
- a grouped recognition selector (Local: Web Speech / Local Whisper; Cloud providers: Groq / Alibaba Cloud Model Studio / Custom OpenAI-compatible);
- local Whisper model management;
- per-provider cloud API keys, plus Groq's live model list, Bailian's HTTPS host and typed model name, or a custom transcription endpoint;
- polishing toggle, dsh provider/model route, and an optional custom polish system prompt (leave blank to use the built-in default). The prompt row offers a live `n/4000` character counter, a Reset-to-default action, and a read-only "View default" peek at the shipped prompt.

The API key field is write-only: the value is stored on the dsh Host with a `role('secret')` field (the same mechanism as the shipped web-search plugin), never returned to the browser, and only a configured/unconfigured state is shown. The plugin never handles LLM credentials for polishing — that stays inside dsh's own routes.

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

Local Whisper must be installed on the dsh Host and available as `whisper` on `PATH`. Model weights belong to that installation; dsh-ears does not bundle or upload them. Download a model from the `Settings → dsh-ear` page before recording: transcription is rejected while the selected model is missing or incomplete instead of silently downloading it mid-recording. `medium` and larger models need a GPU or a faster local runtime to finish within the 120-second transcription limit. Model discovery follows the installed library's own paths (pip, Homebrew, pipx, conda); Windows launcher probing is implemented but has not been smoke-tested on Windows yet. Temporary audio files are created in a private temporary directory and removed after each operation.

Cloud ASR preset providers (Groq) pin their endpoint in a Host-side registry and fetch their transcription model list from the provider's catalog with the stored key; the Custom OpenAI-compatible provider sends audio to the endpoint configured by the user. Use HTTPS for remote services, do not embed credentials in the URL, and consider the privacy and retention policy of the chosen provider. Localhost/private endpoints are allowed because endpoint configuration is an explicit Host-side administrator action; the plugin does not discover or probe arbitrary endpoints. Groq Chinese (`zh`) recognition is expected through the multilingual Whisper models but is not explicitly listed in Groq's own documentation — verify with a live call.

Web Speech may send audio to a browser-vendor recognition service. “No additional plugin cost” does not mean local-only recognition.

## Verification

The repository currently has 111 focused tests across 12 test files. The verified local dsh smoke path includes:

- dsh Host and browser plugin loading;
- native `dsh-ear` settings persistence;
- light/dark composer layout and dsh semantic color tokens;
- real local Whisper transcription through `dshEars/transcribe`;
- Web Speech and MediaRecorder lifecycle failure paths.

The hardening suite also covers cross-field settings staging, stale Whisper action responses, late aborted polish results, bounded cloud/polish responses, strict ASR identifiers, and Host/Client Remote descriptor parity.

See [PLAN.md](./PLAN.md) for the full implementation plan, [SECURITY.md](./SECURITY.md) for the threat and data-handling boundary, and [PROGRESS.md](./PROGRESS.md) for the current delivery record.

## Project documents

- [AGENTS.md](./AGENTS.md) — repository instructions for coding agents.
- [.agent/agent.md](./.agent/agent.md) — current handoff and verification state.
- [.agent/context.md](./.agent/context.md) — durable architecture context.
- [.agent/decisions.md](./.agent/decisions.md) — append-only architecture decisions.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution and review expectations.

The project is released to the private GitHub repository `WizisCool/dsh-ears` under the MIT license. npm publishing and any public visibility change still require an explicit release decision.
