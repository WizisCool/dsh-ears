# Security Policy

## Scope

dsh-ears may eventually handle voice input, dsh model routes, and optional ASR service configuration. Those runtime features are not implemented in the current baseline, but the repository follows public-project security rules from day one.

## Never commit

- API keys, OAuth tokens, cookies, passwords, private keys, or credentials.
- dsh profiles or `.env` files containing credentials.
- User audio, transcripts, logs, screenshots, or personal data.
- Private endpoints, internal addresses, or personal absolute paths.

## Reporting

Do not open a public issue containing a secret or a complete exploit. Stop the relevant work and report the issue privately to the maintainer with only the minimum information needed to reproduce it.

## Release rule

Push, public-repository conversion, npm publishing, and release tags are not default actions. Before any public release, complete a human review, sensitive-information scan, build/test verification, and license review.
