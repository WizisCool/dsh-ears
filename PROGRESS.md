# dsh-ears Progress

Status: released to private GitHub repo (WizisCool/dsh-ears) with MIT license (2026-08-15); npm publish still requires maintainer approval.

## Done

- Established an English-first dsh plugin package with Host/Client exports, bundle patch, HMR development patch, agent context, security policy, and contribution guidance.
- Implemented the end-to-end flow: Web Speech or final audio capture → transcript → optional dsh model polishing → editable draft → manual send.
- Added local Whisper and OpenAI-compatible cloud ASR backends with native dsh settings, cancellation, cleanup, size limits, and credential references.
- Adapted the microphone to dsh light/dark semantic tokens and the model → microphone → send composer hierarchy.
- Kept configuration inside dsh's native settings window through a dedicated `settings.section` page.
- Renamed the plugin configuration card title to `dsh-ear` and clarified the read-only hint in both locales.
- Moved plugin configuration to a dedicated `settings.section` page (`dsh-ear`, beside General/Models/Plugins) styled with the shipped settings pages' tokens and card geometry.
- Split the page into Plugins-style tab cards (Recognition / Polishing) with matching keyboard navigation.
- Switched fields to the General/Permissions row pattern (pill Menu selectors) with debounced auto-save; feedback follows the native pattern — no success/saving text, only a failure line and red row hints.
- Cleaned backend labels (Web Speech / Local Whisper / Cloud ASR); only the active backend's configuration rows and hint text are shown, each backend's settings persist independently across switches, and auto-save skips invalid fields individually instead of blocking.
- Polishing rows renamed (Provider / Model) with simplified hints and display-name-only pickers; the polishing toggle kept as a pill selector, and a dsh-route-driven reasoning-effort picker (model default supported) was added.
- The settings page now distinguishes a failed first fetch (load-failure hint with one retry) from a genuinely read-only provider; Host-side updates require a dsh web restart.
- Provider switches clear stale model/reasoning selections; the provider/model pair rule applies only while polishing is on (Host and client agree), and the reasoning picker offers the adapter's `off` effort as an explicit switch-off.
- Polishing is disabled by default; its rows appear only after the toggle is enabled, the no-polish option is removed, an enabled polish requires a complete provider/model pair, and reasoning labels are adapter-native (untranslated `Default`, matching the model selector).
- Whisper model availability is now visible: downloaded state, a download action with progress (delegated to the installed library, tqdm-derived), and honest errors across platforms/environments.
- Whisper model state controls now surface Host/Remote failures while preserving the last known state, instead of silently looking like an unavailable or missing model.
- Hardened settings auto-save so incomplete Cloud ASR and polishing changes stay local until their required fields are complete; Host/Client Remote cancellation metadata is now aligned.
- Hardened async lifecycles: stale Whisper actions and late aborted polish results are ignored, MediaRecorder start failures release tracks, and failed Whisper downloads keep cancellation authoritative with a visible retry action.
- Added Host bounds and validation: Cloud ASR requests time out after 120 seconds, streamed polish output is capped, canceled Whisper probes short-circuit, and unknown backend/model identifiers are rejected.
- Hardened the Whisper model lifecycle: downloads are only reported complete with their `.dsh-ears-done` marker (closing the crash-residue question), transcription pre-flights the CLI and the marked model file instead of auto-downloading mid-recording, the model manager is disposed with the plugin scope, discovery failures are negative-cached for 30 seconds, and transcription errors carry the whisper stderr tail.
- Fixed Windows python/py launcher probing (`.exe` + PATHEXT) with unit coverage; Windows remains documented as not yet smoke-tested.
- Documented the 120-second scale boundary: `medium` and larger models need a GPU or a faster runtime (settings hint + README).
- Covered the full model lifecycle with fake-python integration tests: download/cancel/delete, progress parsing, completion markers, dispose cleanup, and negative caches.
- Grayed the composer microphone (D-021) on positive unavailability signals: backend reported unavailable, Whisper model downloading, or model file with marker missing — with bilingual tooltips and pure-function unit coverage; loading/unknown and active flow states never gray.
- Added cloud ASR provider presets (D-023): a Host-side registry (`src/asr/providers.ts`) with the Groq preset (pinned endpoint, `whisper-*` model filter, required inline key) and the Custom OpenAI-compatible provider (`whisper-1` default); `cloudAsrCredentialRef` was replaced by the write-only `role('secret')` `cloudAsrApiKey` (redacted reads, absent=keep/set/clear patch semantics).
- Added the `dshEars/listCloudProviderModels` RPC replicating the dsh-llm-pi-ai catalog pattern: `GET {baseUrl}/models` with bearer auth, 4 MiB bounded parse, registry filter, 15-second timeout, 30-second failure negative cache, no-key/unsupported/error statuses.
- Reworked the Recognition selector into one grouped menu (Local: Web Speech / Local Whisper; Cloud providers: Groq / Custom OpenAI-compatible) with `MenuLabel`/`MenuSeparator` groups, per-provider hint text, a pinned read-only Groq endpoint row, a write-only API key row (configured state + clear action), and a live-model row for Groq (empty until key, retry on failure, stale-model notice).
- Folded cloud readiness into `listAsrBackends`: the cloud backend reports unavailable until the selected provider's key and model are configured, extending the D-021 positive-signal gating to cloud readiness.

## Verified

- `pnpm check` passed.
- `pnpm test` passed: 111 tests across 12 files.
- `pnpm build` passed.
- `pnpm pack --dry-run` passed; the tarball includes the Host/Client entries, declarations, bundle patch, README, and changelog.
- Real dsh Host/browser loading, native settings persistence, and hot-reload Remote injection were verified.
- Local Whisper produced a transcript from generated audio and the same result was returned through a real dsh Host RPC.
- Light/dark composer layout and dsh token behavior were measured in the local Web surface.
- Final rc.6 smoke after hardening: temporary Web boot on port 64803 loaded `/plugins/dsh-ears/client.js`; native `dsh-ear` Recognition/Polishing tabs loaded, Whisper state RPC rendered, composer order remained model → microphone → send, and browser warning/error logs were empty.

## Still intentionally open

- Emotion recognition/output and emotion UI are deferred by design.
- Only dsh `0.1.0-rc.6` is currently supported.
- A non-empty live polish completion depends on a usable model route configured in the local dsh environment; route discovery and failure fallback are covered.
- Browser microphone permission and platform-specific Web Speech behavior need broader manual coverage.
- A Host restart during Whisper download no longer fakes a downloaded model: state checks require the `.dsh-ears-done` completion marker, so a partial file is reported as not downloaded (D-020; the earlier checksum-or-marker question is closed).
- A recording currently reads backend/model/language settings when the Host transcribe RPC begins; locking or snapshotting those settings during an active recording remains a protocol decision.
- The Groq preset needs a real rc.6 Web smoke (Host-side changes require a `dsh web` restart plus a browser refresh) and a live `zh` transcription smoke with a real Groq key; Groq's docs do not explicitly list Chinese.
- Temporary HMR shutdown can log an `Invalid revision range .....HEAD` diagnostic; it needs confirmation against dsh rather than a plugin-side workaround.
- npm publish and any public visibility change require explicit maintainer approval.
