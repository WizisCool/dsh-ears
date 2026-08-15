# Changelog

All notable changes to dsh-ears are recorded here. The package is not published yet.

## [Unreleased]

### Added

- Codex-like dsh composer microphone control with live Web Speech input.
- Optional dsh-owned transcript polishing using any configured provider/model route.
- Native dsh Plugins settings card.
- Host-side local Whisper and OpenAI-compatible cloud ASR backends.
- dsh credential-reference support without plugin-owned secret storage.
- Typed Typert Remote contracts, cancellation, bounded payloads, and draft-race protection.

### Hardened

- Light/dark theme adaptation through dsh semantic tokens.
- Model → microphone → send visual ordering on dsh rc.6.
- MediaRecorder stop/error/teardown cleanup and Web Speech silent abort.
- Bounded local Whisper files, cloud response bodies, and ASR payloads.

### Changed

- Plugin configuration card title renamed to `dsh-ear`.
- The read-only settings hint now explains the settings-provider condition and the required fix (zh/en).
- Plugin configuration moved to a dedicated `settings.section` page beside General, Models, and Plugins, with grouped Recognition/Polishing cards styled like the shipped settings pages.
- The settings page splits Recognition and Polishing into Plugins-style tab cards.
- Settings fields use the General/Permissions row pattern with pill Menu selectors, and changes auto-save (debounced) instead of a manual Save/Discard footer.
- Auto-save feedback follows the native pattern: no success/saving text, only a failure line (with row-level red hints for invalid values).
- Backend labels are clean (`Web Speech`, `Local Whisper`, `Cloud ASR`); only the active backend's configuration rows are shown, the selector hint follows the active backend, and each backend's settings still persist independently across switches.
- Polishing rows were renamed (Provider / Model) with simplified hints and display-name-only pickers; the polishing toggle is now a native-style switch.
- A per-route reasoning-effort picker (dsh `resolveModelInfo`-driven, model default supported) was added to the polishing settings (zh/en copy kept in sync).

### Deferred

- Emotion recognition and emotion UI.
- Additional cloud-provider-specific protocols.
- Compatibility claims for dsh releases other than rc.6.
