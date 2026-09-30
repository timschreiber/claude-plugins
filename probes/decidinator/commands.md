# Decidinator WP-01 probe: runbook

The headless cells are run by `node probes/decidinator/run-headless.js <cell>`. The seven cells are
below (the last three, `model-plan`, `model-sonnet` and `model-sonnet-plan`, test which model a
predefined agent really runs on). The interactive cells in the next section need a person.

| Cell | Permission mode | Extra | Prompt name |
| --- | --- | --- | --- |
| normal-default | default | none | research |
| plan-default | plan | none | research |
| normal-allowed | default | `--allowedTools WebFetch,WebSearch,Bash(gh search:*)` | research |
| plan-allowed | plan | `--allowedTools WebFetch,WebSearch,Bash(gh search:*)` | research |
| deny-normal | default | PROBE_DENY=1 | deny |
| deny-plan | plan | PROBE_DENY=1 | deny |
| model | default | none | model |
| model-plan | plan | none | model |
| model-sonnet | default | none | model-sonnet |
| model-sonnet-plan | plan | none | model-sonnet |

## Interactive cells

Each cell below is ONE PowerShell block. Copy the whole block, paste it into a fresh PowerShell
window that is not inside a Claude Code session (any starting directory works), and press Enter.
Change nothing. The block does everything except the part in Claude:

1. It sets up the cell and puts the cell's prompt on the clipboard.
2. It starts Claude. **In Claude:** accept the folder-trust dialog if one appears, paste the prompt
   (Ctrl+V), send it, approve any permission prompt, wait for the reply, then type `/exit`.
3. When Claude exits, the block collects the evidence and prints `VALID` or `INVALID` for the cell.
   On `INVALID`, paste the same block again; it starts the cell over.

Write down which tools asked for a permission prompt, and whether an AskUserQuestion dialog appeared
in a deny cell (if one does, pick any option).

If the repo is not at `C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins`, change the
`$repoRoot` line in the block.

### Cell 1: interactive-normal

```powershell
$repoRoot = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$cell = 'interactive-normal'
$base = Join-Path $env:TEMP "decidinator-probe\$cell"
Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$base\repo" | Out-Null
$out = "$base\out-" + (Get-Date -Format 'yyyyMMddHHmmss')
$prompt = node "$repoRoot\probes\decidinator\run-headless.js" --prompt research
if ($LASTEXITCODE -ne 0 -or -not $prompt) { throw 'could not get the prompt; check $repoRoot' }
$prompt | Set-Clipboard
Push-Location "$base\repo"
try {
    git init -q
    Set-Content README.md '# Probe repo'
    $env:PROBE_RUN = $cell
    $env:PROBE_OUT = $out
    $env:PROBE_DENY = '0'
    Write-Host 'IN CLAUDE: paste the prompt (Ctrl+V), send it, wait for the reply, then type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot\probes\decidinator\probe-plugin" --permission-mode default
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY -ErrorAction SilentlyContinue
}
node "$repoRoot\probes\decidinator\collect.js" $cell $out
$hooks = "$repoRoot\probes\evidence\decidinator-probe-$cell-hooks.jsonl"
$agent = (Select-String -Path $hooks -Pattern '"tool_name":"Agent"' | Measure-Object).Count
$webfetch = (Select-String -Path $hooks -Pattern '"tool_name":"WebFetch"' | Measure-Object).Count
"Agent records: $agent (need 2 or more). WebFetch records: $webfetch (need 2 or more)."
if ($agent -ge 2 -and $webfetch -ge 2) { Write-Host "VALID: $cell" -ForegroundColor Green } else { Write-Host "INVALID: $cell. Paste this block again." -ForegroundColor Red }
```

### Cell 2: interactive-plan

```powershell
$repoRoot = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$cell = 'interactive-plan'
$base = Join-Path $env:TEMP "decidinator-probe\$cell"
Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$base\repo" | Out-Null
$out = "$base\out-" + (Get-Date -Format 'yyyyMMddHHmmss')
$prompt = node "$repoRoot\probes\decidinator\run-headless.js" --prompt research
if ($LASTEXITCODE -ne 0 -or -not $prompt) { throw 'could not get the prompt; check $repoRoot' }
$prompt | Set-Clipboard
Push-Location "$base\repo"
try {
    git init -q
    Set-Content README.md '# Probe repo'
    $env:PROBE_RUN = $cell
    $env:PROBE_OUT = $out
    $env:PROBE_DENY = '0'
    Write-Host 'IN CLAUDE: it starts in plan mode. Paste the prompt (Ctrl+V), send it, wait for the reply, then type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot\probes\decidinator\probe-plugin" --permission-mode plan
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY -ErrorAction SilentlyContinue
}
node "$repoRoot\probes\decidinator\collect.js" $cell $out
$hooks = "$repoRoot\probes\evidence\decidinator-probe-$cell-hooks.jsonl"
$plan = (Select-String -Path $hooks -Pattern '"permission_mode":"plan"' | Measure-Object).Count
$other = (Select-String -Path $hooks -Pattern '"permission_mode":"(auto|default|acceptEdits)"' | Measure-Object).Count
$agent = (Select-String -Path $hooks -Pattern '"tool_name":"Agent"' | Measure-Object).Count
"Plan-mode records: $plan (need 1 or more). Other-mode records: $other (need 0). Agent records: $agent (need 2 or more)."
if ($plan -ge 1 -and $other -eq 0 -and $agent -ge 2) { Write-Host "VALID: $cell" -ForegroundColor Green } else { Write-Host "INVALID: $cell. Paste this block again." -ForegroundColor Red }
```

