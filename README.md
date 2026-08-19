<p align="center">
  <img src="./assets/banner.jpg" width="100%" alt="dsh-ears" />
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

```text
麦克风 → 转写 → 可选润色 → 可编辑草稿 → 手动发送
```

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

---

识别后端支持浏览器原生 Web Speech、本机 Whisper、[Groq](https://console.groq.com)、[阿里云百炼](https://www.aliyun.com/product/bailian)，以及任意 OpenAI 兼容转写接口。润色可以选择 dsh 里已经接好的任何模型，提示词可以自定义。默认快捷键 `Ctrl+Shift+Space`。

## 安装

前置依赖：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`0.1.0-rc.6` 或 `rc.7`），Node.js `^22.19.0 || >=24.0.0`。

**从 npm 安装：**

```sh
dsh plugin --profile web add dsh-ears
```

如果还没安装 `dsh` CLI：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-ears
```

**从源码安装：**

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm install
pnpm build
dsh plugin --profile web add "$PWD"
```

安装完成后刷新 Web UI，输入框右侧会出现麦克风图标。


## 识别后端

| 后端 | 工作方式 | 需要什么 | 免费额度 |
| --- | --- | --- | --- |
| Web Speech | 浏览器实时识别，边说边出字 | Chromium 内核浏览器。音频可能经由浏览器厂商处理 | — |
| 本地 Whisper | 停止录音后由 Host 调用本机 `whisper` CLI 转写 | 预装 openai-whisper，在插件设置页下载模型（权重不随插件打包） | — |
| [Groq](https://console.groq.com) | Host 把录音发给 Groq Whisper API | Groq API key | Always Free，[Rate Limits](https://console.groq.com/docs/rate-limits) |
| [阿里云百炼](https://www.aliyun.com/product/bailian) | DashScope 同步转写（Flash 系列） | HTTPS 源站、API key、模型名；单次上限 300 秒 | [新人免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota) |
| 自定义 OpenAI 兼容 | POST 到指定的 `/audio/transcriptions` 端点 | 端点地址、API key、模型名 | — |
| 🤝 贡献新后端 | — | 欢迎 [提交 PR](https://github.com/WizisCool/dsh-ears/pulls) 接入更多转写服务 | — |

> 上表额度摘自提供商文档，README 更新可能不及时，请以提供商最新说明为准。

> Whisper `medium` 及以上的模型纯靠 CPU 很难在 120 秒内跑完，建议配合 GPU 或更快的本地运行时。

## 润色

润色模型从 `dsh → 设置 → 模型` 里已接入的列表中选取。插件只保存提供方、模型名和提示词，LLM key 复用 dsh 已有的配置。

默认提示词会去口头禅、修 ASR 错字，也能处理「不是 A 是 B」的自我纠正和「第一…第二…」的口头列举。留空则使用内置默认提示词，内容可在设置页查看。润色失败或取消时保留原始转写。

## 本地开发

```sh
pnpm install
dsh plugin --profile web add "$PWD"
pnpm check
pnpm test
pnpm build
pnpm dev:config   # 生成热更新配置
pnpm dev:web      # 启动 dsh web
```

开发时另开终端跑 `pnpm dev:watch`。`pnpm dev:config` 会写出 `.dsh/cordis.patch.yml`（已在 .gitignore 中）用于 HMR，不会多注册插件。

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

贡献指南与架构说明：[CONTRIBUTING.md](./CONTRIBUTING.md)、[AGENTS.md](./AGENTS.md)、[`.agent/`](./.agent/README.md)。

## License

[MIT](./LICENSE)
