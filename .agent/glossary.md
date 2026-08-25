# dsh-ears glossary

## ASR

Automatic speech recognition, the conversion of recorded or streamed speech into text

## Tencent Cloud ASR

腾讯云语音识别产品族，当前设置页以一个腾讯云提供商和产品选择器呈现

## 录音文件识别极速版

Tencent Cloud's documented Flash Edition recording file recognition product. It accepts a complete audio payload over HTTPS and returns a final JSON result

## 录音文件识别（大模型引擎）

Tencent Cloud's recording file recognition product using the documented Big Model Engine option

## 实时语音识别

Tencent Cloud's documented real-time speech recognition product, designed for streaming audio and incremental recognition results

## AppID

The Tencent Cloud account/application identifier included in the Flash request path and signature inputs

## SecretID

The Tencent Cloud credential identifier included in the signed request query. It is paired with SecretKey and AppID

## SecretKey

The Tencent Cloud signing secret used for HMAC-SHA1. In dsh-ears it is Host-only and stored through a write-only secret setting

## engine_type

Tencent's identifier for the recognition engine, such as `16k_zh`. It is not an OpenAI-style model name

## Final-result transcription

A one-shot ASR operation that returns text after the recording stops. This is the current cloud ASR contract in dsh-ears

## Provider

A selectable cloud ASR service entry in the Host-side registry. A provider may use a shared protocol adapter or its own wire adapter

## Free quota

A Tencent account-side usage allowance. It is not a plugin-controlled budget, entitlement, or guarantee that every account or engine remains free
