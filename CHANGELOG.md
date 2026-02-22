# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning once a 1.0 release is cut.

## [Unreleased]

### Added

- Release process guide in `docs/release-process.md`.

### Changed

- Package metadata updated to include repository, bugs, and homepage fields.
- Package version aligned with latest published tag (`0.1.1`).

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
