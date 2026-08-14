# Project Context

## Purpose

`dsh-ears` 是 DeepSeek Harness 的语音输入插件，目标是为纯文本 dsh Web UI 增加接近 Codex Desktop 的语音输入体验：说话时实时出现识别 draft，停止后可由 dsh 已接入的任意模型润色，用户确认后手动发送。

## Scope baseline

- 第一版锁定 dsh `0.1.0-rc.6`。
- M2 只做浏览器 Web Speech API；不引入 MediaRecorder、AudioWorklet、PCM 或 ASR RPC。
- Web Speech 失败时保留当前 draft 并提示重新录音；不做同一会话无缝切换。
- 润色只选择 dsh 已接入的 provider/model 路由，配置保存 `{ provider, model }`，不保存插件自有 API Key、base URL 或自定义 provider。
- 润色由 Host 侧复用 dsh `ctx.llm` 和 credentials；Client 不直接请求 LLM。
- 本机 Whisper、云端 ASR、情绪标签属于后续范围。

## Planned package shape

正式包需要同时提供：

- Host entry：`exports["."]`，负责 Cordis 插件生命周期、Host RPC 和设置注册。
- Client entry：`exports["./client"]`，负责浏览器 UI、麦克风按钮和输入 draft。
- `dsh.bundle.patch`：发布安装时的 profile patch。
- `dsh.client`：浏览器插件声明，目标平台为 `web`。

开发期 `.dsh/cordis.patch.yml` 只负责本机路径和 HMR，不能代替发布 bundle patch。

## Runtime boundaries

```text
Browser Client
  ├─ Web Speech session
  ├─ conversation.input.right
  ├─ inputActions.setDraft()
  └─ polish RPC ──> Host
                      └─ dsh ctx.llm + configured credentials
```

后续音频 ASR 需要单独定义音频格式、分片、取消、超时和错误结构；通用 JSON RPC 不自动等于音频流通道。

## Privacy and release

Web Speech API 可能使用浏览器厂商的外部识别服务。README 和设置页必须明确提示这一点。仓库未来可能公开，提交中不得包含凭据、私人端点、Cookie、用户数据或本机内部路径。
