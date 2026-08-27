# Security Policy

## Scope

dsh-ears handles microphone recordings, transcripts, dsh model routes, and optional user-configured cloud ASR endpoints. The Host/Client boundary is intentional: browser code receives transcript results and settings, while credentials and Host-side process/network operations stay on the dsh Host.

## Data handling

- Web Speech recognition is performed by the browser API and may transmit audio to the browser vendor.
- Local/cloud backends capture one recording with `MediaRecorder`, then send it to the Host through a bounded RPC.
- Local Whisper uses the bundled whisper.node native runtime, writes normalized PCM16 WAV audio only to a private temporary directory, and removes that directory after success, failure, or cancellation. The model is downloaded separately into the plugin cache and is not bundled into the npm tarball.
- The cloud adapter sends audio only to the endpoint selected by the configured provider: preset providers (Groq, Deepgram, Tencent Cloud, and MiMo) use their Host-pinned endpoint, while Bailian and Custom use a user-supplied endpoint. It does not crawl, discover, or probe endpoints.
- Cloud responses are bounded before JSON parsing. Audio and transcript data are not intentionally logged or persisted by the plugin.
- The draft remains user-editable. Late ASR or polishing results are discarded when the user has changed the draft.

Users should review the retention, processing, and jurisdiction policy of any cloud ASR or browser-vendor recognition service they select.

## Credentials

Never put a secret in source code, tests, screenshots, logs, or commits. Cloud ASR API keys are stored on the dsh Host through schemastery `role('secret')` settings fields, one per provider (`groq.apiKey`, `deepgram.apiKey`, `customOpenAi.apiKey`, `bailian.apiKey`, `tencent.secretKey`, `mimo.apiKey`), following the shipped `dsh-web-search-deepseek` pattern: values are write-only across the plugin wire — `getSettings` redacts them and reports only configured booleans, and `updateSettings` uses absent=keep / set / empty=clear semantics. Browser code never receives the key, and the key is never included in the repository.

Cloud endpoint URLs must use HTTP(S) and must not contain embedded credentials. Custom endpoints with an API key must use HTTPS; credential-free local HTTP endpoints remain available for local deployments. Preset providers (Groq, Deepgram, Tencent Cloud, and MiMo) pin their endpoint on the Host side; Bailian accepts a user-supplied HTTPS origin and the Custom OpenAI-compatible provider accepts a user-supplied endpoint.

## Host safety

- Local Whisper loads the selected native package directly; it does not spawn Python, Torch, FFmpeg, or a Whisper CLI process.
- Audio, response, stderr, and transcript sizes are bounded.
- Abort signals are forwarded to ASR and LLM operations.
- Temporary files and MediaRecorder tracks are released on all terminal paths.
- User-configured private/localhost endpoints are allowed as an explicit administrator choice; deployments should restrict endpoint configuration and egress according to their environment.

## Never commit

- API keys, OAuth tokens, cookies, passwords, private keys, or credentials.
- dsh profiles or `.env` files containing credentials.
- User audio, transcripts, logs, screenshots, or personal data.
- Private endpoints, internal addresses, or personal absolute paths.

## Reporting

Do not open a public issue containing a secret or a complete exploit. Stop the relevant work and report it privately to the maintainer with only the minimum information needed to reproduce it.

## Release rule

Push, public-repository conversion, npm publishing, and release tags are not default actions. Before any public release, complete a human review, sensitive-information scan, build/test verification, dependency audit, and license review.
