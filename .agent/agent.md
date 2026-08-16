# dsh-ears Agent Handoff

> This is the active handoff document. Update it when a milestone, verification result, blocker, or ownership boundary changes.

## Status

- Stage: M1 package scaffold, M2 microphone, M3 dsh-owned polishing, M4 native settings, M5 final ASR backends/hardening, and the local M6 release-readiness audit are complete.
- Current work: global code-audit hardening, documentation, verification, and private remote delivery are complete.
- Follow-up UI fix: added the `dsh-ear.svg` project asset and corrected the rc.6 composer order to model → ContextMeter → microphone → send. The rc.6 settings-section contract does not expose a custom nav-icon field, so the left settings rail keeps dsh's native fallback icon without a dsh-core change.
- Target compatibility: dsh `0.1.0-rc.6`, Node `^22.19.0 || >=24.0.0`.
- Branch: `master`, synchronized with `origin/master` after the audit push.
- Latest code commit: `d8c9648 fix(client): pass native button element to Tooltip for proper ref binding`.
- Latest feature commit: `134a4e7 feat(client): use native dsh Tooltip and bilingual i18n for microphone button`.
- Latest fix commit: `a06da1e fix(client): adjust composer order for rc.6 trailing controls`.
- Latest audit docs commit: `3a85199 docs: record remote delivery`.
- Handoff baseline: `2963378 docs: finalize audit handoff`; this file records the subsequent remote-delivery update.
- Remote delivery: pushed `master` to private `origin` and verified the remote tip matches local `HEAD`.
- Repository strategy: MIT license and private GitHub repository `WizisCool/dsh-ears` are recorded; npm publishing, tags, and public visibility remain gated.
- Repository language: English-first for source, docs, context, comments, and commit messages.

## Completed audit and hardening

- Split the settings view from its asynchronous controller and added request generations for settings, routes, reasoning efforts, and Whisper state.
- Staged incomplete cross-field settings edits: enabling polishing or switching to Cloud ASR waits for required fields instead of submitting a Host-invalid partial patch; valid fields still save independently.
- Made Whisper download/cancel/delete/poll responses latest-wins, kept cancellation authoritative during cleanup, and preserved retry actions after failures.
- Made MediaRecorder start failures terminal and track-safe; late polish results are ignored after abort/unmount even when a Remote implementation ignores cancellation.
- Added Cloud ASR request timeout (120 seconds), early cancellation checks, bounded streamed polish output, and strict rejection of unknown backend/model identifiers.
- Aligned Host and Client Remote cancellation metadata for `updateSettings`; the parity test now compares every endpoint's parameters, codecs, cancellation marker, and result schema.
- Kept the high-risk recording-settings snapshot question and Whisper crash-residue integrity policy open rather than changing the first-release protocol implicitly.

## Verification evidence

Current local checks after the final handoff commit:

- `pnpm check` — passed.
- `pnpm test` — passed; 61 tests across 9 files.
- `pnpm build` — passed; Host ESM, Client factory bundle, CSS, declarations, and source maps generated.
- `pnpm pack --dry-run` — passed; package contents include Host/Client entries, declarations, patch, README, changelog, and license.
- `git diff --check` — passed after each code commit.
- Secret scan for common key/private-key patterns — no matches.

Final real rc.6 smoke evidence on the latest build:

- `dsh --version` returned `0.1.0-rc.6`.
- `pnpm dev:config` produced the HMR patch and a temporary Web boot on port 64804 loaded `/plugins/dsh-ears/client.js` (HTTP 200; manifest revision observed).
- Native `dsh-ear` Recognition and Polishing tabs loaded without the load-failure hint; Whisper state RPC rendered; composer order measured as model → microphone → send with computed orders 1, 2, 3.
- Browser warning/error logs were empty.
- Shutdown printed `Invalid revision range c964...HEAD`; this was reproduced as an HMR/environment diagnostic after the plugin had loaded, not attributed to business code.

## Follow-up UI verification

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed.
- `./node_modules/.bin/vitest run` — passed; 61 tests across 9 files.
- `./node_modules/.bin/tsdown && ./node_modules/.bin/tsc -p tsconfig.build.json` — passed; final Host/Client artifacts generated.
- Impeccable detector — clean on the changed UI targets.
- Existing `dsh web` on `127.0.0.1:3080` served the rebuilt Client bundle with HTTP 200 and the final composer-order selectors. No `dev:watch` process is running, so the browser needs a refresh to consume the rebuilt bundle.

## Current boundaries and open decisions

- Web Speech may use a browser-vendor recognition service; it is not claimed to be local-only.
- Cloud ASR is limited to the documented OpenAI-compatible multipart `{ file, model, language? }` and JSON `{ text }` contract.
- Emotion recognition/output and emotion UI remain intentionally deferred.
- The plugin does not bundle Whisper model weights.
- `transcribe()` reads backend/model/language when the Host RPC begins. Option A is a recording-start settings snapshot; Option B is locking recognition settings during capture/transcription. This requires a protocol decision.
- After a Host crash during Whisper download, a partial cache file may pass the stat-only startup check. Option A is SHA-256 verification with metadata caching; Option B is a completion sidecar/marker. This requires a performance and compatibility decision.
- No API keys, credentials, user audio, personal paths, private endpoints, or user data belong in Git.

## Remaining release gates

1. Keep the compatibility matrix current when dsh releases change.
2. npm publishing, release tags, and any public visibility change still require an explicit maintainer release decision.

## Final task record

- Completed: resolved Tooltip DOM ref binding by rendering a native `<button>` element inside `@deepseek-ai/dsh-client-ui-primitives`'s `Tooltip` component (setting side="top", delayMs=200), integrated complete English and Chinese bilingual copy for all microphone states/errors/tooltips via `settings.dshEars` locale namespace, and verified tests and builds.
- Validation: `tsc` typecheck, `vitest` (63/63 tests across 9 files), `tsdown` & `tsc` builds, and `git diff --check` all passed.
- Unfinished: two documented protocol decisions (recording settings snapshot and Whisper crash-residue integrity).
- Blocked: none.
- Commit: `d8c9648 fix(client): pass native button element to Tooltip for proper ref binding`.

## Handoff template

```text
Completed: ...
Validation: command / result
Unfinished: ...
Blocked: none / exact reason
Next: ...
Commit: hash + message
```
