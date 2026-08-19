# Contributing to dsh-ears

Thank you for contributing. The project follows the English-first conventions used by the official DeepSeek Harness repository.

After a clone, start here. Product scope and still-open gates are in [`.agent/PLAN.md`](./.agent/PLAN.md). Architecture and security boundaries are in [`.agent/context.md`](./.agent/context.md). Accepted and superseded decisions are in [`.agent/decisions.md`](./.agent/decisions.md) — read the status index first. Coding-agent operating rules are in [`AGENTS.md`](./AGENTS.md).

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0`
- [pnpm](https://pnpm.io) `11.19.0` (see `packageManager` in `package.json`)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `0.1.0-rc.6` or `0.1.0-rc.7`

## Clone and install

```sh
git clone https://github.com/WizisCool/dsh-ears.git
cd dsh-ears
pnpm install
pnpm check
pnpm test
pnpm build
```

Load the plugin into the local web profile once:

```sh
dsh plugin --profile web add "$PWD"
```

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

## Change expectations

- State the goal, scope, and acceptance evidence.
- Keep one commit on one atomic concern.
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
