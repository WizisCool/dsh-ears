# dsh-ears glossary

## ASR

Automatic speech recognition, the conversion of recorded or streamed speech into text

## Tencent Cloud ASR

腾讯云语音识别产品族，当前设置页以一个腾讯云提供商和产品选择器呈现

## Standard recording file recognition

Tencent Cloud's API 3.0 recording recognition service. It accepts a complete audio payload over HTTPS, creates a task, and returns the final transcript through task polling.

## 实时语音识别

Tencent Cloud's documented real-time speech recognition product, designed for streaming audio and incremental recognition results

## AppID

The Tencent Cloud account/application identifier used by the realtime WebSocket path and by the Host credential configuration

## SecretID

The Tencent Cloud credential identifier used by API 3.0 and realtime signing. It is paired with SecretKey and AppID

## SecretKey

The Tencent Cloud signing secret used by API 3.0 and realtime authentication. In dsh-ears it is Host-only and stored through a write-only secret setting

## engine_type

Tencent's identifier for the recognition engine, such as `16k_zh`. It is not an OpenAI-style model name

## Final-result transcription

A one-shot ASR operation that returns text after the recording stops. This is the current cloud ASR contract in dsh-ears

## Provider

A selectable cloud ASR service entry in the Host-side registry. A provider may use a shared protocol adapter or its own wire adapter

## Free quota

A Tencent account-side usage allowance. It is not a plugin-controlled budget, entitlement, or guarantee that every account or engine remains free

## MiMo

Xiaomi's cloud ASR service. It is a first-class cloud ASR provider in dsh-ears (`protocol: 'mimo'`, default model `mimo-v2.5-asr`). MiMo speaks an OpenAI-compatible multimodal Chat Completions contract with base64 `input_audio` WAV payloads, not the `/audio/transcriptions` multipart form, so it needs its own adapter rather than the Custom backend

## Access method

MiMo's two connection schemes, `api` (standard platform API) and `token-plan` (Token Plan subscription). The selected method determines which base URL the Host calls. Only `token-plan` exposes a regional cluster

## Token Plan

MiMo's subscription billing tier. Its key format differs from the standard API key (`tp-...` vs `sk-...`), and it is served from one of three regional clusters rather than the single platform API origin

## Token Plan cluster

The regional MiMo Token Plan endpoint, one of `cn` (China), `sgp` (Singapore), or `ams` (Europe/Amsterdam). The Host derives the transcription endpoint from the selected cluster

## Recognition language

The per-backend speech-recognition language setting (D-042). Each backend's field maps to its protocol's native language parameter, so there is no shared global language field. Empty means follow the dsh English/中文 locale for Web Speech and automatic detection — the language parameter is omitted — for Local Whisper, Groq, Bailian, MiMo, and custom OpenAI-compatible backends. Tencent Cloud expresses language through `engine_type`
