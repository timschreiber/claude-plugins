# Decidinator WP-01 probe: runbook

The headless cells are run by `node probes/decidinator/run-headless.js <cell>`. The seven cells are
below. The interactive cells in the next section need a person.

| Cell | Permission mode | Extra | Prompt name |
| --- | --- | --- | --- |
| normal-default | default | none | research |
| plan-default | plan | none | research |
| normal-allowed | default | `--allowedTools WebFetch,WebSearch,Bash(gh search:*)` | research |
| plan-allowed | plan | `--allowedTools WebFetch,WebSearch,Bash(gh search:*)` | research |
| deny-normal | default | PROBE_DENY=1 | deny |
| deny-plan | plan | PROBE_DENY=1 | deny |
| model | default | none | model |

## Interactive cells

| Cell | Permission mode | PROBE_DENY | Prompt name |
| --- | --- | --- | --- |
| interactive-normal | default | 0 | research |
| interactive-plan | plan | 0 | research |
| interactive-deny-normal | default | 1 | deny |
| interactive-deny-plan | plan | 1 | deny |

Steps for one cell, run in a fresh terminal that is not inside a Claude Code session, from the repo root:

```powershell
$repoRoot = (Get-Location).Path
$cell = 'interactive-normal'   # the cell's name
$base = Join-Path $env:TEMP "decidinator-probe\$cell"
Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$base\repo" | Out-Null
node "$repoRoot\probes\decidinator\run-headless.js" --prompt research | Set-Clipboard   # the cell's prompt name
Push-Location "$base\repo"; git init -q; Set-Content README.md '# Probe repo'
$env:PROBE_RUN = $cell; $env:PROBE_OUT = "$base\out"; $env:PROBE_DENY = '0'   # '1' for the deny cells
claude --plugin-dir "$repoRoot\probes\decidinator\probe-plugin"   # add --permission-mode plan for the plan cells
```

1. Paste the prompt (it is on the clipboard) and send it.
2. Approve every permission prompt that appears, and write down which tools asked.
3. For the deny cells, if an AskUserQuestion dialog appears anyway, record that and pick any option.
4. When Claude has replied, type `/exit`.
5. Then run:

```powershell
Pop-Location
node probes/decidinator/collect.js $cell "$base\out"
Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY
```

## After the interactive cells

Run `node probes/decidinator/analyze.js`. Then, in a new Claude Code session, finalize
`docs/decidinator/decidinator-verification.md` from the regenerated
`probes/evidence/decidinator-verification-results.json`: fill in the interactive columns and item 4's
detection method, and add the permission prompts you noted to item 1.

## Other setups (item 6)

On a Bedrock or Pro-plan setup, run `node probes/decidinator/run-headless.js model` there. Before
running it on the next setup, rename the three `decidinator-probe-model-*` evidence files to
`decidinator-probe-model-<setup>-*`. Then rerun the analyzer.
