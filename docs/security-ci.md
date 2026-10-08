# CI and security checks

The workflows in `.github/workflows/ci.yml` and `.github/workflows/security.yml` run on pull requests to `main` or `dev`, pushes to those branches, and pushes to `ci/**`. They can also be started manually. The security workflow audits dependencies every Monday.

## What each check covers

| Check | Purpose |
| --- | --- |
| ESLint, TypeScript, Vitest, build | Catch source errors before merging. |
| Windows package and Electron smoke test | Verify that the shipped Windows app starts, loads the renderer, calls IPC, and opens SQLite. |
| Gitleaks | Scan Git history for committed credentials. GitHub secret scanning and push protection provide another layer on this public fork. |
| Semgrep Community Edition | Scan source patterns without a service token. |
| CodeQL security-extended | Analyze JavaScript and TypeScript data flows; findings appear in GitHub code scanning. |
| Dependency review | Reject pull requests that introduce a high or critical dependency advisory. |
| pnpm audit | Report high and critical advisories in both app and documentation lockfiles, including existing ones. |
| Dependabot | Propose weekly npm and GitHub Actions updates. |

All jobs use the minimum GitHub token permissions they need. The checks do not need a repository secret. Never add credentials or `.env` files to the repository; place any future integration token in GitHub Actions secrets.

## Current dependency baseline

The first audit on 2026-10-08 found existing high and critical advisories in both lockfiles. In the app lockfile, the critical Next.js advisories are reached through the `next-intl` peer dependency. The documentation site also uses Next.js directly. Other high advisories affect packages such as `sharp`, `source-map-js`, `undici`, and `@xmldom/xmldom`. The audit job intentionally fails while these remain; a green lint or build result does not mean dependency security is clean.

Update the affected packages and lockfiles, then rerun both audits. Two reported high advisories currently have no upstream patch: `http-cache-semantics` through Electron Builder's download tooling ([GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)) and `braces` through the documentation build ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). Keep these visible until their dependency chains are replaced or patched.

Locally, with the pinned pnpm version:

```sh
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm audit --audit-level high
pnpm --dir docs-site audit --audit-level high
```

After the first successful workflow runs, require the relevant checks for `main` in the fork's branch protection settings. Requiring the audit check before resolving the current advisories will block merges by design.