### Cell 3: interactive-deny-normal

```powershell
$repoRoot = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$cell = 'interactive-deny-normal'
$base = Join-Path $env:TEMP "decidinator-probe\$cell"
Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$base\repo" | Out-Null
$out = "$base\out-" + (Get-Date -Format 'yyyyMMddHHmmss')
$prompt = node "$repoRoot\probes\decidinator\run-headless.js" --prompt deny
if ($LASTEXITCODE -ne 0 -or -not $prompt) { throw 'could not get the prompt; check $repoRoot' }
$prompt | Set-Clipboard
Push-Location "$base\repo"
try {
    git init -q
    Set-Content README.md '# Probe repo'
    $env:PROBE_RUN = $cell
    $env:PROBE_OUT = $out
    $env:PROBE_DENY = '1'
    Write-Host 'IN CLAUDE: paste the prompt (Ctrl+V), send it. If an AskUserQuestion dialog appears, note it and pick any option. When Claude has replied, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot\probes\decidinator\probe-plugin" --permission-mode default
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY -ErrorAction SilentlyContinue
}
node "$repoRoot\probes\decidinator\collect.js" $cell $out
$hooks = "$repoRoot\probes\evidence\decidinator-probe-$cell-hooks.jsonl"
$read = (Select-String -Path $hooks -Pattern '"tool_name":"Read"' | Measure-Object).Count
$ask = (Select-String -Path $hooks -Pattern '"tool_name":"AskUserQuestion"' | Measure-Object).Count
$research = (Select-String -Path $hooks -Pattern '"tool_name":"WebFetch"' | Measure-Object).Count
"Read records: $read (need 1 or more). AskUserQuestion records: $ask (informational). WebFetch records: $research (need 0; more means the research prompt was pasted by mistake)."
if ($read -ge 1 -and $research -eq 0) { Write-Host "VALID: $cell" -ForegroundColor Green } else { Write-Host "INVALID: $cell. Paste this block again." -ForegroundColor Red }
```

### Cell 4: interactive-deny-plan

```powershell
$repoRoot = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
$cell = 'interactive-deny-plan'
$base = Join-Path $env:TEMP "decidinator-probe\$cell"
Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$base\repo" | Out-Null
$out = "$base\out-" + (Get-Date -Format 'yyyyMMddHHmmss')
$prompt = node "$repoRoot\probes\decidinator\run-headless.js" --prompt deny
if ($LASTEXITCODE -ne 0 -or -not $prompt) { throw 'could not get the prompt; check $repoRoot' }
$prompt | Set-Clipboard
Push-Location "$base\repo"
try {
    git init -q
    Set-Content README.md '# Probe repo'
    $env:PROBE_RUN = $cell
    $env:PROBE_OUT = $out
    $env:PROBE_DENY = '1'
    Write-Host 'IN CLAUDE: it starts in plan mode. Paste the prompt (Ctrl+V), send it. If an AskUserQuestion dialog appears, note it and pick any option. When Claude has replied, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot\probes\decidinator\probe-plugin" --permission-mode plan
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY -ErrorAction SilentlyContinue
}
node "$repoRoot\probes\decidinator\collect.js" $cell $out
$hooks = "$repoRoot\probes\evidence\decidinator-probe-$cell-hooks.jsonl"
$plan = (Select-String -Path $hooks -Pattern '"permission_mode":"plan"' | Measure-Object).Count
$other = (Select-String -Path $hooks -Pattern '"permission_mode":"(auto|default|acceptEdits)"' | Measure-Object).Count
$read = (Select-String -Path $hooks -Pattern '"tool_name":"Read"' | Measure-Object).Count
$ask = (Select-String -Path $hooks -Pattern '"tool_name":"AskUserQuestion"' | Measure-Object).Count
$research = (Select-String -Path $hooks -Pattern '"tool_name":"WebFetch"' | Measure-Object).Count
"Plan-mode records: $plan (need 1 or more). Other-mode records: $other (need 0). Read records: $read (need 1 or more). AskUserQuestion records: $ask (informational). WebFetch records: $research (need 0; more means the research prompt was pasted by mistake)."
if ($plan -ge 1 -and $other -eq 0 -and $read -ge 1 -and $research -eq 0) { Write-Host "VALID: $cell" -ForegroundColor Green } else { Write-Host "INVALID: $cell. Paste this block again." -ForegroundColor Red }
```

The "normal" cells (1 and 3) are launched with `--permission-mode default`, but earlier runs recorded
`permission_mode: auto` in their hook data because this login's default resolves to auto. That is
expected, so those two cells have no mode check.

## After the interactive cells

From the repo root, run `node probes/decidinator/analyze.js`. Then, in a new Claude Code session, finalize
`docs/decidinator/decidinator-verification.md` from the regenerated
`probes/evidence/decidinator-verification-results.json`: fill in the interactive columns and item 4's
detection method, and add the permission prompts you noted to item 1.

## Other setups (item 6)

On a Bedrock or Pro-plan setup, run `node probes/decidinator/run-headless.js model` there. Before
running it on the next setup, rename the three `decidinator-probe-model-*` evidence files to
`decidinator-probe-model-<setup>-*`. Then rerun the analyzer.
