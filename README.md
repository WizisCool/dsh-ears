<p align="center">
  <img src="./assets/dsh-ear.svg" width="88" alt="dsh-ears" />
</p>

<h1 align="center">dsh-ears</h1>

<p align="center"><b>给纯文本 DeepSeek 一对耳朵。</b></p>

<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 的开源语音输入插件
</p>

<p align="center">
  简体中文 ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.1.0--rc.6%20%2F%20rc.7-1a73e8?style=flat-square" alt="dsh 0.1.0-rc.6 / rc.7"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

给纯文本 LLM 加一对耳朵：

```text
麦克风 → 转写 → 可选润色 → 可编辑草稿 → 手动发送
```

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

## 功能

录音时，输入框上方会出现一条识别条，有波形和停止按钮。转写或润色还没结束，可以把这次丢掉。

识别可以用浏览器 Web Speech（边说边出字），也可以用本机 Whisper、Groq、阿里云百炼，或者任意 OpenAI 兼容转写接口。

润色可以用任何已经接入 dsh 的模型，提示词能自己改。快捷键默认是 `Ctrl+Shift+Space`。

## 安装

先安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`0.1.0-rc.6` / `0.1.0-rc.7`）。
Node.js 需要 `^22.19.0 || >=24.0.0`。

### 1. 从 npm 安装

```sh
dsh plugin --profile web add dsh-ears
```

没有 `dsh` 命令时换成：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ears
```

### 2. 从源码安装

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm install
pnpm build
dsh plugin --profile web add "$PWD"
```

刷新 Web UI，输入框右侧会出现麦克风。

## 用法

1. 点麦克风图标，或按 `Ctrl+Shift+Space`（默认）。
2. 说话。
3. 再点一次或再按一次快捷键，停止并转写。
4. 如果开了润色，原文先写进草稿，润色完再替换。你中途改过的字不会被盖掉。
5. 发送。

后端没配好时麦克风图标会变灰，鼠标悬停能看到原因。

## 识别后端

| 后端 | 怎么工作 | 你需要准备 |
| --- | --- | --- |
| Web Speech | 浏览器实时识别，边说边出字 | Chromium。音频可能发给浏览器厂商 |
| 本地 Whisper | 停录后由 Host 上的 `whisper` CLI 转写 | 本机装好 openai-whisper，并在插件设置页先下载模型。插件不附带权重 |
| Groq | Host 把录音发到 Groq Whisper | Groq API key |
| 阿里云百炼 | DashScope 同步转写（Flash 系列） | HTTPS 源站、API key、模型名。单次最长 300 秒 |
| 自定义 OpenAI 兼容 | 发到你指定的 `/audio/transcriptions` | 端点、key、模型名 |

一次录音不会中途换后端。Whisper 的 `medium` 和更大的模型，靠 CPU 很难在 120 秒里跑完，得有 GPU 或者更快的本机运行时。

## 润色

润色模型来自 `dsh → 设置 → 模型` 里已经接入的那些。插件只存提供方、模型和提示词。LLM 的 key 用的是 dsh 自己的。

默认提示词会去掉口头禅、修 ASR 错字，也会处理「不是 A 是 B」和「第一…第二…」这种说法。留空就用内置的，默认内容在设置里可以看。润色失败或取消，只留下原文。

## 本地开发

```sh
pnpm install
dsh plugin --profile web add "$PWD"
pnpm check
pnpm test
pnpm build
pnpm dev:config
pnpm dev:web
```

改源码时再开一个终端跑 `pnpm dev:watch`。`pnpm dev:config` 会写出已忽略的 `.dsh/cordis.patch.yml` 做热更新，不会多装一份插件。

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

协作说明在 [AGENTS.md](./AGENTS.md) 和 `.agent/`。

## License

[MIT](./LICENSE)
