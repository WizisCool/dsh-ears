# dsh-ears Agent Instructions

This is the repository-level entry point for coding agents. Read it before changing code or documentation, then follow the project context order below.

## Required reading order

1. `PLAN.md` — product scope, milestones, and acceptance criteria.
2. `.agent/agent.md` — current status, active work, and handoff notes.
3. `.agent/context.md` — stable project context, terminology, and architecture boundaries.
4. `.agent/decisions.md` — accepted decisions that must not be silently reversed.
5. `.agent/workflow.md` — collaboration, validation, commit, and security rules.

## Current baseline

- dsh target: `0.1.0-rc.6`; the first release does not promise other rc versions.
- Current stage: documentation, collaboration baseline, M1 package scaffold, M2 microphone, M3 polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete. Public release remains explicitly gated.
- The current checkout is local-only. Do not push, publish, create a remote repository, or change external state without explicit user authorization.
- The main project language is English. Use English for source code, code comments, public documentation, context documents, issue-ready text, and commit messages. Runtime product prompts may use Chinese when the product behavior requires Chinese output.

## Engineering standards

- Follow the official DeepSeek Harness repository's package shape, README structure, naming, lifecycle, and TypeScript style where applicable.
- Prefer the smallest change that completes one independently verifiable task.
- Verify dsh APIs against current documentation and the installed rc.6 packages; do not guess an API from memory.
- Keep Host and browser Client responsibilities explicit. Do not introduce a browser-side credential path for Host-owned services.
- Do not implement emotion UI or custom LLM provider support without an explicit contract and scope decision. Local Whisper and cloud ASR are implemented; future providers still require an independent protocol and smoke test.

## Git rules

- Use explicit paths with `git add <path...>`; do not use unreviewed `git add -A`.
- Keep commits atomic and use Conventional Commits, for example `feat(client): add web speech draft updates`.
- Run a relevant validation command and `git diff --cached --check` before every commit.
- Do not mix unrelated refactors, formatting churn, documentation changes, and feature behavior in one commit.
- Update `.agent/agent.md` after each milestone, verification change, or blocker.

## Security rules

- Never commit API keys, OAuth tokens, cookies, passwords, private keys, private endpoints, user data, or personal absolute paths.
- Examples must use placeholders such as `YOUR_API_KEY` and must never contain a real credential.
- Do not copy secrets into context files, logs, tests, screenshots, or commit messages.
- If a possible secret is found, stop before committing, remove it, inspect the full Git diff, and report the issue without publishing the value.

## Handoff requirement

Every completed task must leave a concise record in `.agent/agent.md`: completed work, validation commands and results, unfinished work, blockers, next step, and commit hash.
