# dsh-ears Progress

Status: released to private GitHub repo (WizisCool/dsh-ears) with MIT license (2026-08-15); npm publish still requires maintainer approval.

## Done

- Established an English-first dsh plugin package with Host/Client exports, bundle patch, HMR development patch, agent context, security policy, and contribution guidance.
- Implemented the end-to-end flow: Web Speech or final audio capture → transcript → optional dsh model polishing → editable draft → manual send.
- Added local Whisper and OpenAI-compatible cloud ASR backends with native dsh settings, cancellation, cleanup, size limits, and credential references.
- Adapted the microphone to dsh light/dark semantic tokens and the model → microphone → send composer hierarchy.
- Kept configuration inside dsh's native Plugins page.
- Renamed the plugin configuration card title to `dsh-ear` and clarified the read-only hint in both locales.
- Moved plugin configuration to a dedicated `settings.section` page (`dsh-ear`, beside General/Models/Plugins) styled with the shipped settings pages' tokens and card geometry.
- Split the page into Plugins-style tab cards (Recognition / Polishing) with matching keyboard navigation.
- Switched fields to the General/Permissions row pattern (pill Menu selectors) with debounced auto-save; feedback follows the native pattern — no success/saving text, only a failure line and red row hints.
- Cleaned backend labels (Web Speech / Local Whisper / Cloud ASR); only the active backend's configuration rows and hint text are shown, each backend's settings persist independently across switches, and auto-save skips invalid fields individually instead of blocking.

## Verified

- `pnpm check` passed.
- `pnpm test` passed: 29 tests across 7 files.
- `pnpm build` passed.
- `pnpm pack --dry-run` passed; the tarball includes the Host/Client entries, declarations, bundle patch, README, and changelog.
- Real dsh Host/browser loading, native settings persistence, and hot-reload Remote injection were verified.
- Local Whisper produced a transcript from generated audio and the same result was returned through a real dsh Host RPC.
- Light/dark composer layout and dsh token behavior were measured in the local Web surface.

## Still intentionally open

- Emotion recognition/output and emotion UI are deferred by design.
- Only dsh `0.1.0-rc.6` is currently supported.
- A non-empty live polish completion depends on a usable model route configured in the local dsh environment; route discovery and failure fallback are covered.
- Browser microphone permission and platform-specific Web Speech behavior need broader manual coverage.
- npm publish and any public visibility change require explicit maintainer approval.
