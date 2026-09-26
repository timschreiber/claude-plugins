# planandtier spike: run checklist

Answers P1–P8 from `docs/planandtier/planandtier-spike-spec.md`. One plan-and-approve
cycle covers P1–P5 and P8; the workflow it launches covers P6–P7.

## Environment

- [ ] Claude Code v2.1.271 or later (`claude --version`; write it in `observations.json`)
- [ ] `CLAUDE_CODE_EFFORT_LEVEL` unset
- [ ] `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unset
- [ ] Dynamic workflows enabled (`/config`)
- [ ] Throwaway repo, opened as a trusted folder, containing a few small source files

## Run

```powershell
cd <throwaway-repo>
$env:CLAUDE_PLUGIN_DATA = "$PWD\.probe-data"   # keeps probe.log somewhere you can find it
claude --plugin-dir <this-repo>/plugins/planandtier
```

If `CLAUDE_PLUGIN_DATA` is not honored when loading with `--plugin-dir`, the log is in
`$env:TEMP\planandtier-probe\probe.log` instead.

1. **P1, out of plan mode.** Type any short prompt (`what files are here?`).
2. **P1 to P5, P8, in plan mode.** Press Shift+Tab until plan mode is on. Ask for a small
   change that needs three or more steps (for example: add a `--verbose` flag, wire it into
   the logger, and add a test). Approve the plan when it is offered. The first
   `ExitPlanMode` is denied by the probe on purpose: let the model revise and call it again.
3. **Approval.** Approve the plan. From here, **type nothing.** If Claude Code asks you to
   approve running the workflow, note it (P8) and approve.
4. **Watch.** `/workflows` shows eight tasks running one at a time.

## Record by hand (`observations.json` next to `probe.log`)

```json
{
  "generated": "<ISO timestamp>",
  "claudeCodeVersion": "<claude --version>",
  "P3_marker_echoed": true,
  "P5_args_typeof": "object",
  "P8_typed_a_command_or_prompted": false,
  "reported": { "T01": "low", "T02": "high", "T03": "low", "T04": "medium",
                "T05": "high", "T06": "xhigh", "T07": "max" }
}
```

- `P3_marker_echoed`: did the first message after approval begin with `ZEBRA-PLANANDTIER`?
- `P5_args_typeof`: only needed if the analyzer cannot read it from the log. The workflow's
  `log()` lines and its return value in `/workflows` both show it.
- `P8_typed_a_command_or_prompted`: `true` if you had to type anything, or the model asked
  you to confirm launching the workflow before doing it. A plain tool-permission click is `false`.
- `reported`: for each task, the effort `/workflows` or the agent detail shows. Write
  `"none"` if it shows no effort. Also note each task's model, and whether the worker's
  summary says it could call the Agent tool (expected: no).

## Analyze

```powershell
node probes/planandtier/analyze-spike.js <path>\probe.log <path>\observations.json
```

Writes `probes/evidence/planandtier-spike-results.json`.
