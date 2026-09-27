# planandtier: what makes the plan dialog withhold a plan

On 2026-09-27 the plan approval dialog withheld a tiered plan with "the plan is too large to be shown in
full — approval is withheld". That plan was 14,742 bytes, 94 lines, with a longest line of 4,496
characters. Its 8,916-byte revision (70 lines, longest 3,297) was shown. Larger plans with short lines
have been shown before. The criterion is not documented.

This run answers two questions:

1. **What triggers the withholding:** total size, the length of one line, or a long line inside a code
   fence.
2. **Whether a hook can shrink the plan before the dialog shows it.** A `PreToolUse` hook on
   `ExitPlanMode` moves a marked block out of the plan file. Does the dialog show the file as the hook
   left it? This decides whether planandtier can keep long task prompts in a sidecar file.

## The shapes

`make-dialog-shapes.js` writes these. Each varies one thing and carries the line
`Tiered execution: off`, so an installed planandtier lets it through.

| Shape | Bytes | Lines | Longest line | What it tests |
|---|---|---|---|---|
| S1 | 21,335 | 304 | 70 | Large total, short lines |
| S2 | 2,948 | 7 | 2,900 | Long line in a ```json fence, below today's shown 3,297 |
| S3 | 4,548 | 7 | 4,500 | Long line in a ```json fence, near today's withheld 4,496 |
| S4 | 4,536 | 5 | 4,500 | The same long line with no fence |
| S5 | 14,229 | 98 | 150 | About today's withheld total, with short lines |
| S6 | 4,614 | 10 | 4,500 | S3 between SIDECAR markers; the hook replaces the block |

The probe logs each plan's measured size when `ExitPlanMode` is called, so the evidence shows what the
dialog actually got, even if Claude copies a shape imperfectly.

## Where things run

| What | Where |
|---|---|
| The session | A **throwaway repo** at `%TEMP%\tier-dialog`, created by the setup. Not claude-plugins. |
| The probe | `probes/planandtier/probe-plugin`, loaded with `--plugin-dir` and `PROBE_DIALOG=1`. It never denies a plan and never adds context. |

## Setup (about 1 minute)

Open PowerShell anywhere and run this block:

```powershell
# 1. Clear the old probe log and write the shapes
$repo = 'C:\Users\timsc\Source\Repos\GitHub\timschreiber\claude-plugins'
Remove-Item "$HOME\.claude\plugins\data\planandtier-probe-inline\probe.log" -ErrorAction SilentlyContinue
node "$repo\probes\planandtier\make-dialog-shapes.js"

# 2. Note these two for the record
claude --version
$Host.UI.RawUI.WindowSize

# 3. Make a throwaway repo
$dir = "$env:TEMP\tier-dialog"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dir | Out-Null
Set-Location $dir
git init -q

# 4. Start Claude Code in plan mode with the probe in dialog mode
$env:PROBE_DIALOG = '1'
claude --permission-mode plan --plugin-dir "$repo\probes\planandtier\probe-plugin"
```

Keep the terminal window the same size for the whole run. The dialog may depend on it.

## Steps in the session

Do this once for each shape, S1 to S6, in order.

1. **Send this prompt,** with `Sx` replaced by the shape and the path taken from the setup output:
   > Replace the whole plan file with the exact content of `%TEMP%\planandtier-dialog-shapes\Sx.md` (read it and write it verbatim, changing nothing), then call ExitPlanMode.
2. **Look at the dialog.** Note whether it shows the plan or says it is too large to be shown in full.
   - For **S6**, also note which of these it shows: the line `SIDECAR-REPLACED: a hook moved this block
     to a sidecar file.`, or the long `lorem ipsum` line.
3. **Press Esc** to leave the dialog without approving, then continue with the next shape.

Exit with `/exit` after S6.

## Record

Save this as `probes/evidence/planandtier-dialog-shapes-observations.json`, with `true` or `false` in
place of each `null`:

```json
{
  "generated": "<ISO timestamp>",
  "claudeCodeVersion": "<claude --version>",
  "terminal": { "columns": 0, "rows": 0 },
  "shapes": {
    "S1": { "shown": null },
    "S2": { "shown": null },
    "S3": { "shown": null },
    "S4": { "shown": null },
    "S5": { "shown": null },
    "S6": { "shown": null, "showedReplacement": null }
  },
  "notes": ""
}
```

Then copy the probe log next to it:

```powershell
Copy-Item "$HOME\.claude\plugins\data\planandtier-probe-inline\probe.log" `
  "$repo\probes\evidence\planandtier-dialog-shapes-probe.log"
```

Tell me when both files are in place. I read the rest from the log: each plan's measured size, and for
S6, what the `PostToolUse` and `PermissionRequest` hooks received.

## If something goes wrong

- **Claude refuses to replace the plan, or changes the text:** tell it the file is a test fixture that
  must be copied verbatim. The measured sizes in the log still record what the dialog got.
- **Esc approves or rejects the plan instead of just closing:** note it in `notes` and carry on. Nothing
  runs, because no plugin acts on an approval in this setup.
- **`claude` reports that a plugin failed to load:** keep the message and stop.
