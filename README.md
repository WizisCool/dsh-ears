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
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.1.0--rc.6%20--%200.1.1--rc.2-1a73e8?style=flat-square" alt="dsh 0.1.0-rc.6 - 0.1.1-rc.2"></a>
  <a href="https://www.npmjs.com/package/dsh-ears"><img src="https://img.shields.io/npm/v/dsh-ears?style=flat-square&logo=npm" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT"></a>
</p>

```text
DeepSeek Harness 语音输入插件：支持多种 ASR 后端，并通过 dsh 自身的 LLM 路径完成润色。
```

https://github.com/user-attachments/assets/1363768e-a393-44bd-a008-1ce2055cac41

---

录音时，输入框上方会显示带波形和停止按钮的识别条。转写或润色进行中，可点击垃圾桶图标丢弃本次录音。

## 安装

前置依赖：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`0.1.0-rc.6` 至 `0.1.1-rc.2`）和 Node.js `^22.19.0 || >=24.0.0`。

**通过 npm 安装：**

```sh
dsh plugin --profile web add dsh-ears
```

### DSH 插件市场

`dsh-ears` 已被 [DSH Market](https://github.com/dsh-market/dsh-market) 收录，可在设置 → 插件市场中直接安装、更新和卸载。

**从源码安装：**

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm use:platform
pnpm install
pnpm build
dsh plugin --profile web add "$PWD"
# Windows 的 cmd 请使用 "%CD%"；PowerShell 直接使用 $PWD
```

安装完成后刷新 Web UI，输入框右侧会显示麦克风图标。

## 更新

更新到最新版本：

```sh
dsh plugin --profile web update dsh-ears
```

更新完成后刷新 Web UI。

## 卸载

```sh
dsh plugin --profile web remove dsh-ears
```

这条命令会移除 dsh 中的插件注册，源码目录保持不变。卸载后刷新 Web UI，麦克风图标会消失。

## 使用

1. 点击麦克风图标，或按下 `Ctrl+Shift+Space`
2. 开始说话
3. 再次按下快捷键，或点击麦克风，停止录音并开始转写
4. 开启润色后，原始转写会先写入草稿，润色完成后再更新，期间的手动编辑会被保留
5. 检查内容后手动发送

如果所选后端尚未就绪，麦克风图标会变灰，悬停即可查看原因。

## 识别后端

| 后端 | 工作方式 | 需要什么 | 免费额度 |
| --- | --- | --- | --- |
| Web Speech | 浏览器实时识别，边说边出字 | Chromium 内核浏览器。音频可能经由浏览器厂商处理 | — |
| 本地 Whisper | 浏览器停止录音后标准化为单声道 16 kHz PCM16 WAV，再由 Host 通过内置 whisper.node native 依赖转写 | npm 安装会带来对应平台的 native 变体；在设置页下载 whisper.cpp GGML 模型，模型不随 npm 包打包 | — |
| [Groq](https://console.groq.com) | Host 将录音发送到 Groq Whisper API | Groq API key | Always Free，[Rate Limits](https://console.groq.com/docs/rate-limits) |
| [阿里云百炼](https://www.aliyun.com/product/bailian) | DashScope 同步转写（Flash 系列） | HTTPS 源站、API key 和模型名；单次录音最长 300 秒 | [新人免费额度](https://help.aliyun.com/zh/model-studio/new-free-quota) |
| 自定义 OpenAI 兼容 | 向指定的 `/audio/transcriptions` 端点发送请求 | 端点地址、API key 和模型名 | — |
| 贡献新后端 | — | 欢迎通过 [提交 PR](https://github.com/WizisCool/dsh-ears/pulls) 接入更多转写服务 | — |

> 表中的额度来自提供商文档，可能随时变化，请以提供商的最新说明为准。
>
> 本地 Whisper 使用随包提供的 `@fugood/whisper.node` native runtime 和单独下载的 whisper.cpp GGML 模型，浏览器负责把录音转为单声道 16 kHz PCM16 WAV
>
> Recognition 设置页只显示当前平台和已安装 native variant 支持的加速后端。macOS 的官方产物只提供 Default，因此不会显示 CUDA；Windows x64 和 Linux 的可用项以实际安装的 optional variant 为准。无法加载的 native variant 会从可用选项中省略。native runtime 首次加载后切换加速后端需要重启 dsh Host。当前锁定的 `@fugood/whisper.node@1.1.2` Windows x64 CUDA 产物需要 CUDA 12 的 `cudart64_12.dll` 和 `cublas64_12.dll`；模型按需下载到本机缓存

## 本地 Whisper 运行时

本地 Whisper 包含 npm 包内的 `@fugood/whisper.node` native dependency，以及插件单独下载的 whisper.cpp GGML 模型文件。模型下载使用固定 manifest、校验和、临时文件和完成标记，模型权重存储在本机缓存。

浏览器录音会先下混、重采样并编码为单声道 16 kHz PCM16 WAV，再发送给 Host。设置页会显示 native package 或所选加速后端的状态，并提供模型下载与重新检测入口。

## 润色

润色模型从 `dsh → 设置 → 模型` 中已经配置的模型里选择。插件只保存提供方、模型名和提示词；LLM key 直接复用 dsh 的现有配置。

默认提示词会删除口头禅、修正常见的 ASR 错字，还能处理「不是 A，是 B」这类自我纠正和「第一……第二……」这类口头列举。提示词留空时使用内置默认值，具体内容可在设置页查看。润色失败或取消时，插件会保留原始转写结果。

## 本地开发

```sh
pnpm use:platform
pnpm install
dsh plugin --profile web add "$PWD"
# Windows 的 cmd 请使用 "%CD%"；PowerShell 直接使用 $PWD
pnpm check
pnpm test
pnpm build
pnpm dev:config   # 构建并生成 HMR 配置
pnpm dev:web      # 启动 dsh web
```

开发时，在另一个终端运行 `pnpm dev:watch`。`pnpm dev:config` 会写出 `.dsh/cordis.patch.yml`（已在 `.gitignore` 中）用于 HMR，并保持单个插件加载项。

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [LICENSE](./LICENSE)

贡献指南和架构说明见：[CONTRIBUTING.md](./CONTRIBUTING.md)、[AGENTS.md](./AGENTS.md)、[`.agent/`](./.agent/README.md)。

## License

[MIT](./LICENSE)

## 友链

- [LINUX DO](https://linux.do) — 新的理想型社区
