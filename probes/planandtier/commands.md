# planandtier spike: run checklist

Answers P1–P8 from `docs/planandtier/planandtier-spike-spec.md`.

All eight probes have been run once (see `docs/planandtier/planandtier-spike-findings.md`). This checklist
is kept to re-verify after Claude Code upgrades. Headless sessions (`claude -p`) can measure P1 and
P4–P7; P2, P3 and P8 need an interactive session, because headless sessions have no `ExitPlanMode`
tool. The interactive steps are in `docs/planandtier/planandtier-spike-interactive-run.md`.

## Environment

- [ ] Claude Code v2.1.271 or later (`claude --version`)
- [ ] `CLAUDE_CODE_EFFORT_LEVEL` unset
- [ ] `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unset
- [ ] Dynamic workflows enabled (`/config`)
- [ ] A throwaway repo, opened as a trusted folder, with a few small source files

## Interactive run (P2, P3, P8)

```powershell
cd <throwaway-repo>
claude --plugin-dir <this-repo>/plugins/planandtier
```

The probe log is `~/.claude/plugins/data/planandtier-inline/probe.log`. Claude Code
sets `CLAUDE_PLUGIN_DATA` itself for `--plugin-dir` loads, so setting it in your shell does nothing.
Delete the log first if you want a clean run.

1. Press Shift+Tab until plan mode is on. Ask for a small change that needs three or more steps
   (for example: add a `--verbose` flag, wire it into the logger, and add a test).
2. The first `ExitPlanMode` is **denied on purpose** by the probe (P2). Let the model revise the
   plan and call it again.
3. Approve the plan. From here, **type nothing.** The probe injects a reminder to begin with
   `ZEBRA-PLANANDTIER` and launch `planandtier:execute-plan` (P3, P8).
4. If Claude Code asks you to approve running the workflow, approve it and note it below.
5. Wait for the seven tasks to finish.

## Record by hand (`observations.json`)

```json
{
  "generated": "<ISO timestamp>",
  "claudeCodeVersion": "<claude --version>",
  "P3_marker_echoed": true,
  "P5_args_typeof": "object",
  "P8_typed_a_command_or_prompted": false
}
```

- `P3_marker_echoed`: did the first message after approval begin with `ZEBRA-PLANANDTIER`?
- `P8_typed_a_command_or_prompted`: `true` if you typed anything, or the model asked you to
  confirm launching the workflow before doing it. A plain tool-permission click is `false`.
- `P5_args_typeof`: copy the value from the workflow's return value.

## Analyze

```powershell
node probes/planandtier/analyze-spike.js ~/.claude/plugins/data/planandtier-inline/probe.log <path>\observations.json
```

Writes `probes/evidence/planandtier-spike-results.json`. Effort per task (P6, P7) is read from
the `SubagentStop` records, so nothing needs to be copied from `/workflows`.
