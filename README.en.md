<p align="center">
  <img src="./assets/banner.jpg" width="100%" alt="dsh-ears" />
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
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.1.0--rc.6%20--%200.1.1--rc.2-1a73e8?style=flat-square" alt="dsh 0.1.0-rc.6 - 0.1.1-rc.2"></a>
  <a href="https://www.npmjs.com/package/dsh-ears"><img src="https://img.shields.io/npm/v/dsh-ears?style=flat-square&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-ears"><img src="https://img.shields.io/npm/dm/dsh-ears?style=flat-square&logo=npm" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

---

While recording, a recognition bar with a waveform appears above the composer. Click the discard icon to cancel during transcription or polishing.

## Install

Prerequisites: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`0.1.0-rc.6` through `0.1.1-rc.2`) and Node.js `^22.19.0 || >=24.0.0`.

### Install from npm

```sh
dsh plugin --profile web add dsh-ears
```

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

After installation, refresh the Web UI. A microphone icon appears to the right of the composer.

## Update

```sh
dsh plugin --profile web add dsh-ears
```

`add` resolves the latest version from npm, so the same command works from any installed version. After updating, restart `dsh web` to load the new Host code and refresh the Web UI; the About panel in the settings page can also check for new versions.

## Uninstall

```sh
dsh plugin --profile web remove dsh-ears
```

Refresh the Web UI after uninstalling.

## Usage

1. Click the microphone icon, or press `Ctrl+Shift+Space` (configurable in settings).
2. Start speaking.
3. Press the shortcut again or click the microphone to stop recording and start transcription.
4. With polishing enabled, the raw transcript appears in the draft first. The plugin replaces it with the polished text when polishing finishes, preserving manual edits made in the meantime.
5. Review and send.

Transcription results are always written to an editable draft and are never sent automatically. If the selected backend is not ready, the microphone icon is disabled — hover to see why.

## Recognition backends

| Backend | How it works | Requirements |
| --- | --- | --- |
| Web Speech | Live in-browser recognition | Default backend; a Chromium-based browser |
| Local Whisper | Host transcribes locally after recording stops | Download a GGML model from settings |
| [Groq](https://console.groq.com) | Host calls the Groq Whisper API | API key |
| [Deepgram](https://deepgram.com) | [Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio) or [live audio streaming](https://developers.deepgram.com/docs/live-streaming-audio) | API key, model name (e.g. `nova-3`) |
| [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) | DashScope synchronous transcription | API key and model name; max 300 s per recording |
| [Tencent Cloud](https://cloud.tencent.com/document/api/1093/37823) | [Recording file recognition](https://cloud.tencent.com/document/api/1093/37823) or [real-time WebSocket](https://cloud.tencent.com/document/api/1093/48982) | AppID, SecretID, SecretKey, `engine_type` |
| [Xiaomi MiMo](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition) | Host calls the MiMo speech model via the [standard API](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition) or a [Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription) subscription | API key, model name (e.g. `mimo-v2.5-asr`); Token Plan requires a regional cluster |
| [SiliconFlow](https://siliconflow.cn) | OpenAI-compatible transcription (CN) | API key, model name (e.g. `FunAudioLLM/SenseVoiceSmall`) |
| [Volcengine](https://www.volcengine.com/product/doubao) | [Doubao audio file recognition](https://docs.volcengine.com/docs/6561/1354868?lang=zh) or [Doubao one-way streaming ASR](https://docs.volcengine.com/docs/6561/2628951?lang=zh) | API key (new-console `X-Api-Key`), resource id |
| Custom OpenAI-compatible | Sends to a specified `/audio/transcriptions` endpoint | Endpoint URL, API key, model name |

Local Whisper uses the automatic acceleration backend selected by the Host from the current platform and installed native variants; it falls back to `default` when unavailable. Vulkan/CUDA can also be selected manually in settings.

All API keys and credentials are stored on the Host. The browser never receives them.

Volcengine accepts only the new-console API Key (`X-Api-Key`); legacy console AppID + Access Token authentication is not supported. API keys are issued on the [console API Key page](https://console.volcengine.com/speech/new/setting/apikeys).

## Polishing

On by default. Leave both provider and model empty to use dsh's default Agent model, including its default reasoning settings; you can also choose a model configured in dsh. LLM credentials come from dsh's existing configuration.

The default prompt removes filler words, fixes common ASR errors, handles self-corrections, and formats enumerations. Customize the prompt or view the default in settings. If polishing fails or is cancelled, the raw transcript is kept.

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

Run `pnpm dev:watch` in a second terminal while developing.

## Docs

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

## License

[MIT](./LICENSE)
