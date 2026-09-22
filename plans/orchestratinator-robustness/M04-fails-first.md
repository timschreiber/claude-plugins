# M04: Change 3: Fails first (spec §5, §12)

- Status: outline
- Goal: Format 2 tasks carry `- Fails first: yes | no`. Workers write tests first and confirm Verify fails before implementing, and report a RED line in the combined report format. `run` handles `RED: CONFIRMED`, `PASSED-EARLY` (block reason `VACUOUS`), and missing or `N/A` (Retry). The README describes it.
- Depends on: M03
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §5 and §12, plus D01, D08 (placement and `no (<reason>)` format), D16, D17, D20 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17), including the stray-commit check steps in `run` 3d and 3e.
- Per D01, this milestone updates every reader of Fails first and of the worker report: plan-format, all four worker agents, and `run` (both 3d and 3e). The plan-reviewer's Fails first check belongs to M07.
- A task in a format 1 milestone has no Fails first field and is handled as `no`: `run` ignores its RED line.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks for the inserted text, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md`:
  - Add `- Fails first:` to the task template (after Verify, D08) and a Task fields row: the §5 rules, the `no (<reason>)` format, investigate tasks omit the field, and a Verify of `review` alone means `no`.
  - Add the Steps ordering rule for `yes`: test-writing steps first, then "Run Verify and confirm it fails", then implementation.
  - Add `VACUOUS` to the `- Blocked:` reasons list.
  - Add *(format 2)* checklist items for the field.
- `agents/worker-light.md`, `agents/worker.md`, `agents/worker-heavy.md`, `agents/specialist.md`:
  - Add the Fails first rule: write the tests, run Verify, and confirm it fails before writing implementation code. If Verify passes early, stop with `BLOCKED` / `GAP` and `RED: PASSED-EARLY`.
  - Replace the Report block with §12's combined format, which adds the RED line.
- `skills/run/SKILL.md`:
  - In 3d (read the report) and 3e (per-report handling), for a `Fails first: yes` task: `RED: CONFIRMED` → continue; `PASSED-EARLY` → Block with GAP handling with block reason `VACUOUS`; missing or `N/A` → Retry with the D20 reason line.
  - Add `VACUOUS` to the Stop reasons list.
- `README.md` "What a plan contains": add a Fails first bullet.
