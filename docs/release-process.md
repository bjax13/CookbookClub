# Release Process

This project uses tag-driven GitHub releases.

## Prerequisites

- `main` is green in CI.
- `CHANGELOG.md` updated.
- `package.json` version matches intended release.

## Steps

1. Run tests locally:

```bash
npm test
```

2. Commit release-prep changes to `main`.

3. Bump package version without creating a tag:

```bash
npm version X.Y.Z --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "Release prep vX.Y.Z"
git push
```

4. Create and push an annotated tag:

```bash
npm run release:tag
```

5. Confirm release workflow success:

```bash
gh run list --limit 5
gh release view vX.Y.Z
```

## Notes

- Workflow file: `.github/workflows/release.yml`
- Release notes are generated automatically by GitHub.
- Tag creation script: `scripts/release-tag.sh`
  - requires clean working tree
  - requires current branch to be `main`
  - validates that the tag does not already exist
  - runs `npm test` before tagging
