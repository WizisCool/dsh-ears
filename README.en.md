<p align="center">
  <img src="./assets/banner.jpg" width="100%" alt="dsh-ears" />
</p>

<h1 align="center">dsh-ears</h1>

<p align="center"><b>Voice input plugin for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> with LLM text polishing.</b></p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  English
</p>

<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-%3E%3D0.1.2--rc.1-1a73e8?style=flat-square&logo=deepseek&logoColor=white" alt="dsh >= 0.1.2-rc.1"></a>
  <a href="https://www.npmjs.com/package/dsh-ears"><img src="https://img.shields.io/npm/v/dsh-ears?style=flat-square&logo=npm" alt="npm version"></a>
  <!-- Download badge icon: Akar Icons, MIT, © 2020-present Arturo Wibawa — https://github.com/artcoholic/akar-icons -->
  <a href="https://www.npmjs.com/package/dsh-ears"><img src="https://img.shields.io/npm/dt/dsh-ears?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMiIgZD0iTTEyIDE1VjNtMCAxMmwtNC00bTQgNGw0LTRNMiAxN2wuNjIxIDIuNDg1QTIgMiAwIDAgMCA0LjU2MSAyMWgxNC44NzdhMiAyIDAgMCAwIDEuOTQtMS41MTVMMjIgMTciLz48L3N2Zz4%3D" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

---

dsh-ears adds voice input and LLM-powered text polishing to DeepSeek Harness. It supports in-browser Web Speech, local Whisper, and popular speech-to-text (ASR) APIs.

## Install

Prerequisites: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `>=0.1.2-rc.1`, and Node.js `^22.19.0 || >=24.0.0`.

### Install from npm

```sh
dsh plugin --profile web add dsh-ears
```

> **Still using dsh 0.1.1?** dsh 0.1.2 contains breaking changes, so dsh-ears `0.3.0` no longer supports dsh 0.1.1. Install a plugin version earlier than `0.3.0` instead:
>
> ```sh
> dsh plugin --profile web add "dsh-ears@<0.3.0"
> ```

