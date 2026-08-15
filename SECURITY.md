# Security Policy

## Scope

dsh-ears handles microphone recordings, transcripts, dsh model routes, and optional user-configured cloud ASR endpoints. The Host/Client boundary is intentional: browser code receives transcript results and settings, while credentials and Host-side process/network operations stay on the dsh Host.

## Data handling

- Web Speech recognition is performed by the browser API and may transmit audio to the browser vendor.
- Local/cloud backends capture one recording with `MediaRecorder`, then send it to the Host through a bounded RPC.
- Local Whisper writes audio only to a private temporary directory and removes that directory after success, failure, or cancellation.
- The cloud adapter sends audio only to the endpoint explicitly configured by the user. It does not crawl, discover, or probe endpoints.
- Cloud responses are bounded before JSON parsing. Audio and transcript data are not intentionally logged or persisted by the plugin.
- The draft remains user-editable. Late ASR or polishing results are discarded when the user has changed the draft.

Users should review the retention, processing, and jurisdiction policy of any cloud ASR or browser-vendor recognition service they select.

## Credentials

Never put a secret in plugin settings, source code, tests, screenshots, logs, or commits. The cloud ASR setting stores only a dsh credential reference such as `OPENAI_API_KEY`; dsh resolves the value for one Host operation. API keys are never sent to the browser and are never included in the repository.

Cloud endpoint URLs must use HTTP(S) and must not contain embedded credentials. HTTPS is recommended for any non-local endpoint.

## Host safety

- Local Whisper is spawned with an argument array, never through a shell.
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
