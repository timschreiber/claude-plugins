# docs

Findings. Every number traces to an evidence file under `probes/evidence/`.

| Document | Source |
|---|---|
| `denoizinator-net-spec.md` | The build specification. Start here. |
| `hook-behavior-findings.md` | Measured Claude Code hook behaviour. |
| `dotnet-test-runner-findings.md` | Derived from `probes/evidence/probe-results.json` (207 runs). |
| `framework-build-findings.md` | Derived from `probes/evidence/framework-build-results.json` (100 records). |
| `planandtier/planandtier-spike-spec.md` | The planandtier design and its spike plan. |
| `planandtier/planandtier-spike-findings.md` | Derived from `probes/evidence/planandtier-spike-headless-results.json` (22 hook records), `planandtier-spike-interactive-results.json` (25), and `planandtier-effort-pairs-results.json` (8 tasks). |
| (evidence, not a doc) | `probes/evidence/planandtier-b3-headless-results.json`: the built plugin running a 3-task plan headless. |
| `planandtier/planandtier-e2e-findings.md` | Derived from `probes/evidence/planandtier-e2e-results.json`: the built plugin in an interactive session. |
| `planandtier/planandtier-manual-mode-findings.md` | Derived from `probes/evidence/planandtier-default-mode-headless-results.json` and `planandtier-manual-mode-results.json`: the plugin without auto mode. |

Probes live in `probes/`. See `probes/README.md` for what each one answers and
which spec decision it unblocks. Regenerate findings by re-running the probe,
not by editing numbers.

## Not yet here

- `Nickelcade_Denoizinator_NET-Spec.md` — the original spec.
- `dotnet10-test-runner-findings.md` — earlier net10.0-only findings, superseded.
