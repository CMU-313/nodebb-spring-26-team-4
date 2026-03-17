# Stryker Integration Design

## Overview

This document records the final integration plan for **StrykerJS** as the team's dynamic analysis tool for the NodeBB repository.

The project already completed an initial tool-evaluation branch and merged the first working setup into `main`. This design document captures the production-facing integration decisions needed for the checkpoint requirements: how often the tool runs, what customization was required, how it should be enforced, and what changes were necessary to keep the check passing.

## Tool Summary

- Tool: `@stryker-mutator/core`
- Technique: mutation testing
- Current mutation target: `src/pagination.js`
- Dedicated test entrypoint: `test/dynamic-analysis/pagination.test.js`
- Shared local/CI runner: `scripts/run-stryker-check.sh`
- GitHub Actions workflow: `.github/workflows/stryker-dynamic-analysis.yml`

## Integration

### How Often The Tool Runs

Stryker runs in two places in the normal development cycle:

1. On **every pull request** targeting `main`, `master`, or `develop`.
2. On **every push** to `main`, `master`, or `develop`.

This schedule balances fast feedback and confidence after merge:

- PR execution catches issues before merge and gives reviewers a green or red signal directly in the pull request.
- Push-to-main execution confirms the integrated branch still passes in the shared repository state after merge.
- `workflow_dispatch` remains enabled so teammates can manually rerun the check when debugging CI or verifying environment issues.

### Level Of Customization Needed

Stryker required moderate setup, but the final integration is intentionally lightweight.

Required customizations:

- **Separate test runner**
  Stryker uses `commandRunner.command = "npm run dynamic:stryker:test"` so it can rely on a dedicated `node:test` smoke suite instead of NodeBB's built-in Mocha workflow.
- **Restricted mutation scope**
  The `mutate` setting is currently limited to `src/pagination.js`. This keeps runtime low and the setup stable enough for regular CI execution.
- **Ignore generated directories**
  `ignorePatterns` excludes generated content such as `build`, `coverage`, `logs`, and existing artifact directories. This was necessary because the initial near-vanilla run failed while copying generated symlinked assets.
- **Artifact generation**
  The workflow uploads the Stryker artifact bundle so results are easy to inspect from a PR without rerunning locally.
- **Shared execution script**
  `scripts/run-stryker-check.sh` is used for both CI and teammate machines, which reduces drift between local execution and GitHub Actions behavior.

### How The Integration Is Enforced

The integration is enforced in two layers:

1. **Workflow visibility**
   The `Dynamic Analysis - Stryker` GitHub Actions workflow now runs automatically for normal PRs and pushes to the main development branches.
2. **Merge expectation**
   Pull requests should only be merged when the `Dynamic Analysis - Stryker` check is green.

Recommended repository setting:

- Configure branch protection on `main` so `Dynamic Analysis - Stryker` is a required status check before merge.

This repository setting is the strongest enforcement option because it prevents accidental merges with a failing dynamic-analysis run. Even without branch protection, the workflow is still part of the visible PR and post-merge cycle.

## Ensuring Passing Checks

Several implementation choices were made specifically to keep the integration stable enough to pass consistently:

- The mutation target was narrowed to one stable production file instead of attempting whole-repository mutation testing immediately.
- The smoke tests cover deterministic behavior in `src/pagination.js`, which avoids database and service dependencies.
- Generated directories are excluded because they caused Stryker sandbox-copy failures during the initial setup.
- Mutation score thresholds are informative rather than blocking. The current goal is reliable green execution as part of the development workflow; the team can tighten mutation thresholds later after broadening test coverage.

These tradeoffs should be revisited if the team decides to expand mutation testing beyond the current checkpoint-friendly scope.

## Teammate Verification

To check whether the integration works on another teammate's machine:

1. Pull the latest `main`.
2. Run the shared smoke test:

   ```bash
   ./scripts/run-stryker-check.sh --smoke
   ```

3. Run the full mutation check:

   ```bash
   ./scripts/run-stryker-check.sh
   ```

4. Compare the result with the GitHub Actions run attached to the corresponding pull request or push.

Why this is useful:

- The same script is used in CI and locally.
- The script handles the `install/package.json` to `package.json` copy step automatically.
- If a teammate gets different results, GitHub Actions acts as the neutral reference environment.

## Current Status

At the time of writing, the tool has:

- been merged into `main`
- passed in GitHub Actions during pull-request validation
- passed in GitHub Actions during branch push validation
- been integrated into the repository workflow rather than remaining a one-off evaluation branch
