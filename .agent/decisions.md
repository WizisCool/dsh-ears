# Architecture Decision Records

## D-001: Project identity

- 状态：accepted
- 决定：项目名统一为 `dsh-ears`。
- 原因：与“给纯文本 DeepSeek 装耳朵”的定位一致，避免使用 Typeless 商标。

## D-002: Interaction contract

- 状态：accepted
- 决定：点击麦克风开始；识别结果实时进入可编辑 draft；停止后由用户手动发送。
- 禁止：自动发送、把识别结果直接当成已确认消息。

## D-003: First ASR milestone

- 状态：accepted
- 决定：M2 先实现 Web Speech API；不把它与录音 PCM 或 Whisper 采集混为一谈。
- 失败行为：保留已识别 draft，提示用户重新录音。

## D-004: LLM ownership

- 状态：accepted
- 决定：润色只使用 dsh 已接入的 provider/model，插件保存 `{ provider, model }` 选择。
- 禁止：插件自定义 `base_url`、`api_key`、provider、模型输入框或浏览器端 LLM 请求。

## D-005: Host/Client packaging

- 状态：accepted
- 决定：正式包必须同时提供 Host `.` 与 Client `./client` 两个 exports，并声明 `dsh.bundle.patch` 和 `dsh.client`。
- 开发 HMR overlay 与发布 bundle patch 分离。

## D-006: Compatibility

- 状态：accepted
- 决定：第一版只验证 dsh `0.1.0-rc.6`，不提前承诺其他 rc 版本。

## D-007: Deferred scope

- 状态：accepted
- 决定：本机 Whisper、云端 ASR 和情绪 UI 延后；情绪字段可以预留，但不能成为第一版主流程依赖。
