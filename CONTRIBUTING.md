# Contributing to dsh-ears

Thank you for contributing. The project follows the English-first conventions used by the official DeepSeek Harness repository.

After a clone, start here. Product scope and still-open gates are in [`.agent/PLAN.md`](./.agent/PLAN.md). Architecture and security boundaries are in [`.agent/context.md`](./.agent/context.md). Accepted and superseded decisions are in [`.agent/decisions.md`](./.agent/decisions.md) — read the status index first. Coding-agent operating rules are in [`AGENTS.md`](./AGENTS.md).

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0`
- [pnpm](https://pnpm.io) `11.19.0` (see `packageManager` in `package.json`)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `>=0.1.2-rc.1`

## Clone and install

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm use:platform
pnpm install
pnpm check
pnpm test
pnpm build
```

Load the plugin into the local web profile once:

```sh
dsh plugin --profile web add "$PWD"
```

On Windows, run this from PowerShell or Git Bash — `cmd.exe` does not expand `$PWD`; use `"%CD%"` from cmd.

## Local Whisper development

Local Whisper uses the bundled `@fugood/whisper.node` native dependency and separately downloaded whisper.cpp GGML models. Do not add Python, Torch, FFmpeg, or CLI discovery code, and do not add a fallback engine. Browser capture is normalized to mono 16 kHz PCM16 WAV before the Host RPC.

The Recognition acceleration selector supports `default`, `vulkan`, and `cuda` according to the installed platform variant. The first native load fixes the process variant, so changing acceleration requires restarting the dsh Host. The root package is intentionally larger because platform variants are installed separately; model files remain outside the package cache and are never committed.

## Cross-platform installs

The checkout keeps native dependency trees in separate directories: `node_modules.win32` for Windows and `node_modules.linux` for WSL. The active tree is exposed as `node_modules`, so each platform keeps its own native packages and command shims.

After switching between PowerShell and WSL:

```sh
pnpm use:platform
pnpm install
```

Run `pnpm use:platform` before the first install on a fresh clone and after stopping any dev server that still holds the active dependency tree open. The selector preserves the previous platform tree and creates the new platform tree when needed. Both environments use pnpm `11.19.0` from `packageManager`.

Spawn-based local Whisper fixtures are POSIX shebang scripts; native Windows skips those fixture cases while still running discovery, progress-parsing, and Remote wire-safety tests.

If `dsh` is not on `PATH`:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add "$PWD"
```

Refresh the Web UI. The microphone appears on the right of the composer.

## Develop

```sh
pnpm dev:config    # build + ignored HMR patch + dump the web profile
pnpm dev:web       # build + ignored HMR patch + start dsh web
pnpm dev:watch     # rebuild Host/Client bundles on change
```

`pnpm dev:config` writes `.dsh/cordis.patch.yml`. That overlay is gitignored and must not insert a second `dsh-ears` loader entry.

- Client-only UI changes: leave `pnpm dev:watch` running, or run `pnpm build`, then refresh the browser.
- Host, settings registration, Remote, or schema changes: restart `dsh web`, then refresh.

## Validate

Use the `package.json` scripts:

| Command | Purpose |
| --- | --- |
| `pnpm check` | Typecheck |
| `pnpm test` | Unit and contract tests |
| `pnpm build` | Host ESM, Client bundle, CSS, declarations |
| `pnpm dev:config` | Confirm the plugin still loads in the web profile |

Before every commit:

```sh
git diff --cached --check
```

## Issues and pull requests

Use the GitHub templates:

- [Bug](https://github.com/WizisCool/dsh-ears/issues/new?template=bug.yml) — a shipped behavior is wrong
- [Feature](https://github.com/WizisCool/dsh-ears/issues/new?template=feature.yml) — new or changed product behavior
- [New ASR backend](https://github.com/WizisCool/dsh-ears/issues/new?template=backend.yml) — a transcription service that is not a Custom OpenAI-compatible endpoint

English is preferred for issues and required for commits. Chinese is fine in product bug reports.

Do not file a public issue that contains a secret, recording, transcript, or exploit. Use [SECURITY.md](./SECURITY.md) and [private advisories](https://github.com/WizisCool/dsh-ears/security/advisories/new).

PRs should stay on one concern, use Conventional Commits, and name a related issue (`Fixes #NN` or `Related to #NN`) unless the change is a typo or changelog-only edit. The pull request template lists the validation expected before review.

This repository only allows **squash merging** into `master`. When a PR is merged, GitHub collapses its commits into a single commit and uses the **PR title** as the commit message. Therefore the Conventional Commit prefix (`feat:`, `fix:`, `docs:`…) belongs on the PR title, and it is that title that appears in `master` history and in `CHANGELOG.md`. Individual commits inside a branch still matter for review clarity, but they are not preserved verbatim after the squash, so do not spend effort micro-editing them for final-history correctness.

## Change expectations

- State the goal, scope, and acceptance evidence.
- Keep the PR on one atomic concern. Because `master` only accepts squash merges, the merged result is one commit whose message is the PR title — make that title a clean Conventional Commit summarizing the whole change.
- Use English for source, comments, docs, context, issue-ready text, and commit messages. Runtime product prompts may be Chinese when the product requires it.
- Follow official dsh package conventions for manifest fields, exports, lifecycle, and README structure.
- Use explicit Git paths; do not use an unreviewed `git add -A`.
- Conventional Commits, for example `feat(client): add web speech draft updates`.
- Do not push, publish a package, create tags, or change repository visibility without explicit authorization.

## Release

Later versions publish from GitHub Actions, not from a laptop.

1. Bump `version` in `package.json` and cut `CHANGELOG.md`.
2. Commit on `master` and push.
3. Tag `vX.Y.Z` and push the tag. That runs [`.github/workflows/publish.yml`](./.github/workflows/publish.yml).

The workflow authenticates to npm with OIDC. It does not use an `NPM_TOKEN` secret. After the first package exists on npm, attach the trusted publisher on the package settings page:

- Provider: GitHub Actions
- Organization or user: `WizisCool`
- Repository: `dsh-ears`
- Workflow filename: `publish.yml` (filename only, no path)
- Environment: leave empty
- Allowed action: `npm publish`

Do not commit npm tokens or a project `.npmrc` that contains a token.

## Security

Do not commit API keys, tokens, cookies, private endpoints, user data, certificates, `.env` files, or personal machine paths. Cloud ASR keys are Host-owned `role('secret')` fields and must never appear in the browser, Git, logs, or tests as real values. See [`SECURITY.md`](./SECURITY.md).
