#!/usr/bin/env bash
# Release notes for tag $1: feat/fix/perf commits since the previous tag, then the
# "New Contributors" and "Full Changelog" parts of GitHub's generated notes.
# GitHub's own notes list merged PRs only, so commits pushed to master would be missing.
# Needs full history and tags (checkout with fetch-depth: 0), GH_TOKEN, and GITHUB_REPOSITORY.
set -euo pipefail

tag=$1
previous=$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)
range=${previous:+$previous..}$tag

changes=$(
  git log --reverse --format='%H %s' "$range" |
    grep -E '^[0-9a-f]+ (feat|fix|perf)(\([^)]*\))?!?: ' |
    while read -r sha subject; do
      login=$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha" --jq '.author.login // empty')
      echo "* $subject${login:+ by @$login} in ${sha:0:7}"
    done || true
)

generated=$(gh api "repos/$GITHUB_REPOSITORY/releases/generate-notes" -f tag_name="$tag" \
  ${previous:+-f previous_tag_name="$previous"} --jq .body)

if [ -n "$changes" ]; then
  printf "## What's Changed\n%s\n\n" "$changes"
fi
# Everything from "New Contributors" (or "Full Changelog" when there are none) to the end.
echo "$generated" | awk '/^## New Contributors|^\*\*Full Changelog/ { found = 1 } found'
