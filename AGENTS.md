# AGENTS.md

## Working agreements

- Discuss before coding when there are design trade-offs: lay out options with a recommendation. For UI changes, get sign-off on a prototype or screenshot first.
- Use Chinese for conversation and commit messages; use English for code, comments, and default UI copy (keep locale files in sync).
- Prefer TDD: agree on test seams, write failing tests first, then make them pass. Report honestly what was verified for real versus mocked or run only after implementation.
- Commit finished work in logical batches without asking: Conventional Commits in Chinese, the reason in the body. The maintainer reviews commit by commit. Ask before every push.
- Keep a git-ignored `HANDOFF.md` at the repo root: current state, what was verified for real and what only with mocks, gotchas, open items. Read it first in a new session; update it when the state changes.
- Keep user-facing docs (README and the like) concise, restrained, and natural—avoid AI boilerplate and saying the same thing twice. The Chinese README is primary; sync the English one after.
- Ask before editing prompt text in `lib/llm/`. Design prompts for product scenarios and generalization, not to game a fixed test set. Verify changes against real cases (`docs/PROMPT-EVAL.md`): hard contracts (renderer/tool formats, explicit user language/format requests) must not regress; style and experience trade-offs are judged holistically by the maintainer from the comparison report.

## Release

Ask the user before every push.

1. Set `version` in `package.json` (0.x: new features bump the minor version, fixes the patch version). Commit as `chore(release): 版本号设为 X.Y.Z`.
2. `git push origin master` and wait for CI to pass: `gh run watch <id> --exit-status`.
3. Only then tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Watch the Release workflow. It checks that the tag matches `package.json`, runs `pnpm zip`, and creates the GitHub Release with `bilidude-X.Y.Z-chrome.zip`. The notes list every `feat` / `fix` / `perf` commit since the previous tag (`.github/release-notes.sh`), so those subjects are what users read. Confirm with `gh release view vX.Y.Z`.

Tag last: the Release workflow skips typecheck, and a published Release is harder to take back than a red CI run.
