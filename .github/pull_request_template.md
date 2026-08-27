<!--
The PR title becomes the single squash-merge commit message on master.
It must start with a Conventional Commit prefix (feat:, fix:, docs:, chore:, test:).
Fixes #NN closes the issue. Related to #NN only links it.
Non-draft PRs should name an issue unless the change is trivial (typo, changelog).
-->

Related: Fixes #NN

## Summary

<!-- What changes, and why. One short paragraph. -->

## Surface

- [ ] Host / Remote / schema
- [ ] Client UI
- [ ] Docs or ADR
- [ ] Tests only

## Validation

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm build` if emitted artifacts changed
- [ ] Web smoke if the composer, recognition bar, or settings changed
- [ ] Restarted `dsh web` if Host, settings registration, Remote, or schema changed
- [ ] Diff has no keys, cookies, recordings, or personal paths

## Notes

<!-- Screenshots, leftover risk, follow-up. -->
