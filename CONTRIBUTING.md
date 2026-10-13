# Contributing to PactPlum

Thanks for helping. Before opening a pull request:

1. Open an issue describing the change, unless it is a small fix.
2. Run `npm run lint`, `npm run typecheck` and `npm test`. All must pass.
3. Add or update tests for behavior you change.
4. Keep pull requests focused on one change.
5. Add a line under `## [Unreleased]` in `CHANGELOG.md` for any change users or operators would notice.

## Versions and releases

PactPlum uses [Semantic Versioning](https://semver.org/). Before 1.0.0, minor versions add features and may include breaking changes; patch versions fix bugs.

To release:

1. Rename `## [Unreleased]` in `CHANGELOG.md` to `## [x.y.z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and update the comparison links at the bottom.
2. Set `"version"` in `package.json` to the same number and run `npm install` to update `package-lock.json`.
3. Merge to `main`, then tag the merge commit: `git tag -a vx.y.z -m "PactPlum x.y.z"` and `git push origin vx.y.z`.

By contributing you agree that your contributions are licensed under the MIT license.
