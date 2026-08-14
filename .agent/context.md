# Project Context

## Purpose

`dsh-ears` is a DeepSeek Harness voice input plugin. It aims to add a Codex Desktop-like interaction to the dsh Web UI: speak into a microphone, see a live editable transcript, optionally polish it with any LLM route already configured in dsh, then send manually.

## Product boundaries

- First compatibility target: dsh `0.1.0-rc.6`.
- M2 starts with browser Web Speech API only.
- M2 does not use MediaRecorder, AudioWorklet, PCM, ASR RPC, or Whisper.
- Web Speech failures preserve the current draft and request a new recording.
- The microphone control follows the Codex composer reference: compact circular right-side toolbar button, microphone at rest, stop square while recording, and manual send only.
- Plugin configuration belongs in dsh's native Plugins settings page through `settings.plugin.item`; do not create a separate Voice settings tab or section.
- Polishing uses dsh Host `ctx.llm` and credentials; the plugin stores a `{ provider, model }` selection only.
- The current Host contract exposes strict Typert RPCs for settings, dsh route discovery, and text-only polishing. The browser receives the `dshEars` namespace through a Cordis scope that explicitly injects `remote.dshEars`.
- The plugin does not add custom LLM `base_url`, `api_key`, provider, or model configuration.
- Whisper, cloud ASR, and emotion UI are deferred.

## Planned package faces

- Host entry: `exports["."]`, responsible for Cordis lifecycle, Host RPC, and settings registration.
- Browser entry: `exports["./client"]`, responsible for UI, microphone behavior, and draft updates.
- `dsh.bundle.patch`: publish-time profile layer.
- `dsh.client`: browser plugin declaration and dependency graph.

Development `.dsh/cordis.patch.yml` is machine-local HMR only. It must never be confused with the published bundle patch.

## Runtime boundary

```text
Browser Client
  ├─ Web Speech live session
  ├─ conversation.input.right
  ├─ inputActions.setDraft()
  └─ text-only polish RPC ──> Host
                                └─ dsh ctx.llm + configured credentials
```

Native configuration is rendered by the dsh Plugins settings surface:

```text
dsh Plugins settings page
  └─ settings.plugin.item
       └─ dsh-ears configuration card
```

The settings card treats an empty provider/model pair as the explicit “do not polish” state. A configured dsh route is optional for the first browser-only ASR milestone.

Later audio ASR requires explicit contracts for format, chunking, cancellation, timeout, memory limits, and errors. A generic JSON RPC is not automatically an audio-stream transport.

## Open-source quality target

The project is being built as a public-quality ecosystem package with a long-term goal of 1,000+ stars. That goal is not a reason to inflate scope; it is a reason to keep boundaries, tests, docs, release policy, compatibility claims, and Git history reviewable from the beginning.

Before public release, the repository should have a reviewed license, English-first docs, deterministic builds, real dsh smoke tests, security checks, an explicit compatibility matrix, changelog/release notes, and a contributor-friendly issue/reproduction path.
