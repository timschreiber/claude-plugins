# docs

Findings. Every number traces to an evidence file under `probes/evidence/`.

tierminator was called planandtier until 2026-10-03; probes and evidence recorded before then keep that name.

| Document | Source |
|---|---|
| `denoizinator-net-spec.md` | The build specification. Start here. |
| `hook-behavior-findings.md` | Measured Claude Code hook behaviour. §14 (the PowerShell tool) is derived from `probes/evidence/powershell-tool-rewrite.json`; §15 (the PowerShell tool end to end) from `probes/evidence/powershell-tool-e2e.json`. |
| `dotnet-test-runner-findings.md` | Derived from `probes/evidence/probe-results.json` (207 runs). |
| `framework-build-findings.md` | Derived from `probes/evidence/framework-build-results.json` (100 records). |
| `tierminator/tierminator-reference.md` | Every tierminator feature and how it works. Start here for tierminator. |
| `tierminator/tierminator-spike-spec.md` | The tierminator design and its spike plan. |
| `tierminator/tierminator-spike-findings.md` | Derived from `probes/evidence/planandtier-spike-headless-results.json` (22 hook records), `planandtier-spike-interactive-results.json` (25), and `planandtier-effort-pairs-results.json` (8 tasks). |
| (evidence, not a doc) | `probes/evidence/planandtier-b3-headless-results.json`: the built plugin running a 3-task plan headless. |
| `tierminator/tierminator-e2e-findings.md` | Derived from `probes/evidence/planandtier-e2e-results.json`: the built plugin in an interactive session. |
| `tierminator/tierminator-manual-mode-findings.md` | Derived from `probes/evidence/planandtier-default-mode-headless-results.json` and `planandtier-manual-mode-results.json`: the plugin without auto mode. |
| `tierminator/tierminator-dialog-findings.md` | Derived from `probes/evidence/planandtier-launch-shapes-results.json` (4 cells), `planandtier-dialog-shapes-observations.json` and `planandtier-dialog-shapes-probe.log` (6 plans): the launch rejection and the plan dialog's limit. Also `planandtier-sidecar-*` (1 session): the tasks file and the confirmed launch in the built plugin. |
| `tierminator/tierminator-tier-findings.md` | Derived from `probes/evidence/planandtier-tier-research.json` (published benchmarks and Anthropic docs, fetched 2026-09-28) and `probes/evidence/planandtier-sonnet-5-5-charts.json` (Anthropic's Sonnet 5.5 launch charts): why the tiers are `sonnet` at `low` to `high` and `opus` at `medium` and `high`, and `medium` is the baseline effort. |
| `tierminator/tierminator-agent-dispatch-findings.md` | Derived from `probes/evidence/planandtier-agent-probe.log` and `planandtier-agent-probe-results.json` (1 headless session), plus the earlier runs' worker frames: what hooks see when tasks run through the Agent tool instead of a workflow. Also `planandtier-agents-*` (the interactive runs) and `planandtier-arm-probe.log` and `planandtier-arm-probe-results.json` (1 headless session): what a hook sees when the user types a plugin skill command. Also `planandtier-execute-plan-20260928-162334-*` (4 sessions): /planandtier:execute-plan live (the command is now /tierminator:execute). |
| `tierminator/tierminator-telemetry-findings.md` | Derived from `probes/evidence/planandtier-usage-shapes.json` (7 sessions' transcripts, and the agent probe logs) and `planandtier-pricing.json` (Anthropic's pricing page, fetched 2026-09-28): where worker, planning and orchestration usage can be read, how to count it, and what it costs. Also `planandtier-agents-20260928-155438-*` and `-161554-*` (2 interactive runs): which hook messages are shown, the planning of a rejected round, and the fixes working. |
| `decidinator/decidinator-verification.md` | Derived from `probes/evidence/decidinator-verification-results.json` and `decidinator-probe-*` (7 headless cells: hook inputs, subagent rows, run results, transcripts): which of the six behaviors Decidinator's spec assumes hold. The interactive cells are pending. |
| `decidinator/decidinator-reference.md` | Every Decidinator hook, file format, command, configuration key and environment variable. Start here for Decidinator. |
| `decidinator/decidinator-e2e-run.md` | The WP-10 end-to-end runbook: seven interactive scenarios and the fresh-install check. Results in `tests/decidinator/e2e/fixtures/scenario-*/result.json`, written by `tests/decidinator/e2e/check.js`. |
| `tierminator/tierminator-headless-command-findings.md` | Derived from `probes/evidence/tierminator-headless-probe-results.json`, `-hooks.jsonl` and `-output.json` (1 headless session): a plugin command typed headless reaches the hook as raw text, the hook sees an `sdk` entrypoint, `$ARGUMENTS` expands, and `additionalContext` reaches the model. |
| `tierminator/tierminator-opt-in-draft-plan.md` | A superseded design draft. Its opt-in part was implemented as arm/disarm commands, later replaced by `/tierminator:plan` and `/tierminator:execute`. |

Probes live in `probes/`. See `probes/README.md` for what each one answers and
which spec decision it unblocks. Regenerate findings by re-running the probe,
not by editing numbers.

## Not yet here

- `Nickelcade_Denoizinator_NET-Spec.md` — the original spec.
- `dotnet10-test-runner-findings.md` — earlier net10.0-only findings, superseded.
