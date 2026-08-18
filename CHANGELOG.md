# Changelog

All notable changes to dsh-ears are recorded here. The package is not published yet.

## [Unreleased]

### Changed

- Public README is now Chinese-first (`README.md`) with an English sibling (`README.en.md`).
- README hero is a white-and-blue product banner at `assets/banner.jpg`. The old `assets/dsh-ear.svg` icon is removed.
- Repository layout: the implementation plan and delivery record live under `.agent/`.

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
- dsh credential-reference support without plugin-owned secret storage.
- Typed Typert Remote contracts, cancellation, bounded payloads, and draft-race protection.
- Whisper model availability UI: downloaded state, download action with tqdm-derived progress, and honest errors across pip/Homebrew/pipx/conda/Windows environments. The status reuses the row's hint line — spinner while checking, click-to-download, cancel-download, and delete-model (two-step confirm) links, no floating blocks or state dots — and later queries are instant after a one-time authoritative model-table load. Cancelling a download also removes its partial file.
- Per-field validate-on-edit settings model (D-024): each edited field is validated alone, red errors appear only for invalid user input and real failures, untouched fields never show errors, and an incomplete polishing pair leaves polishing dormant. Guidance prompts for "not yet configured" states are removed, and the first-load alert appears only after the automatic retry fails, with neutral wording.
- Explicit staged-draft save model (D-026): edits stage as drafts and commit through the footer's Save/Discard buttons mirroring the shipped plugin card (Save blocked unless dirty, valid, and idle; an invalid draft blocks the whole save and keeps the drafts; Host rejection keeps the drafts with the saveFailed line; Discard drops everything without confirmation; empty text clears a field on save, with the API key keeping absent=keep semantics). Replaces the debounced auto-save.
- Host-side settings validation is field-level only: the registration validate no longer rejects a Groq API key write while the cloud model is unselected or a custom provider without an endpoint, removing the key-vs-model deadlock; runtime readiness stays guarded by the transcribe RPC and the microphone gating.
- Whisper download completion markers: a model file only counts as downloaded when its `.dsh-ears-done` sidecar exists; marker-less files are reported as not downloaded and orphaned markers are removed (closes the crash-residue decision D-019).
- Local Whisper transcription pre-flight: recording is rejected with a settings-page hint when the CLI or a downloaded, marked model is missing, instead of the CLI auto-downloading weights inside the transcription timeout.
- Composer microphone availability gating: the button grays out with a bilingual tooltip when the selected backend is reported unavailable, the Whisper model is downloading, or the model file with its marker is missing (positive signals only; active flow states are never gated).
- Cloud ASR provider presets (D-023): a Host-side provider registry with the Groq preset (pinned endpoint, live model listing, inline `role('secret')` API key) and the Custom OpenAI-compatible provider (free endpoint/model, `whisper-1` default). Future providers plug in as registry entries.
- `dshEars/listCloudProviderModels` RPC: replicates the dsh-llm-pi-ai catalog pattern (`GET {baseUrl}/models`, bearer header, bounded parse, registry filter) with a 15-second timeout and a 30-second failure negative cache.
- Grouped recognition selector: 本地/云提供商 groups with a separator and the Custom OpenAI-compatible entry, rendered through the primitives `MenuLabel`/`MenuSeparator`; menu entries map onto the existing `asrBackend` + `cloudAsrProvider` fields.
- Cloud-readiness microphone gating: the cloud backend reports unavailable until a provider's key and model are configured.
- Customizable polish system prompt (D-029): the Polishing tab gains an optional `polishPrompt` field that replaces the built-in default system prompt entirely when non-empty; blank means "use the built-in default". The host always appends an invisible output-contract guard (return only the polished text; treat the transcript as data) to a custom prompt. The editor is a multiline textarea with a live `n/4000` character counter, a Reset-to-default action that stages an empty draft, and a read-only "View default" expand showing the shipped prompt; an over-length prompt marks the draft invalid and blocks the whole save (D-024/D-026 semantics).

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
- Hand-written shortcut module (`src/shortcut.ts`, no third-party dependency, per the D-025 precedent and the keyboard-shortcut research in `.agent/research/voice-dictation-shortcuts.md`): layout-stable `KeyboardEvent.code` key tokens, canonical `ctrl+shift+space` storage, platform-aware display (⌃⌥⇧⌘ on macOS), hard rejection of modifier-only, letter/digit, and bare text-action chords, amber (non-blocking) warnings for browser/OS-reserved chords, Escape to cancel capture, and a Reset-to-default action. Host settings validation enforces the same chord rules on every write.

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
- The shortcut recorder now gives live feedback while only modifier keys are held: the capture button shows the pressed modifiers (e.g. `Ctrl+Shift+…`), and releasing every modifier without a key shows the inline "modifier-only" error instead of staying silent. Modifier keydowns are no longer invisible; a non-modifier key still completes the capture and Escape still resets and cancels.
- Modifier+character chords are now allowed (user-requested revision of the D-028 rule): letters and digits with Ctrl/Shift/Meta record and save as valid shortcuts, with browser/OS-reserved combinations (Ctrl+letter/digit, Cmd+letter/digit, and the reserved Ctrl+Shift/Cmd+Shift sets) shown as amber warnings instead of being blocked. Bare letters/digits/text keys and Alt/Option+letter chords (which type special characters on macOS) are still rejected, and the error copy explains why.
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
- Settings fields use the General/Permissions row pattern with pill Menu selectors, and changes auto-save (debounced) instead of a manual Save/Discard footer.
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
