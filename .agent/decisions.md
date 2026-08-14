# Architecture Decision Records

## D-001 — Project identity

- Status: accepted
- Decision: The project name is `dsh-ears`.
- Rationale: It matches the “give text-only DeepSeek ears” positioning without using the Typeless trademark.

## D-002 — Interaction contract

- Status: accepted
- Decision: Click to start; stream recognition into an editable draft; stop; let the user send manually.
- Prohibited: automatic send or treating an unconfirmed transcript as a sent message.

## D-003 — First ASR milestone

- Status: accepted
- Decision: M2 implements the browser Web Speech API only.
- Failure behavior: preserve the recognized draft and ask the user to record again.

## D-004 — LLM ownership

- Status: accepted
- Decision: Polishing uses any provider/model route already configured in dsh and stores `{ provider, model }`.
- Prohibited: plugin-owned LLM `base_url`, `api_key`, provider, model input, or browser-side LLM request.

## D-005 — Host/Client packaging

- Status: accepted
- Decision: The package exposes Host `.` and browser `./client` entries and declares `dsh.bundle.patch` plus `dsh.client`.
- Development HMR overlay and published bundle patch remain separate.

## D-006 — Compatibility

- Status: accepted
- Decision: The first release is validated only against dsh `0.1.0-rc.6`.

## D-007 — Deferred scope

- Status: accepted
- Decision: Local Whisper, cloud ASR, and emotion UI are deferred. An emotion field may be reserved but cannot be a first-release dependency.

## D-008 — Language and public quality

- Status: accepted
- Decision: Source, code comments, repository docs, context docs, issue-ready text, and commit messages are English-first and follow official dsh repository conventions.
- Runtime prompts may use Chinese when required by the product behavior.

## D-009 — Release safety

- Status: accepted
- Decision: No push, public-repository conversion, npm publish, or legal license selection is automatic. Each requires an explicit release decision.

## D-010 — Codex-style microphone control

- Status: accepted
- Decision: The microphone control follows the provided Codex composer reference for placement, density, visual state, and interaction: right-side circular toolbar affordance, microphone icon at rest, stop square while recording, live draft updates, and manual send only.
- Constraint: Reuse dsh primitives and tokens where possible; do not copy Codex source code, private assets, or implementation details.

## D-011 — Native plugin configuration surface

- Status: accepted
- Decision: Register `dsh-ears` configuration in dsh's native Plugins settings page through the `settings.plugin.item` list slot.
- Prohibited: a separate Voice settings tab, standalone Voice settings section, or plugin-owned settings page outside the native Plugins surface.
- Rationale: dsh's Plugins page is the canonical host-plugin configuration surface and keeps plugin settings discoverable and visually consistent.

## D-012 — rc.6 composer theme and ordering integration

- Status: accepted
- Decision: Keep the microphone contribution in `conversation.input.right`, and use public dsh slot topology selectors to make the visual order model selector → microphone → send button in rc.6.
- Decision: Use dsh semantic CSS tokens for idle, hover, recording, error, and focus states so the control follows the active light/dark theme.
- Prohibited: generated internal class selectors, copied Codex palette values, or a separate theme override that bypasses dsh tokens.
- Rationale: rc.6 renders the right-side list slot before the named model seat, while slot wrappers are `display: contents`; the public `data-slot` attributes are the stable integration seam.

## D-013 — Cordis Remote invocation scope

- Status: accepted
- Decision: Mount the plugin's Typert contribution first, then create the browser contributions inside a Cordis child scope injecting `remote.dshEars`. Pass the concrete `dshEars` namespace to asynchronous controllers and React event handlers.
- Rationale: rc.6 resolves dotted Remote namespaces through the active Cordis injection map. Retaining an unscoped `ctx.remote` value and reading `remote.dshEars` later fails outside the original injection scope.
