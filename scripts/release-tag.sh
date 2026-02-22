#!/bin/sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/bin:/usr/bin:$PATH"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required." >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "Error: release tags must be created from main (current: $branch)." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('node:fs').readFileSync('./package.json','utf8')).version")"
if [ -z "$version" ]; then
  echo "Error: could not read package version from package.json." >&2
  exit 1
fi

tag="v$version"
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Error: tag $tag already exists." >&2
  exit 1
fi

echo "Running test suite before creating $tag..."
npm test

echo "Creating and pushing release tag: $tag"
git tag -a "$tag" -m "Release $tag"
git push origin "$tag"

echo "Done. Watch release workflow with:"
echo "  gh run list --limit 5"
