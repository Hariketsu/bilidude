# AGENTS.md

## Working agreements

- Commit finished work in logical batches without asking: Conventional Commits in Chinese, the reason in the body. The maintainer reviews commit by commit. Ask before every push.
- Keep a git-ignored `HANDOFF.md` at the repo root: current state, what was verified for real and what only with mocks, gotchas, open items. Read it first in a new session; update it when the state changes.
- User-facing docs (README and the like) read as written by a person: no emoji headings, no callout boxes, no "**label** — explanation" bullets, no trailing justifications, each fact said once. A lively header (logo, tagline, badges) is fine. The Chinese README is primary; sync the English one after.
- Ask before editing prompt text in `lib/llm/`. Back every prompt change with evidence: compare the old and new versions on a fixed, varied set of real cases with repeated runs (`docs/PROMPT-EVAL.md`), not on one or two answers. A category that gets worse is not traded for another that gets better.

## Release

Ask the user before every push.

1. Set `version` in `package.json` (0.x: new features bump the minor version, fixes the patch version). Commit as `chore(release): 版本号设为 X.Y.Z`.
2. `git push origin master` and wait for CI to pass: `gh run watch <id> --exit-status`.
3. Only then tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Watch the Release workflow. It checks that the tag matches `package.json`, runs `pnpm zip`, and creates the GitHub Release with `bilidude-X.Y.Z-chrome.zip`. The notes list every `feat` / `fix` / `perf` commit since the previous tag (`.github/release-notes.sh`), so those subjects are what users read. Confirm with `gh release view vX.Y.Z`.

Tag last: the Release workflow skips typecheck, and a published Release is harder to take back than a red CI run.
