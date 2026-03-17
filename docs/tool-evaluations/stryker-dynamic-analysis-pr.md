# StrykerJS Dynamic Analysis PR

## Summary

This PR adds **StrykerJS** as the team's dynamic analysis tool on branch `tool/stryker-dynamic-analysis`.

To keep the integration isolated from NodeBB's existing Mocha/ESLint/TSLint tooling, the branch uses:

- a dedicated `node:test` smoke suite in `test/dynamic-analysis/pagination.test.js`
- a dedicated Stryker config in `stryker.config.json`
- a dedicated GitHub Actions workflow in `.github/workflows/stryker-dynamic-analysis.yml`

The mutation target is intentionally narrow: `src/pagination.js`. That keeps the setup fast, easy to rerun, and reliable enough for screenshots/artifacts while still exercising real production code in the repository.

## Concrete Installation Evidence

- `install/package.json`
  Adds the new dev dependency `@stryker-mutator/core` and the scripts `dynamic:stryker` and `dynamic:stryker:test`.
- `stryker.config.json`
  Adds the Stryker configuration used for mutation testing.
- `.github/workflows/stryker-dynamic-analysis.yml`
  Adds a dedicated GitHub Actions workflow that installs dependencies, runs Stryker, and uploads the generated artifacts.

## Concrete Run Artifacts

- `artifacts/dynamic-analysis/stryker/npm-ls-stryker.txt`
  Confirms that `@stryker-mutator/core` is installed in the project.
- `artifacts/dynamic-analysis/stryker/terminal-output.txt`
  Captures the local terminal output from a successful Stryker run.
- GitHub Actions artifact: `stryker-dynamic-analysis`
  The workflow uploads the terminal output and generated Stryker report files for the PR.

## Quantitative Results

Local run results:

- Mutated file count: 1 (`src/pagination.js`)
- Total mutants: 137
- Killed mutants: 103
- Survived mutants: 33
- Timeout mutants: 1
- Mutation score: 75.91%
- Runtime: about 8 seconds on the dev container

## Qualitative Evaluation

### Pros

- **Very little project-specific wiring was required.** Stryker worked with a simple command runner and `node:test`, so I did not need to reuse NodeBB's existing Mocha setup.
- **The reports are immediately useful.** The terminal output shows which mutants survived, and the generated HTML/JSON reports are straightforward evidence for the PR.
- **It scales from "quick smoke check" to stricter enforcement.** The `mutate` target can stay narrow for cheap experimentation or expand later to broader source directories.

### Cons

- **Vanilla startup was not fully plug-and-play in this repository.** The first Stryker run failed while copying generated symlinked assets under `build/public/plugins/core/inter`.
- **It is easy to get misleadingly low or high scores depending on scope.** Restricting the mutation target to a single file makes the tool easy to adopt, but it is not representative of whole-project mutation strength.
- **Runtime will grow quickly if the mutation scope expands.** The current run is fast because it mutates one small file with a tiny dedicated test suite.

### Required/Useful Customization

- **A priori customization**
  - Added `commandRunner.command` so Stryker uses `node --test` instead of Mocha.
  - Limited `mutate` to `src/pagination.js` to keep runtime and setup complexity low.
  - Added dedicated reporters and artifact paths for PR evidence.
- **Ongoing customization**
  - If the team wants stronger signal later, broaden `mutate` to additional files and expand the dedicated tests.
  - If Stryker is pointed at more of NodeBB, `ignorePatterns` should continue excluding generated directories and heavyweight artifacts that are not needed for test execution.

## Notes

- The first near-vanilla mutation run failed because Stryker attempted to copy generated symlinked build assets. The final configuration fixes that by excluding generated directories with `ignorePatterns`; I did not need to disable mutation scoring or switch to `dryRunOnly`.
- This document records the initial evaluation branch. The merged workflow and ongoing integration policy are documented in `docs/design/stryker-integration-design.md`.
