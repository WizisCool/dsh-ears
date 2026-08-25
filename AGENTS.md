# dsh-ears

Voice-input plugin for DeepSeek Harness. The package has two faces: a Host Cordis plugin (`exports["."]`) and a browser client (`exports["./client"]`).

## Read first

- Product scope and still-open gates: [`.agent/PLAN.md`](./.agent/PLAN.md)
- Architecture and Host/Client boundaries: [`.agent/context.md`](./.agent/context.md)
- Accepted, superseded, and open decisions: [`.agent/decisions.md`](./.agent/decisions.md) — read the status index before any individual ADR
- Human setup and contribution rules: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Security policy: [`SECURITY.md`](./SECURITY.md)

`.agent/research/` is optional evidence behind ADRs, not required reading.

## Setup

Node `^22.19.0 || >=24.0.0`, pnpm `11.19.0` (`packageManager`), dsh `0.1.0-rc.6` through `0.1.1-rc.2`. Peer dependencies accept any dsh release; only the tested range is claimed (D-035).

```sh
pnpm install
pnpm check
pnpm test
pnpm build
dsh plugin --profile web add "$PWD"
```

On Windows, run this from PowerShell (or use `"%CD%"` in cmd — cmd does not expand `$PWD`).

## Commands

Scripts live in `package.json`. Use them; do not invent parallel invocations.

| Script | What it does |
| --- | --- |
| `pnpm check` | `tsc --noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm build` | `tsdown` plus declaration emit |
| `pnpm dev:config` | build, write the ignored HMR patch, dump the web profile |
| `pnpm dev:web` | build, write the ignored HMR patch, start `dsh web` |
| `pnpm dev:watch` | `tsdown --watch` |

Client-only UI changes: rebuild (or leave `dev:watch` running) and refresh the Web UI. Host, settings registration, Remote, or schema changes: restart `dsh web`, then refresh. `pnpm dev:config` writes `.dsh/cordis.patch.yml` for HMR; it must not add a second plugin loader entry.

## Layout

```text
src/index.ts              Host plugin entry
src/client/index.ts       Browser composition (slots, settings, microphone)
src/config.ts             Shared constants and validation
src/config-schema.ts      Host-only schemastery schema
src/remote-contract.ts    Strict Host/Client wire schemas
src/shortcut.ts           Shared voice-shortcut logic
src/asr/                  Web Speech, Whisper, Groq, Bailian, custom cloud
src/polish/               Host LLM polish
tests/                    Vitest suites next to the shipped modules
.agent/                   Plan, architecture, ADRs, optional research
```

## Engineering

- Prefer the smallest change that completes one independently verifiable task.
- Fix defects at the root cause; replace faulty logic with the correct logic rather than patching over it.
- Verify dsh APIs against the [official docs](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart) and the installed `@deepseek-ai/dsh-*` packages. Plugin path: [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/). Do not guess an API from memory.
- Follow official DeepSeek Harness package shape, naming, lifecycle, and TypeScript style where they apply.
- English for source, comments, public documentation, context, issue-ready text, and commit messages. Runtime product prompts may be Chinese when the product requires Chinese output.

## Local Whisper runtime

Local Whisper is Host-only and uses the bundled `@fugood/whisper.node` native dependency plus separately downloaded whisper.cpp GGML models. The browser normalizes captured audio to mono 16 kHz PCM16 WAV. Python, Torch, FFmpeg, CLI discovery, and fallback engines are out of scope. Native acceleration is selected with `default`, `vulkan`, or `cuda`; changing it after the first native load requires restarting the dsh Host.

## Boundaries

- Host owns credentials, process spawn, cloud calls, and Whisper. The browser never receives a cloud ASR key and never calls an LLM provider.
- Polishing reuses dsh routes and Host `ctx.llm`. The plugin stores `{ provider, model }` plus an optional prompt, not a second LLM credential flow.
- Emotion UI is deferred (D-015). Future cloud ASR providers need their own protocol and smoke test.
- Do not push, publish to npm, create tags, or change repository visibility without explicit maintainer authorization.

## Git and security

Use explicit `git add <path...>`. Conventional Commits (`feat(client):`, `fix(host):`, `docs:`). Run the relevant check and `git diff --cached --check` before every commit. Do not mix unrelated refactors, formatting, documentation, and feature behavior.

Never commit API keys, tokens, cookies, private keys, private endpoints, user data, or personal absolute paths. Examples use `YOUR_API_KEY`. If a possible secret appears in a diff, stop, remove it, and report it without publishing the value.

Collaboration detail lives in [`.agent/workflow.md`](./.agent/workflow.md).
