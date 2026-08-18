<p align="center">
  <img src="./assets/dsh-ear.svg" width="88" alt="dsh-ears" />
</p>

<h1 align="center">dsh-ears</h1>

<p align="center"><b>Give the text-only DeepSeek a pair of ears.</b></p>

<p align="center">
  An open-source voice-input plugin for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  English
</p>

<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.1.0--rc.6%20%2F%20rc.7-1a73e8?style=flat-square" alt="dsh 0.1.0-rc.6 / rc.7"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

Give a text-only LLM a pair of ears:

```text
microphone → transcription → optional polish → editable draft → manual send
```

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

## Features

While you talk, a recognition bar appears above the input with a waveform and a stop button. You can throw the take away if transcription or polishing is still running.

Recognition can be browser Web Speech (words appear as you talk), local Whisper, Groq, Alibaba Cloud Model Studio, or any OpenAI-compatible transcription endpoint.

Polishing can use any model already connected in dsh. The prompt is yours to edit. The shortcut defaults to `Ctrl+Shift+Space`.

## Install

Install [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) first (`0.1.0-rc.6` / `0.1.0-rc.7`).
Node.js `^22.19.0 || >=24.0.0`.

### 1. Install from npm

```sh
dsh plugin --profile web add dsh-ears
```

If you don't have a `dsh` command:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ears
```

### 2. Install from source

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm install
pnpm build
dsh plugin --profile web add "$PWD"
```

Refresh the Web UI. The microphone shows up on the right of the composer.

## Usage

1. Click the microphone icon, or press `Ctrl+Shift+Space` (the default).
2. Speak.
3. Click again, or press the shortcut again, to stop and transcribe.
4. If polishing is on, the raw transcript is written first and replaced when polish finishes. Edits you make in between stay.
5. Send.

If the selected backend is not ready, the microphone icon is grey. Hover it to see why.

## Recognition backends

| Backend | How it works | What you need |
| --- | --- | --- |
| Web Speech | Live recognition in the browser | Chromium. Audio may go to the browser vendor |
| Local Whisper | Host runs the `whisper` CLI after you stop | Install openai-whisper and download a model from the plugin settings page first. Weights are not bundled |
| Groq | Host sends the recording to Groq Whisper | A Groq API key |
| Alibaba Cloud Model Studio | DashScope sync transcription (Flash family) | HTTPS origin, API key, and model name. Recordings cap at 300 seconds |
| Custom OpenAI-compatible | POST to your `/audio/transcriptions` endpoint | Endpoint, key, and model name |

A recording keeps the backend you started with. Whisper `medium` and larger models usually miss a 120-second CPU budget; use a GPU or a faster local runtime.

## Polishing

Pick a polish model from the ones already added in `dsh → Settings → Models`. The plugin only stores the provider, model, and prompt. The LLM key is the one dsh already has.

The default prompt drops fillers, fixes likely ASR mistakes, and handles spoken self-corrections plus explicit enumerations. Leave it blank to use the built-in prompt; you can read that default in settings. If polish fails or is cancelled, only the original transcript is kept.

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

While editing, run `pnpm dev:watch` in another terminal. `pnpm dev:config` writes the ignored `.dsh/cordis.patch.yml` overlay for HMR. It does not add another plugin entry.

## Docs

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

Working notes are in [AGENTS.md](./AGENTS.md) and `.agent/`.

## License

[MIT](./LICENSE)
