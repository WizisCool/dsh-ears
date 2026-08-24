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
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

```text
A voice-input plugin for DeepSeek Harness that supports multiple ASR backends and polishing through dsh's own LLM route.
```

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

---

While recording, a recognition bar appears above the composer with a waveform and stop button. If transcription or polishing is still running, click the trash icon to discard the take.

## Install

Prerequisites: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`0.1.0-rc.6` through `0.1.1-rc.2`) and Node.js `^22.19.0 || >=24.0.0`.

**Install from npm:**

```sh
dsh plugin --profile web add dsh-ears
```

If the `dsh` CLI is not installed:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ears
```

**Install from source:**

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

Update to the latest version:

```sh
dsh plugin --profile web update dsh-ears
```

Refresh the Web UI after the update.

## Uninstall

```sh
dsh plugin --profile web remove dsh-ears
```

If the `dsh` CLI is not installed:

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-ears
```

The same command works for npm and local installs. Refresh the Web UI afterwards; the microphone icon disappears. A local clone is not deleted.

## Usage

1. Click the microphone icon, or press `Ctrl+Shift+Space`.
2. Start speaking.
3. Press the shortcut again, or click the microphone, to stop recording and start transcription.
4. With polishing enabled, the raw transcript appears in the draft first. The plugin replaces it with the polished text when polishing finishes, while preserving manual edits made in the meantime.
5. Review and send.

If the selected backend is not ready, the microphone icon is disabled. Hover over it to see why.

## Recognition backends

| Backend | How it works | Requirements | Free allowance |
| --- | --- | --- | --- |
| Web Speech | Live in-browser recognition; words appear as you speak | A Chromium-based browser. Audio may be routed through the browser vendor | — |
| Local Whisper | The Host runs the `whisper` CLI after recording stops | `openai-whisper` installed locally; download a model from the plugin settings page (weights are not bundled) | — |
| [Groq](https://console.groq.com) | The Host sends the recording to the Groq Whisper API | A Groq API key | Always Free, [Rate Limits](https://console.groq.com/docs/rate-limits) |
| [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) | DashScope synchronous transcription (Flash family) | HTTPS origin, API key, and model name. Recordings are limited to 300 s | [New-user free quota](https://www.alibabacloud.com/help/en/model-studio/new-free-quota) |
| Custom OpenAI-compatible | Sends a request to the specified `/audio/transcriptions` endpoint | Endpoint URL, API key, and model name | — |
| Add a new backend | — | [Open a PR](https://github.com/WizisCool/dsh-ears/pulls) to contribute another transcription service | — |

> The allowances above come from provider documentation and may change. Check the provider's current documentation.

> Whisper `medium` and larger models rarely finish within 120 s on CPU alone. A GPU or a faster local runtime is recommended.

## Polishing

Choose the polish model from the models configured in `dsh → Settings → Models`. The plugin stores only the provider, model name, and prompt; the LLM key comes from dsh's existing configuration.

The default prompt removes filler words, fixes common ASR errors, handles spoken self-corrections ("not A, actually B"), and formats explicit enumerations. Leave the prompt blank to use the built-in default, which you can review in the settings page. If polishing fails or is cancelled, the raw transcript is kept as-is.

## Local development

```sh
pnpm use:platform
pnpm install
dsh plugin --profile web add "$PWD"
# Windows cmd: use "%CD%"; PowerShell expands $PWD directly
pnpm check
pnpm test
pnpm build
pnpm dev:config   # build and write the HMR overlay
pnpm dev:web      # start dsh web
```

Run `pnpm dev:watch` in a second terminal while developing. `pnpm dev:config` writes `.dsh/cordis.patch.yml` (git-ignored) for HMR and does not register the plugin twice.

## Docs

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

See [CONTRIBUTING.md](./CONTRIBUTING.md), [AGENTS.md](./AGENTS.md), and [`.agent/`](./.agent/README.md) for the contributor guide and architecture notes.

## License

[MIT](./LICENSE)
