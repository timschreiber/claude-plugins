setup() {
  load test_helper
}

# portability_violations <plugin-dir>: prints one line per D11 violation under
# <plugin-dir>, and nothing when there are none. It lists every file named
# *.ps1, then every line containing pwsh or powershell, in any case, in a file
# under <plugin-dir>/scripts or <plugin-dir>/hooks. A missing scripts/ or
# hooks/ directory is skipped.
portability_violations() {
  local root="$1" d
  find "$root" -type f -name '*.ps1'
  for d in scripts hooks; do
    if [ -d "$root/$d" ]; then
      grep -rniE 'pwsh|powershell' "$root/$d" || true
    fi
  done
}

@test "plugins/orcastrat has no .ps1 file and no pwsh or powershell in scripts or hooks" {
  run portability_violations "$REPO_ROOT/plugins/orcastrat"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "a .ps1 file anywhere in the plugin is a violation" {
  mkdir -p "$BATS_TEST_TMPDIR/plugin/skills/run"
  printf 'Write-Host hi\n' > "$BATS_TEST_TMPDIR/plugin/skills/run/helper.ps1"
  run portability_violations "$BATS_TEST_TMPDIR/plugin"
  [ "$status" -eq 0 ]
  [[ "$output" == *"skills/run/helper.ps1"* ]]
}

@test "mixed-case pwsh in scripts is a violation" {
  mkdir -p "$BATS_TEST_TMPDIR/plugin/scripts"
  printf '#!/usr/bin/env bash\nPwSh -NoProfile -File x\n' > "$BATS_TEST_TMPDIR/plugin/scripts/tool"
  run portability_violations "$BATS_TEST_TMPDIR/plugin"
  [ "$status" -eq 0 ]
  [[ "$output" == *"scripts/tool:2:"* ]]
}

@test "powershell in hooks is a violation" {
  mkdir -p "$BATS_TEST_TMPDIR/plugin/hooks"
  printf '#!/usr/bin/env bash\nPowerShell -Command Get-Date\n' > "$BATS_TEST_TMPDIR/plugin/hooks/stop-guard"
  run portability_violations "$BATS_TEST_TMPDIR/plugin"
  [ "$status" -eq 0 ]
  [[ "$output" == *"hooks/stop-guard:2:"* ]]
}

@test "pwsh in skill prose is not a violation" {
  mkdir -p "$BATS_TEST_TMPDIR/plugin/skills/run"
  printf 'Call it explicitly: pwsh -NoProfile -File scripts/verify.ps1\n' > "$BATS_TEST_TMPDIR/plugin/skills/run/SKILL.md"
  run portability_violations "$BATS_TEST_TMPDIR/plugin"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "missing scripts and hooks directories are not violations" {
  mkdir -p "$BATS_TEST_TMPDIR/plugin"
  printf '# Plugin\n' > "$BATS_TEST_TMPDIR/plugin/README.md"
  run portability_violations "$BATS_TEST_TMPDIR/plugin"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
