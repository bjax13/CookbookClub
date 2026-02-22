# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning once a 1.0 release is cut.

## [Unreleased]

### Added

- Import guard now rejects invalid backup snapshots before write.
- SQLite schema migration `v5` adds foreign-key enforcement.
- CI/release workflows pin GitHub Actions by commit SHA.
- Security audit workflow runs `npm audit --omit=dev --audit-level=high` on PRs/pushes and weekly schedule.
- Thin web MVP server (`npm run start:web`) with API + static UI for club init, meetup scheduling, member invite, and recipe flows.
- Web integration test suite covering API and static app shell.

### Changed

- Branch protection now requires `test (24)`, `test (25)`, and `smoke`.
- CI/smoke workflows explicitly use least-privilege `contents: read` permissions.
- `.gitignore` now excludes generated SQLite and backup artifacts.
- Manual verification script now matches Node 24+ runtime and includes backup verification before import.

## [0.1.3] - 2026-02-22

### Added

- `status` command for one-shot operational snapshot (club/meetup/counts/storage).
- `data verify-backup --in <path>` for snapshot validation before import.
- Deterministic smoke fixture file at `test/fixtures/test-recipe.jpg`.

### Changed

- Smoke workflow now exercises recipe and backup-verify commands.
- CI matrix now runs automated tests on Node 24 and 25.

## [0.1.2] - 2026-02-22

### Added

- Smoke test workflow (`.github/workflows/smoke.yml`) for JSON + SQLite command checks.
- CLI `version` command with integration coverage.
- Quickstart and troubleshooting sections in README.
- Safer release helper script (`npm run release:tag`) with branch/state/tag/test guards.
- Release process guide updates to include explicit version-bump sequence.

### Changed

- Package metadata now includes `repository`, `bugs`, and `homepage`.
- Package version is aligned with published tags.
- Release docs now reference the automated tagging command.

## [0.1.1] - 2026-02-22

### Added

- GitHub CI workflow for push/PR test runs.
- PR and issue templates, CODEOWNERS, Dependabot config, and security policy.
- MIT license and changelog baseline.
- Release workflow for tag-driven GitHub releases.
- Dependabot guardrails to ignore invalid semver-major updates for core GitHub actions.
- Reminder template export/import commands.
- SQLite doctor/repair enhancements for malformed JSON fields with backup output.
- Node 24 runtime check script for preinstall/start/test.

### Changed

- Improved validation and error handling across CLI and service flows.
- Added PATH bootstrap wrapper for consistent local command execution while preserving CI toolchain priority.
- Enforced Node.js 24+ in package engines and contributor docs.
