# dsh-ears

An open-source voice input plugin for DeepSeek Harness: give the text-only DeepSeek a pair of ears.

The intended interaction is close to Codex Desktop: click the microphone, speak, watch the transcript arrive in an editable draft, stop recording, optionally polish the text with any model already configured in dsh, and send it manually.

The repository has completed its documentation baseline, M1 package scaffold, M2 microphone pipeline, M3 dsh-owned polishing, and M4 native settings integration. The authoritative scope is [PLAN.md](./PLAN.md).

## Project goals

- Follow the packaging, naming, documentation, and lifecycle conventions of the official DeepSeek Harness repository.
- Keep the first release small, testable, and compatible with dsh `0.1.0-rc.6`.
- Let users choose any provider/model route already configured in dsh for LLM polishing.
- Keep provider credentials in dsh Host configuration; the plugin does not add its own LLM API-key flow.
- Build a public, reviewable foundation suitable for a long-lived community project.

## Current boundaries

- M2 starts with the browser Web Speech API only.
- Web Speech API may send audio to a browser vendor service; zero additional cost does not mean local-only recognition.
- If Web Speech fails, the current draft is preserved and the user is asked to record again. The first release does not switch backends invisibly during one session.
- Polishing uses dsh's existing LLM routes and credentials; the plugin stores only the selected provider/model pair.
- Local Whisper, cloud ASR, and emotion labels are deferred.

## Development

```sh
pnpm install
dsh plugin --profile web add "$PWD"
pnpm check
pnpm dev:config
pnpm dev:web
```

Run the compiler watcher in another terminal when iterating on source files:

```sh
pnpm dev:watch
```

Install the checkout into the local `web` profile once before the first browser run. The local development patch then enables Cordis HMR and watches the project `lib/` output; it does not insert a second `dsh-ears` loader entry. `dev:config` builds the package, writes a machine-local HMR-only patch under `.dsh/`, and verifies the composed profile with `dsh --profile web --dump-config`. `dev:web` boots the profile without modifying its tracked configuration.

With dsh `rc.6`, use the explicit `dsh --profile web` form when passing a patch. The development scripts encode this verified CLI behavior.

## Repository map

- [PLAN.md](./PLAN.md): public-safe implementation plan and acceptance criteria.
- [AGENTS.md](./AGENTS.md): repository instructions for coding agents.
- [.agent/agent.md](./.agent/agent.md): active handoff and current work state.
- [.agent/context.md](./.agent/context.md): stable architecture and product context.
- [.agent/decisions.md](./.agent/decisions.md): append-only decision records.
- [.agent/workflow.md](./.agent/workflow.md): multi-agent, validation, commit, and security workflow.
- [CONTRIBUTING.md](./CONTRIBUTING.md): contribution and review expectations.
- [SECURITY.md](./SECURITY.md): security and release rules.

## Security

Never commit API keys, tokens, cookies, private endpoints, user audio, credentials, `.env` files, or personal machine paths. This checkout is local-only until an explicit release decision is made; agents must not push or publish by default.
