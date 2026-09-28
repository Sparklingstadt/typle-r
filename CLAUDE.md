@AGENTS.md

## Release workflow

Read `docs/release-workflow.md` before publishing changes. The required order is
PR → squash merge → post-merge verify → GitHub Release → Vercel production deploy.
Do not push directly to main or run manual release/deploy commands. Prepare a PR
with a new stable package version; GitHub Actions owns release and deployment.
Cloud sessions do not need Vercel CLI or Vercel credentials. A failure must be
fixed or retried at the failed stage, never bypassed.
