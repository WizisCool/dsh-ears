# Changelog

All notable changes to dsh-ears are recorded here. The package is not published yet.

## [Unreleased]

### Added

- Codex-like dsh composer microphone control with live Web Speech input.
- Optional dsh-owned transcript polishing using any configured provider/model route.
- Dedicated native dsh `settings.section` configuration page.
- Host-side local Whisper and OpenAI-compatible cloud ASR backends.
- dsh credential-reference support without plugin-owned secret storage.
- Typed Typert Remote contracts, cancellation, bounded payloads, and draft-race protection.
- Whisper model availability UI: downloaded state, download action with tqdm-derived progress, and honest errors across pip/Homebrew/pipx/conda/Windows environments. The status reuses the row's hint line — spinner while checking, click-to-download, cancel-download, and delete-model (two-step confirm) links, no floating blocks or state dots — and later queries are instant after a one-time authoritative model-table load. Cancelling a download also removes its partial file.
- Cross-field settings staging: incomplete Cloud ASR and polishing edits remain drafts until Host validation can accept the complete configuration.
- Whisper download completion markers: a model file only counts as downloaded when its `.dsh-ears-done` sidecar exists; marker-less files are reported as not downloaded and orphaned markers are removed (closes the crash-residue decision D-019).
- Local Whisper transcription pre-flight: recording is rejected with a settings-page hint when the CLI or a downloaded, marked model is missing, instead of the CLI auto-downloading weights inside the transcription timeout.

### Hardened

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

### Changed

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

### Deferred

- Emotion recognition and emotion UI.
- Additional cloud-provider-specific protocols.
- Compatibility claims for dsh releases other than rc.6.