### Install from source

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm use:platform
pnpm install
pnpm build
dsh plugin --profile web add "$PWD"
# Windows cmd: use "%CD%"; PowerShell expands $PWD directly
```

`pnpm use:platform` switches `node_modules` to the native dependency tree for the active platform (kept separate for Windows and Linux). Run it on a fresh clone and whenever switching between platforms.

After installation, refresh the Web UI. A microphone icon appears to the right of the composer.

## Update

```sh
dsh plugin --profile web add dsh-ears
```

`add` resolves the latest version from npm, so the same command works from any installed version. After updating, restart `dsh web` to load the new server code and refresh the Web UI; you can also check for new versions in the "About" panel on the settings page.

## Uninstall

```sh
dsh plugin --profile web remove dsh-ears
```

Refresh the Web UI after uninstalling.

## Usage

1. Click the microphone icon or press `Ctrl+Shift+Space` (configurable in settings).
2. Start speaking.
3. Press the shortcut again or click the microphone to stop recording and start transcription.
4. With polishing enabled, the raw transcript appears in the draft first. Once polishing completes, it replaces the text while preserving any manual edits made in the meantime.
5. Review the text and send manually.

Transcription results are always written to an editable draft and are never sent automatically. If the selected backend is not ready, the microphone icon is disabled — hover over it to see why.

## Recognition backends

| Backend | How it works | Requirements |
| --- | --- | --- |
| Web Speech | In-browser real-time recognition | Default backend; Chromium-based browser |
| Local Whisper | Local transcription after recording stops | Download GGML models in settings |
| [Groq](https://console.groq.com) | [Groq Whisper API](https://console.groq.com/docs/speech-text) | API key |
| [Deepgram](https://deepgram.com) | [Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio) or [live audio streaming](https://developers.deepgram.com/docs/live-streaming-audio) | API key, model name (e.g. `nova-3`) |
| [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) | [DashScope synchronous transcription](https://help.aliyun.com/zh/model-studio/developer-reference/tongyi-qianwen-audio-api) | API key, model name; max 300 s per recording |
| [Tencent Cloud](https://cloud.tencent.com/product/asr) | [Recording file recognition](https://cloud.tencent.com/document/api/1093/37823) or [real-time WebSocket](https://cloud.tencent.com/document/api/1093/48982) | AppID, SecretID, SecretKey, `engine_type` |
| [Xiaomi MiMo](https://mimo.mi.com) | [Speech Recognition API](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition), supporting standard API or [Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription) | API key, model name (e.g. `mimo-v2.5-asr`); Token Plan requires a regional cluster |
| [SiliconFlow (CN)](https://siliconflow.cn) | [Audio Transcription API](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post) | API key, model name (e.g. `FunAudioLLM/SenseVoiceSmall`) |
| [Volcengine](https://www.volcengine.com/product/doubao) | [Doubao audio file recognition](https://docs.volcengine.com/docs/6561/1354868) or [Doubao one-way streaming ASR](https://docs.volcengine.com/docs/6561/2628951) | API key (new-console `X-Api-Key`), resource ID |
| Custom OpenAI-compatible | Sends to a specified `/audio/transcriptions` endpoint | Endpoint URL, API key, model name |

> **Local Whisper**: Runs whisper.cpp locally via `@fugood/whisper.node` without Python, FFmpeg, or external dependencies. Supports downloading and managing GGML models (`tiny` (default) through `turbo`) in settings, with `default` (auto), `vulkan`, or `cuda` acceleration.
>
> **Volcengine**: Accepts only the new-console API Key (`X-Api-Key`) authentication (legacy AppID + Access Token is not supported). Obtain keys from the [console API Key page](https://console.volcengine.com/speech/new/setting/apikeys).

## Polishing

Enabled by default. Leave both provider and model empty to use dsh's default Agent model (including its default reasoning settings); you can also select any model configured in dsh. LLM credentials reuse dsh's existing configuration. Reasoning effort is configurable.

The default prompt removes filler words, fixes common ASR errors, handles self-corrections, and formats lists. Customize the prompt or view the default content in settings. If polishing fails or is cancelled, the raw transcript is preserved.

## Settings

After installation, a dsh-ears section appears in the Web UI settings page, organized into four tabs:

| Tab | Configurable options |
| --- | --- |
| General | Settings display name, voice shortcut toggle and key combination, audio cues toggle, max recording duration (1–600 s, default 120 s) |
| Recognition | Backend selection, language, local Whisper model and acceleration, cloud providers and credentials |
| Polishing | Toggle, LLM provider and model, reasoning effort, custom prompt (up to 4,000 characters) |
| About | Version, license, dsh compatibility range, update checker |

## Known limitations

- The Web Speech backend relies on the browser implementation; audio may be sent to browser vendor servers for processing and is not a strictly local/offline solution.
- Alibaba Cloud Model Studio (Bailian) recordings are capped at 300 seconds per audio.
- Deepgram Flux models require the Listen V2 protocol and are currently unsupported.
- Local Whisper has a single-recording limit of 24 MB and a 120-second transcription timeout.
- Acceleration backend (`default` / `vulkan` / `cuda`) is locked after the first native module load; switching requires restarting `dsh web`.

## Local development

```sh
pnpm use:platform
pnpm install
dsh plugin --profile web add "$PWD"
# Windows cmd: use "%CD%"; PowerShell expands $PWD directly
pnpm check          # type-check
pnpm test           # run tests
pnpm build          # build
pnpm dev:config     # build and write the HMR config
pnpm dev:web        # start dsh web
```

Run `pnpm dev:watch` in a second terminal while developing for live rebuilds.

After modifying frontend UI code, simply refresh the browser. When modifying server-side code, settings registration, Remote descriptors, or schemas, restart `dsh web` and then refresh.

## Docs

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

## License

[MIT](./LICENSE)

## Community Links

- [LINUX DO](https://linux.do) — A new ideal community

## Star History

<a href="https://www.star-history.com/?repos=wiziscool%2Fdsh-ears&type=date&logscale=&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=wiziscool/dsh-ears&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=wiziscool/dsh-ears&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=wiziscool/dsh-ears&type=date&legend=top-left" />
 </picture>
</a>
