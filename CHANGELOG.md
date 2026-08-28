# Changelog

All notable changes to dsh-ears are recorded here.

## [0.2.1] - 2026-08-29

Update-command copy fix.

### Changed

- The About panel, the update check result, and the README update section now show `dsh plugin --profile web add dsh-ears` instead of `dsh plugin --profile web update dsh-ears`. `add` re-resolves `latest` from npm and rewrites the saved range, so one command works from any installed version, including crossings that `pnpm update` clamps to the existing range (such as 0.1.x to 0.2.0).
- The README update section names the manual steps the command does not perform: restart `dsh web` to load the new Host code, then refresh the Web UI.

## [0.2.0] - 2026-08-29

SiliconFlow provider and ASR/settings hardening release.

### Added

- [SiliconFlow](https://siliconflow.cn) CN edition (`api.siliconflow.cn`) as a cloud ASR provider on the Recognition tab: an OpenAI-compatible preset over the shared transcription adapter with the default model `FunAudioLLM/SenseVoiceSmall`, a live model list scoped by `sub_type=speech-to-text`, write-only API key storage, and a per-provider recognition language. The international edition is deferred (D-047).
- A versioned settings migration path (V1 through V4) that upgrades flat and grouped legacy layouts in place, with conservative normalization for files written by newer versions.
- Automatic repair of invalid persisted settings: unknown providers, backends, models, shortcuts, or out-of-range values fall back to safe defaults, the settings page lists the recovered fields, and the repaired configuration persists on the next save.
- SemVer-correct update checks, a dsh compatibility smoke suite, package/release verification scripts, Dependabot configuration, and CI coverage for the whole matrix.

### Changed

- Cloud ASR providers are registry-driven: provider metadata, field validation, credential/model resolution, persistence mappings, secret redaction, and the settings UI rows derive from one `CLOUD_ASR_PROVIDERS` table.
- Fresh installs default to browser Web Speech recognition; Local Whisper remains selectable, and its `default` acceleration resolves automatically against platform-supported native variants and locks only after native initialization (D-045, D-046).
- Polishing is enabled by default and follows dsh's live Agent default model, including its reasoning effort, when no explicit dsh-ears route is configured; the projected default is not persisted (D-045).
- Deepgram model lists come from the live catalog with provider-reported capabilities; models whose wire transport the adapter cannot execute (Listen V2, e.g. Flux) stay hidden per service.
- Remote descriptors and strict wire schemas are unified in one descriptor table; credentials stay Host-owned and are redacted as configured booleans.

### Fixed

- Invalid persisted settings no longer abort plugin registration or block the settings and config pages.
- Hardened request cancellation, timeouts, response-size caps, realtime session cleanup, and stale async writes across providers and client controllers.
- Bailian endpoints enforce HTTPS for credential-bearing requests, and DashScope failures surface the provider error code.

## [0.1.6] - 2026-08-27

Xiaomi MiMo cloud ASR provider release.

### Added

- [Xiaomi MiMo](https://mimo.mi.com) as a cloud ASR provider on the Recognition tab: API key, model selector (`mimo-v2.5-asr` static list), recognition-language, and an access-method toggle between the standard `api` and the `token-plan` subscription. Standard API posts to `https://api.xiaomimimo.com/v1/chat/completions`; Token Plan selects a regional cluster (`cn` default, `sgp`, `ams`) and derives the matching `token-plan-<cluster>.xiaomimimo.com` endpoint. Recording uses authenticated, OpenAI-compatible `/chat/completions` transcription with a bounded response, abort propagation, and an HTTPS-enforced endpoint.
- MiMo Host storage under `cloudAsr.mimo` (`apiKey` with `role('secret')`, `model`, `language`, `endpoint`, `cluster`, `service`), Typert / `remote-contract` wire fields, and settings-store backing.
- Cloud provider vendor icons in the client bundle (Groq, Deepgram, Alibaba Cloud, Tencent Cloud, Xiaomi MiMo, OpenAI); `@thesvg/react` moves to devDependencies so the icons are inlined at build time rather than shipped as a runtime icon dependency.

### Changed

- Cloud provider model listing is isolated per provider: `listCloudProviderModels(provider, signal)` now takes an explicit provider argument and Resolves it by id on the Host instead of trusting a stale settings snapshot, so model lists no longer leak across providers.
- The recognition-language row is unified so every auto-detection backend (Local Whisper, Groq, Deepgram, Bailian, MiMo, and the custom OpenAI-compatible branch) uses a `placeholder="auto"` input whose empty value means automatic detection; Web Speech keeps its locale-following placeholder.
- Recognition-tab copy, provider presets, and the About/Context translation strings updated for the MiMo provider.

### Fixed

- Cloud model listing and validation no longer depend on the previously applied settings snapshot, preventing cross-provider model list contamination.

## [0.1.5] - 2026-08-26

Cloud ASR recognition and recognition-language ownership release.

### Added

- [Deepgram](https://deepgram.com) as a cloud ASR provider on the Recognition tab: API key, model selector (live-fetched via `GET /v1/models` with a static `nova-3` fallback and "Custom model" branch), recognition-language, and `recording-file` / `realtime` service toggle. Recording uses `POST https://api.deepgram.com/v1/listen`; realtime uses `wss://api.deepgram.com/v1/listen` with `linear16` / `16000` / `interim_results` / `vad_events`.
- Deepgram Host storage under `cloudAsr.deepgram` (`apiKey` with `role('secret')`, `model`, `language`, `service`), Typert / `remote-contract` wire fields, and settings-store migration that drops the legacy top-level `recognitionLanguage` on upgrade to schema version 4.
- Tencent Cloud realtime recognition: an `realtime` branch next to `recording-file` on the Recognition tab, backed by WebSocket recognition in `PolishService` (`startRealtime` / `sendRealtimeAudio` / `finishRealtime` / `cancelRealtime`) and a shared realtime PCM capture path.
- Recognition-tab microphone routing for `tencent` / `deepgram` realtime modes; realtime backends reuse Web Speech-style gating semantics via `isRealtimeAudioCaptureAvailable`.

### Changed

- The General-tab recognition-language row is removed (D-042). Every backend now owns its recognition-language field on the Recognition tab: a language row inside the Web Speech, Local Whisper, Groq, Deepgram, Bailian, and custom OpenAI-compatible branches; Tencent Cloud keeps its engine-type selector and gains no language row.
- Leaving the recognition-language field blank now means automatic detection for Local Whisper and the cloud providers (Groq, Deepgram, Bailian, custom OpenAI-compatible) — the language parameter is omitted — and following the interface language for Web Speech. Previously stored recognition-language values are dropped when the settings store upgrades to schema version 4.
- Tencent Cloud recognized-engine field renamed to `cloudAsrTencentEngineType` with a tightened hint string.
- Recognition-tab copy and provider presets simplified; Tencent / Deepgram service-row copy refined.
- Deepgram recording / realtime recognition URLs reject non-`https:` / non-`wss:` schemes and purge stale `language` / `detect_language` query parameters when switching to `auto` / empty detection, so `auto` cannot leak a prior explicit language.
- Recognition-tab polishing and settings copy use a stricter one-clause hint style.

### Fixed

- Primary action button focus no longer flickers the microphone button: `MicrophoneButton` no longer relies on a fragile `:last-child` flex order, and its active state icon stays white in dark mode.
- Polishing LLM route discovery now refreshes automatically on window focus / tab visibility instead of requiring an explicit button, fixing stale provider/model lists after the Host is reconfigured.
- Deepgram realtime recognition no longer blocks on a 120 ms grace window per chunk: the realtime path sends PCM with a non-blocking grace and enables `interim_results` / `endpointing=300` / `vad_events=true`, so transcription streams promptly and finishes without a post-recording hang.
- Realtime WebSocket sessions clean up listeners correctly on server-initiated close, preserve `EarsError` business codes for `startRealtime`, and close leaked sockets when `open()` fails.
- `fetchCloudProviderModels` no longer misses an already-aborted signal before installing its forward listener. Deepgram's `/v1/models` response is parsed from `stt` rather than `data` and empty filtered results are rejected with `cloudModelsNoModels`. Deepgram `stt` model names that are internal / test entries are filtered and family aliases are injected before ranking.
- The Recognition -> Polishing tab's provider/model/route race no longer replaces the current `routeState` with a stale request's fallback routes.
- Cross-Host/Client version pairs no longer fail `dshEars/getSettings`: the `earsSettingsView` schema provides defaults for the Deepgram fields so an older Host's response validates, and the settings store migrates top-level `recognitionLanguage` without clobbering per-provider languages.

## [0.1.4] - 2026-08-26

Local Whisper native runtime release with voice-input quality fixes.

### Changed

- Local Whisper now uses the bundled `@fugood/whisper.node` native dependency and separately downloaded whisper.cpp GGML models instead of Python, Torch, FFmpeg, or the `whisper` CLI. Browser capture is normalized to mono 16 kHz PCM16 WAV, and there is no fallback engine.
- Recognition exposes Default, Vulkan, and CUDA acceleration choices where supported. Changing the native variant after its first load requires restarting the dsh Host; the npm root package is materially larger because official optional platform variants participate in installation, while model weights remain outside the npm tarball.
- The old OS-aware Python/FFmpeg/openai-whisper setup guide and its copyable commands are removed. Unavailable native packages or acceleration variants now produce concise diagnostics.
- Host persistence is organized into four fixed slots — `general`, `recognition`, `cloudAsr`, and `polishing` — while the flat Remote wire remains for client compatibility and per-field auto-save.
- Recognition and polishing settings copy is reworded for clarity.

### Fixed

- Rapid microphone toggles no longer leak an orphaned media recorder session that keeps the audio track open; a pending capture aborts itself when a newer start or a Web Speech start supersedes it (#9).
- Streamed Chinese/Japanese recognition results and draft appends no longer insert half-width spaces between CJK characters or around full-width punctuation (#11).
- A failed Whisper model download reports once and then reflects the real filesystem state again, so restored or manually placed models are detected without restarting the Host; leftover artifact sweeps can no longer race an in-flight retry download (#8).
- Chronological Chinese narratives such as "第一天……第二天……" stay prose instead of being corrupted into broken numbered lists (#12).
- Local Whisper state responses stay JSON-safe across download, cancel, and dispose paths.
- Whisper acceleration options list only what the current platform supports.
- The dev HMR patch emits a file URL base so module imports resolve on Windows.

## [0.1.3] - 2026-08-23

Structured error handling and localized settings copy release.

### Added

- Stable structured error codes, messages, and interpolation parameters across the Host, Remote, and browser client surfaces.
- Chinese and English localization coverage for settings, voice states, backend availability, and structured errors.
- Regression coverage for Remote contracts, localized interpolation, voice flows, DashScope failure classification, and Whisper lifecycle errors.

### Changed

- DashScope and other ASR failures now preserve actionable HTTP/status details while distinguishing empty-audio results from upstream failures.
- Host diagnostics crossing the Remote boundary sanitize credentials and cap string values, including Whisper model state errors and cloud model listing failures.
- Voice error presentation falls back safely when a localized template lacks required interpolation parameters.

## [0.1.2] - 2026-08-21

Compatibility release for every dsh published since the first release, including the `0.1.1-*` line. No product behavior changes.

### Fixed

- Peer dependencies on all `@deepseek-ai/dsh-*` packages are now `*` (D-035). node-semver prerelease matching made the D-034-era `^0.1.0-rc.6` floor reject every dsh `0.1.1-*` host — the tuple has no matching prerelease comparator — so the published plugin failed peer resolution on current releases. Installation no longer fails on an unlisted host while its audit is pending; compatibility claims stay documentation-scoped.
- The About tab reports the verified range as `0.1.0-rc.6 - 0.1.1-rc.2`.

### Changed

- Compatibility covers dsh `0.1.0-rc.6` through `0.1.1-rc.2` (D-035), extending D-034's rc.8 set with `0.1.1-rc.1` and `0.1.1-rc.2`. The rc.7 → `0.1.1-rc.2` audit found only additive host changes; `pnpm check`, the full unit suite, and a browser smoke on the local rc.2 CLI pass with zero source changes beyond this release's constants.
- The compile/test baseline moved to exact `0.1.1-rc.2` devDependencies, and the release-age exemptions gain the rc.2 set alongside rc.8.
- README badges and prerequisites, contributor docs, and `.agent` context state the same verified range.

## [0.1.1] - 2026-08-20

dsh rc.8 compatibility release (D-034).

### Added

- GitHub Actions `publish.yml` publishes tagged `v*` releases to npm with trusted publishing (OIDC). The first `0.1.0` tarball is still created once with a maintainer token so the npm package exists before that trust relationship can be attached.
- GitHub issue forms (bug, feature, new ASR backend) and a pull request template. Public issues that would contain a secret are steered to private advisories.
- README backend table lists Groq and Model Studio free-allowance notes with links to the provider docs.

### Changed

- Compatibility extended to dsh `0.1.0-rc.8` (D-034): the compile/test baseline moves to the exact rc.8 packages, the `react` peer widens to `^18.2.0 || ^19.0.0`, and the About tab range reports rc.6 / rc.7 / rc.8. No source change was needed beyond the range constant and a lowercase `@thesvg/react/github` import for case-sensitive CI.

## [0.1.0] - 2026-08-19

First public release: GitHub `WizisCool/dsh-ears` is public, npm `dsh-ears@0.1.0`. Later bullets in the same list supersede earlier ones. The live save model is D-031 auto-save, not D-026 Save/Discard. Cloud ASR keys are per-provider `role('secret')` fields, not dsh credential-references. Modifier-only shortcut chords are valid.

### Changed

- Public README is now Chinese-first (`README.md`) with an English sibling (`README.en.md`).
- README hero is a white-and-blue product banner at `assets/banner.jpg`. The old `assets/dsh-ear.svg` icon is removed.
- Repository layout: the product plan, architecture, and ADRs live under `.agent/`. Delivery history lives in this changelog.

### Added

- While the recognition bar is transcribing or polishing, the disabled stop square becomes the same trash icon as an in-progress Goal row. Clicking it discards that voice task, aborts the Host request, and collapses the bar with the existing exit animation.
- An **关于 / About** tab at the end of the `dsh-ear` settings page: a jumpable GitHub repo row (`@WizisCool/dsh-ears` with the thesvg.org mark), installed version, MIT license, and dsh compatibility. Identity rows have no hint copy. Check for updates is click-only; the Host compares npm `latest` and never installs. Until the package is published the check reports that honestly.
- A General-tab display-name picker for the settings page: `dsh-ears` (default) or `语音` / `Voice`.
- Synthesized voice-input click (no audio files) on start/stop. Toggle is in General, on by default.
- Alibaba Cloud Model Studio (百炼) as a cloud ASR provider: DashScope sync `multimodal-generation` for Qwen3-ASR-Flash and Fun-ASR-Flash / Qwen-Audio-3.0-ASR-Flash. Users enter an HTTPS origin, a dedicated API key, and a model name. Recordings on this provider are capped at 300 seconds. Filetrans / realtime remain out of scope.
- Cloud ASR API keys are now per provider, with explicit names and a grouped Host settings file: `groq`, `customOpenAi`, and `bailian` each have their own `apiKey` (and model / endpoint / host). The previous flat `cloudAsrApiKey` is Groq-only after rewrite.
- Codex-like dsh composer microphone control with live Web Speech input.
- Native taskbar-style recognition card above the composer: standalone Task/Goal geometry, status, stop action, and a full-width rolling microphone waveform sampled from the active input stream. The card follows dsh's typography and semantic surfaces, stays above queued messages and closest to the composer, preserves the composer microphone throughout the flow, and collapses smoothly before unmounting after completion. Its active listening dot now uses a restrained pulse that respects reduced-motion preferences.
- Optional dsh-owned transcript polishing using any configured provider/model route.
- Dedicated native dsh `settings.section` configuration page.
- Host-side local Whisper and OpenAI-compatible cloud ASR backends.
- Typed Typert Remote contracts, cancellation, bounded payloads, and draft-race protection.
- Whisper model availability UI: downloaded state, download action with tqdm-derived progress, and honest errors across pip/Homebrew/pipx/conda/Windows environments. The status reuses the row's hint line — spinner while checking, click-to-download, cancel-download, and delete-model (two-step confirm) links, no floating blocks or state dots — and later queries are instant after a one-time authoritative model-table load. Cancelling a download also removes its partial file.
- Per-field validate-on-edit settings model (D-024): each edited field is validated alone, red errors appear only for invalid user input and real failures, untouched fields never show errors, and an incomplete polishing pair leaves polishing dormant. Guidance prompts for "not yet configured" states are removed, and the first-load alert appears only after the automatic retry fails, with neutral wording.
- Host-side settings validation is field-level only: the registration validate no longer rejects a Groq API key write while the cloud model is unselected or a custom provider without an endpoint, removing the key-vs-model deadlock; runtime readiness stays guarded by the transcribe RPC and the microphone gating.
- Whisper download completion markers: a model file only counts as downloaded when its `.dsh-ears-done` sidecar exists; marker-less files are reported as not downloaded and orphaned markers are removed (closes the crash-residue decision D-019).
- Local Whisper transcription pre-flight: recording is rejected with a settings-page hint when the CLI or a downloaded, marked model is missing, instead of the CLI auto-downloading weights inside the transcription timeout.
- Composer microphone availability gating: the button grays out with a bilingual tooltip when the selected backend is reported unavailable, the Whisper model is downloading, or the model file with its marker is missing (positive signals only; active flow states are never gated).
- Cloud ASR provider presets (D-023): a Host-side provider registry with the Groq preset (pinned endpoint, live model listing, inline `role('secret')` API key) and the Custom OpenAI-compatible provider (free endpoint/model, `whisper-1` default). Future providers plug in as registry entries.
- `dshEars/listCloudProviderModels` RPC: replicates the dsh-llm-pi-ai catalog pattern (`GET {baseUrl}/models`, bearer header, bounded parse, registry filter) with a 15-second timeout and a 30-second failure negative cache.
- Grouped recognition selector: 本地/云提供商 groups with a separator and the Custom OpenAI-compatible entry, rendered through the primitives `MenuLabel`/`MenuSeparator`; menu entries map onto the existing `asrBackend` + `cloudAsrProvider` fields.
- Cloud-readiness microphone gating: the cloud backend reports unavailable until a provider's key and model are configured.
- Customizable polish system prompt (D-029): the Polishing tab gains an optional `polishPrompt` field that replaces the built-in default system prompt entirely when non-empty; blank means "use the built-in default". The host always appends an invisible output-contract guard (return only the polished text; treat the transcript as data) to a custom prompt. The editor is a multiline textarea with a live `n/4000` character counter, a Reset-to-default action that stages an empty draft, and a read-only "View default" expand showing the shipped prompt; an over-length prompt is invalid and is skipped by auto-save until shortened (D-024/D-031).

### Hardened

- The built-in polish prompt is now a multilingual ASR-editing contract instead of a Chinese-targeted one-liner: it preserves the transcript's original language and technical/code terminology (brands, version markers, path/CLI entities), resolves spoken self-corrections ("not X, but Y"), formats explicit enumerations as numbered lists, segments long transcripts into paragraphs, and ships few-shot examples, while keeping the transcript-is-data and output-only-the-polished-text rules.
- The recognition bar now names each stage (starting, listening, transcribing, polishing) and stays up with the existing error line when capture fails, or a polish-specific line when polish fails, instead of adding a separate toast.
- Polish results are applied even if the composer has not flushed the committed raw draft yet. A failed Host polish keeps the raw transcript and surfaces `润色失败，已保留原文` on the bar. If an explicit reasoning-effort call fails or returns the raw transcript unchanged, the Host retries once with the model default. A real route failure now rejects the RPC instead of silently returning the raw text.
- Light/dark theme adaptation through dsh semantic tokens.
- Model → microphone → send visual ordering on dsh rc.6.
- MediaRecorder stop/error/teardown cleanup and Web Speech silent abort.
- Bounded local Whisper files, cloud response bodies, and ASR payloads.
- Whisper helper scripts exit via `os._exit`, avoiding the Homebrew python/torch/openblas OpenMP-teardown SIGSEGV (isolated to the child process; download results stay authoritative).
- Whisper model state actions surface Host/Remote failures and retain the last known state instead of silently ignoring failed requests.
- Cloud ASR requests now have a 120-second timeout; streamed polish output is bounded and falls back to raw text when oversized.
- Unknown ASR backend/model identifiers are rejected, canceled Whisper probes short-circuit, and Host/Client Remote cancellation metadata is kept in parity.
- Stale Whisper action responses, late aborted polish results, and MediaRecorder start failures are handled without overwriting current state or leaking microphone tracks.
- Failed Whisper model operations retain an actionable retry/cancel/delete path in the settings row.
- The Whisper model manager is a per-service disposable instance: dispose kills an active download and removes its partial file, and interpreter/model-table discovery failures are negative-cached for 30 seconds instead of re-spawning probes.
- Failed transcriptions carry the whisper stderr tail (bounded to 800 characters) instead of a bare exit code.
- Windows probing resolves `python.exe`/`py.exe` launchers with PATHEXT expansion (documented as not yet smoke-tested on Windows).
- Fake-python integration tests cover the full model lifecycle: download/cancel/delete, progress parsing, completion markers, dispose cleanup, and failure negative-caches.
- The `dsh-ear` settings page gains a leading **通用 / General** tab as its default landing tab. It hosts the voice-input keyboard shortcut — an enable switch plus a Raycast-style recorder — and the recognition language and recording-limit rows that moved here from the Recognition tab.
- In-page voice-input keyboard shortcut (D-028): default `Ctrl+Shift+Space` on all three platforms starts/stops voice input while the dsh page is focused and the composer is visible without a modal overlay; recording press stops and transcribes, transcribing/polishing presses are ignored, IME composition and key auto-repeat never trigger it, and when the microphone is gated the shortcut focuses the grayed button so its existing bilingual tooltip explains why. The listener lives in the composer microphone and ignores events inside `[role="dialog"]`.
- Hand-written shortcut module (`src/shortcut.ts`, no third-party dependency, per the D-025 precedent and the keyboard-shortcut research in `.agent/research/voice-dictation-shortcuts.md`): layout-stable `KeyboardEvent.code` key tokens, canonical `ctrl+shift+space` storage, platform-aware display (⌃⌥⇧⌘ on macOS). Modifier-only chords are valid. Bare letter/digit/text-action keys and Alt/Option+letter chords are rejected. Browser/OS-reserved chords warn amber without blocking the write. Escape cancels capture; Reset restores the default. Host settings validation enforces the same chord rules on every write.

### Fixed

- The polishing prompt's View default / Reset actions no longer reuse the absolutely positioned shortcut-reset class, which had stacked both buttons and made View default miss its click.
- The recognition-bar discard control now uses the same 14px `IconTrashOutline16` as the in-progress Goal row, instead of a larger 16px glyph.
- Capturing a two-modifier shortcut such as `Ctrl+Shift` now keeps both keys. The recorder used to replace the held set on each release, so only the last remaining modifier was saved.
- Changing the settings display name now updates the left-rail nav as well as the page title. Switching dsh between 中文 and English also retargets the Voice / 语音 label.
- Voice shortcuts may be a modifier-only chord such as `Ctrl` or `Ctrl+Shift`. Releasing the modifiers during capture saves that chord. On macOS, Control is kept when capturing Control+another key even if the browser omits `ctrlKey`.
- The shortcut reset control now sits inside the same 240px lane as the other settings fields, so opening the page no longer grows or shifts the row.
- The General tab now hides the shortcut recorder when the voice shortcut is off, matching the polishing tab's progressive disclosure.
- Silent or too-short Bailian recordings (including `qwen-audio-3.0-asr-flash` HTTP 400) now end quietly with no polish, instead of a red `语音识别上游错误： internal: Cloud ASR request failed with HTTP 400`.
- The live recognition waveform again fills the bar after the status label: a previous overflow tweak had made the label grow and pushed a smaller waveform to the right.
- The composer microphone and the dsh-ear settings page no longer crash on render: the UI-locale hook now calls `locale.subscribe` as a method instead of passing the unbound function.
- Clicking the microphone and stopping without speaking no longer shows `请检查配置后重试`. Empty transcripts and `no-speech` just close the bar.
- Upstream ASR and polish failures stay on the bar as a red `语音识别上游错误：` / `润色上游错误：` line with the raw service code, then dismiss themselves. Configuration problems stay amber.
- Recognition and polish errors on the status bar now dismiss themselves after a short delay, so a failed attempt no longer occupies the composer. Empty Bailian / cloud transcripts use the same path, with amber `请检查配置后重试` copy instead of a sticky red `语音输入失败，点击重试`.
- Host-backed recording starts sooner: the microphone is warmed on hover or focus, and Web Speech no longer waits for a second `getUserMedia` analyser before it is ready to listen.

- Closing the polishing toggle no longer flashes `正在润色…`: the client only enters the polishing state when `polishingEnabled` is on. An enabled toggle still asks the Host even if the local provider/model pair is empty.
- The shortcut recorder now gives live feedback while only modifier keys are held: the capture button shows the pressed modifiers (e.g. `Ctrl+Shift+…`). Releasing every modifier commits that modifier-only chord. A non-modifier key still completes the capture and Escape still resets and cancels.
- Modifier+character chords are now allowed, revising the D-028 shortcut rule: letters and digits with Ctrl/Shift/Meta record and save as valid shortcuts, with browser/OS-reserved combinations (Ctrl+letter/digit, Cmd+letter/digit, and the reserved Ctrl+Shift/Cmd+Shift sets) shown as amber warnings instead of being blocked. Bare letters/digits/text keys and Alt/Option+letter chords (which type special characters on macOS) are still rejected, and the error copy explains why.
- The voice hotkey now **outranks text input**: the composer listener runs on the window capture phase and calls `preventDefault`/`stopPropagation` on a matching chord, so pressing the shortcut inside the composer or any text field triggers voice input instead of being swallowed by the editor. Non-matching, disabled, or gated chords leave the event untouched.
- The shortcut recorder control is now right-aligned like the other settings rows: the capture pill uses the same content-width, `flex-end` alignment as the shipped selectors (it no longer sits at the left of the 240px API-key lane), and the Reset-to-default action sits directly next to the pill instead of floating at the far edge. At narrow widths the pill stretches full-width with the reset action below it.

### Changed

- The default recognition language is empty and follows the dsh English / 中文 setting. A value the user types is kept.

- Settings field hints now follow the official dsh plugin one-clause style instead of multi-sentence tutorials.

- The built-in default polish system prompt is now the tighter ASR-cleaning contract: stay close to the speaker, repair ASR/technical terms, list only explicit enumerations, and output only the cleaned text. A custom `polishPrompt` still replaces it entirely.
- The `dsh-ear` settings page drops the card wrapper and Save/Discard footer (D-031). Rows match native General: hairline dividers, no card surface. Valid edits auto-save after 400 ms, on blur, or when the panel closes; an invalid draft is skipped and stays local; a failed write keeps the drafts and does not retry in a loop.
- Compatibility now covers dsh `0.1.0-rc.6` and `0.1.0-rc.7`. Peer ranges stay `^0.1.0-rc.6`; the compile/test baseline is the exact `0.1.0-rc.7` packages.
- Tab layout: the settings page is now 通用 / General → 识别 / Recognition → 润色 / Polishing, with General as the default landing tab; the Recognition tab keeps only ASR backend/provider/model/key rows.
- The language and recording-limit rows moved from the Recognition tab to the General tab (their validation, defaults, and save semantics are unchanged).

- Plugin configuration card title renamed to `dsh-ear`.
- The read-only settings hint now explains the settings-provider condition and the required fix (zh/en).
- Plugin configuration moved to a dedicated `settings.section` page beside General, Models, and Plugins, with grouped Recognition/Polishing cards styled like the shipped settings pages.
- The settings page splits Recognition and Polishing into Plugins-style tab cards.
- Settings fields use the General/Permissions row pattern with pill Menu selectors. The live save model is the D-031 per-field auto-save (see Changed above); an earlier D-026 Save/Discard footer was tried and removed.
- Auto-save feedback follows the native pattern: no success/saving text, only a failure line (with row-level red hints for invalid values).
- Backend labels are clean (`Web Speech`, `Local Whisper`, `Cloud ASR`); only the active backend's configuration rows are shown, the selector hint follows the active backend, and each backend's settings still persist independently across switches.
- Polishing rows were renamed (Provider / Model) with simplified hints and display-name-only pickers; the polishing toggle stays a pill selector (a switch variant was tried and reverted).
- A per-route reasoning-effort picker (dsh `resolveModelInfo`-driven, model default supported) was added to the polishing settings (zh/en copy kept in sync).
- A failed first settings fetch now shows a dedicated load-failure hint with one delayed retry instead of the misleading read-only message; Host-side updates require a `dsh web` restart (the browser bundle updates on refresh).
- Switching the polish provider clears the stale model and reasoning-effort selection, so another provider's models can never linger in the picker.
- The provider/model pair rule now applies only while polishing is enabled; the reasoning picker labels the adapter's `off` effort as an explicit switch-off option.
- Polishing is now disabled by default, its configuration rows appear only after the toggle is enabled (progressive disclosure), the meaningless no-polish picker option is gone, an enabled polish requires a complete provider/model pair, and reasoning-effort labels use the adapter's native names with an untranslated `Default` entry (matching the composer model selector).
- The not-downloaded hint no longer promises automatic first-use downloads; the Local Whisper hint documents that `medium` and larger models need a GPU or a faster local runtime within the 120-second limit.
- Cloud ASR credentials moved from dsh credential references to a plugin-owned `role('secret')` inline API key (write-only across the plugin wire, redacted `getSettings`, absent=keep/set/clear patch semantics), reversing D-014 for the cloud ASR surface; the `cloudAsrCredentialRef` field is removed (package unreleased, no migration).
- The Recognition backend selector became a single grouped menu with bilingual group labels and per-provider hint text; the pinned Groq endpoint is no longer shown as a row (presets hide it entirely), and the Groq model row shows live-fetched models (empty until a key is configured, inline warning plus retry on fetch failure, stale-model notice when the saved model leaves the live list).

### Deferred

- Emotion recognition and emotion UI.
- Additional cloud-provider-specific protocols.
- Compatibility claims for dsh releases other than rc.6 and rc.7.
