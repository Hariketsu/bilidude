# AGENTS.md

## Release

Ask the user before every push.

1. Set `version` in `package.json` (0.x: new features bump the minor version, fixes the patch version). Commit as `chore(release): 版本号设为 X.Y.Z`.
2. `git push origin master` and wait for CI to pass: `gh run watch <id> --exit-status`.
3. Only then tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Watch the Release workflow. It checks that the tag matches `package.json`, runs `pnpm zip`, and creates the GitHub Release with `bilidude-X.Y.Z-chrome.zip`. Confirm with `gh release view vX.Y.Z`.

Tag last: the Release workflow skips typecheck, and a published Release is harder to take back than a red CI run.
