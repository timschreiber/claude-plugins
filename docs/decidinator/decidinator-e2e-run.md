# Decidinator: end-to-end run

These runs need a person, because AskUserQuestion does not exist in headless `claude -p` sessions (verification item 5 in `docs/decidinator/decidinator-verification.md`). Each block below sets up a fresh fixture repo (the tally project) under `%TEMP%/decidinator-e2e`, starts Claude there with `plugins/decidinator` and the WP-01 probe logger (`probes/decidinator/probe-plugin`) loaded, and afterwards checks the files and hook records with `tests/decidinator/e2e/check.js`, prints PASS or FAIL, and writes `tests/decidinator/e2e/fixtures/scenario-<n>/`. The run passes when all seven scenarios print PASS and, after pushing, the fresh-install check prints PASS.

## Before you start

- Run the blocks in a PowerShell window that is not inside a Claude Code session.
- You need Node 20+, git, and gh authenticated.
- Decidinator must not also be installed from the marketplace. Each block refuses to run if it is; to remove it, run `claude plugin uninstall decidinator@timschreiber`.
- If the repo is not at `C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins`, change the `$repoRoot` line.
- Accept the folder-trust dialog if it appears, and approve any permission prompt.
- The blocks pre-allow `WebFetch`, `WebSearch`, `gh search`, `gh repo view` and `gh api`. If Claude still asks for a permission, answer it promptly: oracle research waits for you, and a scenario can sit idle for minutes.
- A scenario may be run again at any time; each run uses a new directory.
- **The "IN CLAUDE" line each block prints is hidden once Claude's screen opens.** Read the "What you do" column below before pasting a block. The prompt is already on your clipboard; paste it with Ctrl+V.
- Scenarios 1, 2, 5 and 6 set `DECIDINATOR_MODE=ask`, so they are armed at launch and you only paste the prompt. Scenario 3 and the install check are armed by typing the command, and you must wait for Claude's confirmation before pasting the prompt.

## Scenarios

| # | What it proves | What you do |
| --- | --- | --- |
| 1 | A researchable question resolves at rung 1 without reaching you. | Already armed (ask). Paste the prompt, send, then `/exit` after the RESULT line. |
| 2 | A human-only question reaches you with researched options, and your answer is logged as user. | Already armed (ask). Paste the prompt, send, pick either option, then `/exit` after the RESULT line. |
| 3 | Sidecar mode (armed by command): a provisional answer and a sidecar entry, and the session continues. | Type `/decidinator:arm sidecar`, send, and wait for the armed confirmation. Then paste the prompt, send, and `/exit` after the RESULT line. |
| 4 | Sidecar mode set by DECIDINATOR_MODE: the question is queued and AskUserQuestion is never let through. | Already armed by the variable. Paste the prompt, send, then `/exit` after the RESULT line. |
| 5 | Scenario 1 in plan mode, with the oracle's web research working. | Already armed (ask), starts in plan mode. Paste the prompt, send; if a plan approval dialog appears, choose to keep planning. `/exit` after the RESULT line. |
| 6 | Escalation: a spec-silent question reaches rung 2 with rung 1's verdict in its prompt. | Already armed (ask). Paste the prompt, send, pick the first option if asked (two oracles run, so it takes longer), then `/exit` after the RESULT line. |
| 7 | The stakeholder round trip: export, answers filled in, import and its report. | Session 1: type `/decidinator:export docs/stakeholders.md`, send, `/exit` when it replies. Session 2 (already armed): type `/decidinator:import docs/stakeholders.md`, send, wait for the final import report with Confirmed and Changed sections, then `/exit`. |
| install | A fresh marketplace install, following only the README, arms and resolves a question. | Type `/decidinator:arm`, send, and wait for the armed confirmation. Then paste the prompt, send, and `/exit` after the RESULT line. |

## Scenarios 1 to 6

### Scenario 1: ask-researchable

Arms ask mode and sends a question that research can settle; the oracle should answer it without the question reaching you.

**In Claude:** (1) paste the prompt with Ctrl+V and send it; (2) when Claude replies with a `RESULT:` line, type `/exit`. A red "hook error" line before the oracle runs is normal.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '1'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    $env:DECIDINATOR_MODE = 'ask'
    Write-Host 'IN CLAUDE: it is already armed. Paste the prompt (Ctrl+V) and send it. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 2: ask-human-only

Arms ask mode and sends a question only a person can answer; you answer the dialog that appears.

**In Claude:** (1) paste the prompt with Ctrl+V and send it; (2) when the question dialog appears, pick either option, because the check passes whichever you pick; (3) when Claude replies with a `RESULT:` line, type `/exit`. A red "hook error" line before the oracle runs is normal.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '2'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    $env:DECIDINATOR_MODE = 'ask'
    Write-Host 'IN CLAUDE: it is already armed. Paste the prompt (Ctrl+V) and send it. When the question dialog appears, pick either option. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 3: sidecar-command

Arms sidecar mode by command; the question is answered provisionally and queued, and the session goes on.

**In Claude:** (1) type `/decidinator:arm sidecar` and send it, and wait for Claude to confirm that Decidinator is armed; (2) paste the prompt with Ctrl+V and send it; (3) when Claude replies with a `RESULT:` line, type `/exit`. No question dialog should appear.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '3'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    Remove-Item Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
    Write-Host 'IN CLAUDE: type /decidinator:arm sidecar and send. Then paste the prompt (Ctrl+V) and send it. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 4: sidecar-env

Does not arm by command; DECIDINATOR_MODE=sidecar does, and the question is queued without a dialog.

**In Claude:** (1) paste the prompt with Ctrl+V and send it; do not type an arm command; (2) when Claude replies with a `RESULT:` line, type `/exit`. No question dialog should appear.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '4'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    $env:DECIDINATOR_MODE = 'sidecar'
    Write-Host 'IN CLAUDE: do not arm; DECIDINATOR_MODE does. Paste the prompt (Ctrl+V) and send it. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 5: plan-mode

Runs scenario 1 in plan mode, so the oracle must do its web research under plan mode.

**In Claude:** (1) paste the prompt with Ctrl+V and send it; (2) if a plan approval dialog appears, choose to keep planning; (3) when Claude replies with a `RESULT:` line, type `/exit`. Claude starts in plan mode and is already armed.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '5'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    $env:DECIDINATOR_MODE = 'ask'
    Write-Host 'IN CLAUDE: it starts in plan mode and is already armed. Paste the prompt (Ctrl+V) and send it. If a plan approval dialog appears, choose to keep planning. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode plan --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 6: escalation

Arms ask mode and sends a question the spec is silent on, so rung 1 escalates to rung 2.

**In Claude:** (1) paste the prompt with Ctrl+V and send it; two oracles run, so this takes longer; (2) if a question dialog appears, pick either option; (3) when Claude replies with a `RESULT:` line, type `/exit`. Expect the red "hook error" line twice, once per rung.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '6'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = "e2e-$n"
    $env:PROBE_OUT = "$base/out"
    $env:PROBE_DENY = '0'
    $env:DECIDINATOR_CONTEXT = "e2e-$n"
    $env:DECIDINATOR_MODE = 'ask'
    Write-Host 'IN CLAUDE: it is already armed. Paste the prompt (Ctrl+V) and send it. Two oracles run, so this takes longer. If a question dialog appears, pick the first option. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

### Scenario 7: round-trip

This block runs two sessions: an export, then an import after the block fills in the answers. Q-0002's answer matches the provisional one and is confirmed with no oracle; Q-0003's differs and oracle-1 judges it changed.

**In Claude, session 1:** type `/decidinator:export docs/stakeholders.md`, send it, and `/exit` when Claude has replied. The block then fills in the answers and starts session 2.

**In Claude, session 2 (already armed):** type `/decidinator:import docs/stakeholders.md`, send it, wait until Claude shows the final import report with Confirmed and Changed sections, then type `/exit`.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = '7'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
if ((claude plugin list 2>$null | Out-String) -match 'decidinator@') { throw 'Decidinator is installed from a marketplace. Run: claude plugin uninstall decidinator@timschreiber' }
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
Push-Location "$base/repo"
try {
    $env:PROBE_RUN = 'e2e-7-export'
    $env:PROBE_OUT = "$base/out-export"
    $env:PROBE_DENY = '0'
    Remove-Item Env:DECIDINATOR_MODE, Env:DECIDINATOR_CONTEXT -ErrorAction SilentlyContinue
    Write-Host 'SESSION 1 OF 2, IN CLAUDE: type /decidinator:export docs/stakeholders.md and send. When Claude has replied, type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
    node "$repoRoot/tests/decidinator/e2e/setup.js" fill $base
    if ($LASTEXITCODE -ne 0) { throw 'docs/stakeholders.md was not exported with two blank answers. Paste this block again.' }
    $env:PROBE_RUN = 'e2e-7-import'
    $env:PROBE_OUT = "$base/out-import"
    $env:DECIDINATOR_MODE = 'ask'
    Write-Host 'SESSION 2 OF 2, IN CLAUDE: type /decidinator:import docs/stakeholders.md and send. Wait until Claude shows the final import report, with Confirmed and Changed sections, then type /exit' -ForegroundColor Yellow
    claude --plugin-dir "$repoRoot/plugins/decidinator" --plugin-dir "$repoRoot/probes/decidinator/probe-plugin" --permission-mode default --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
    Remove-Item Env:PROBE_RUN, Env:PROBE_OUT, Env:PROBE_DENY, Env:DECIDINATOR_CONTEXT, Env:DECIDINATOR_MODE -ErrorAction SilentlyContinue
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
```

## When a scenario fails

Run the block once more, because oracle research is not deterministic. If it fails again, the failing check names the part at fault. Fix it in the package that owns it (gate and dispatch check: WP-05; recorder, ladder and guard: WP-06; modes and the user-answer hook: WP-07; nudge and oracle shell allowlist: WP-08; review, confirm, export and import: WP-09), with a unit test, then run the scenario again.

| Check | Owner |
| --- | --- |
| `log-marker`, `sidecar-marker`, `one-new-decision`, `decision-question`, `sidecar-empty` (log and sidecar file checks) | WP-03 and WP-06 |
| `oracle-1-stopped`, `no-oracle-2`, `ask-intercepted`, `ask-never-shown`, `oracle-2-stopped`, `no-oracle-3`, `rung-2-dispatch`, `rung-2-has-rung-1-verdict`, `rung-1-escalated` (dispatch and Earlier verdicts) | WP-05 and WP-06 |
| `decision-oracle-unconfirmed`, `decision-rung-1`, `decision-answer-node-test`, `decision-rung-2-or-user` | WP-05 and WP-06 |
| `one-sidecar-entry`, `entry-fields`, `entry-depends-on`, `session-continued`, `decision-provisional` (sidecar entries and provisional decisions) | WP-07 |
| `decision-user`, `decision-answer-5`, `decision-no-rung`, `ask-shown-after-research` (user decisions) | WP-07 |
| `export-marker`, `export-entries`, `export-groups`, `answers-filled`, `stakeholder-decisions`, `provisionals-superseded`, `entries-imported`, `judgment-dispatched`, `report-header`, `report-confirmed`, `report-changed` (export, import and report) | WP-09 |
| `plan-mode-throughout`, `oracle-web-research` | The oracle agents, WP-04 |

## After all seven pass

Commit `tests/decidinator/e2e/fixtures/` (`git add tests/decidinator/e2e/fixtures`, then a commit such as `Decidinator: end-to-end fixtures`), then push. The "In development" wording has since been removed from `plugins/decidinator/README.md`, the root `README.md`, the decidinator entry's description in `.claude-plugin/marketplace.json`, the decidinator bullet in the root `CLAUDE.md`, and `plugins/decidinator/CLAUDE.md`.

## Fresh install check

Run this after pushing; it installs Decidinator from the marketplace and tries it in a fresh fixture repo. The install check has no probe logger, so it checks only the files (the decision log and the sidecar); commit its fixture directory too.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$n = 'install'
$base = Join-Path $env:TEMP ("decidinator-e2e/s$n-" + (Get-Date -Format 'yyyyMMddHHmmss'))
node "$repoRoot/tests/decidinator/e2e/setup.js" repo $n "$base/repo"
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
node "$repoRoot/tests/decidinator/e2e/setup.js" prompt $n | Set-Clipboard
claude plugin marketplace add timschreiber/claude-plugins
claude plugin marketplace update timschreiber
claude plugin install decidinator@timschreiber
Push-Location "$base/repo"
try {
    Remove-Item Env:DECIDINATOR_MODE, Env:DECIDINATOR_CONTEXT -ErrorAction SilentlyContinue
    Write-Host 'IN CLAUDE: type /decidinator:arm and send. Then paste the prompt (Ctrl+V) and send it. When Claude replies with a RESULT: line, type /exit' -ForegroundColor Yellow
    claude --allowedTools WebFetch WebSearch 'Bash(gh search:*)' 'Bash(gh repo view:*)' 'Bash(gh api:*)'
} finally {
    Pop-Location
}
node "$repoRoot/tests/decidinator/e2e/check.js" $n $base
Write-Host 'Before running scenarios 1 to 7 again: claude plugin uninstall decidinator@timschreiber'
```
