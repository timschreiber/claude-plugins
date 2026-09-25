bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/hooks/stop-guard"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  PROJECT="$REPO"
  MARKER="$REPO/.git/orcastrat/active-run"
  OWNER=0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a
  OTHER=9d3e1a2b-5c4f-4e6d-8a7b-1c2d3e4f5a6b
}

# write_marker <plan> <heartbeat> <blocks> <block_heartbeat> [<session>]: writes
# the active-run marker by hand, with a session= line only when given.
write_marker() {
  mkdir -p "$(dirname "$MARKER")"
  {
    printf 'plan=%s\n' "$1"
    printf 'started=1000\n'
    printf 'heartbeat=%s\n' "$2"
    printf 'blocks=%s\n' "$3"
    printf 'block_heartbeat=%s\n' "$4"
    if [ -n "${5+x}" ]; then
      printf 'session=%s\n' "$5"
    fi
  } > "$MARKER"
}

# hook_input <session id>: prints a Stop hook stdin JSON line for <session id>.
hook_input() {
  printf '{"session_id":"%s","transcript_path":"C:\\\\Users\\\\me\\\\.claude\\\\projects\\\\demo\\\\t.jsonl","cwd":"C:\\\\Users\\\\me\\\\fixture repo","hook_event_name":"Stop","stop_hook_active":false}\n' "$1"
}

# block_json <plan as printed>: prints the expected block decision JSON for <plan>.
block_json() {
  printf '{"decision":"block","reason":"An Orcastrat run is in progress for %s. Run the next script for %s and continue the run from the step it names. If you meant to pause or stop, follow run'"'"'s Pause or Stop section, which removes the marker."}\n' "$1" "$1"
}

# run_hook <stdin text>: runs stop-guard with CLAUDE_PROJECT_DIR set to PROJECT.
run_hook() {
  run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" bash "$SCRIPT" <<< "$1"
}

# make_call_stubs <dir> <log>: writes stub cat and git executables that log
# their own name to <log> and exit 0.
make_call_stubs() {
  local dir="$1" log="$2"
  mkdir -p "$dir"
  for name in cat git; do
    cat > "$dir/$name" <<STUB
#!/usr/bin/env bash
printf '%s\n' "$name" >> "$log"
exit 0
STUB
    chmod +x "$dir/$name"
  done
}

@test "no marker: exits 0 at once without reading stdin or running git" {
  make_call_stubs "$BATS_TEST_TMPDIR/call-bin" "$BATS_TEST_TMPDIR/calls"
  run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" PATH="$BATS_TEST_TMPDIR/call-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ ! -e "$BATS_TEST_TMPDIR/calls" ]

  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" PATH="$BATS_TEST_TMPDIR/call-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  grep -qx 'cat' "$BATS_TEST_TMPDIR/calls"
  ! grep -qx 'git' "$BATS_TEST_TMPDIR/calls"
}

@test "no CLAUDE_PROJECT_DIR, or an empty one, is allowed" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  run --separate-stderr env -u CLAUDE_PROJECT_DIR bash "$SCRIPT" <<< "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  run --separate-stderr env CLAUDE_PROJECT_DIR= bash "$SCRIPT" <<< "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
}

@test "the owning session is blocked with the reason naming the plan and next" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
}

@test "pretty-printed input with the session_id on its own line is read" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  local input
  input=$(printf '{\n  "session_id": "%s",\n  "hook_event_name": "Stop"\n}\n' "$OWNER")
  run_hook "$input"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
}

@test "stop_hook_active true doesn't change the decision" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  local input
  input=$(hook_input "$OWNER")
  input=${input//\"stop_hook_active\":false/\"stop_hook_active\":true}
  run_hook "$input"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
}

@test "a different session in the same checkout is allowed and the marker is unchanged" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  local before
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OTHER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "empty stdin is allowed and the marker is unchanged" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  local before
  before=$(cat "$MARKER")
  run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" bash "$SCRIPT" < /dev/null
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "stdin that is not JSON is allowed and the marker is unchanged" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  local before
  before=$(cat "$MARKER")
  for input in "session_id=$OWNER" "\"session_id\":\"$OWNER\"" "not json"; do
    run_hook "$input"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [ -z "$stderr" ]
  done
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "JSON without a session_id is allowed" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  run_hook '{"hook_event_name":"Stop","stop_hook_active":false}'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
}

@test "a marker without a session line is allowed" {
  write_marker "plans/my plan" 5000 0 ''
  local before
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "a marker with an empty plan is allowed" {
  write_marker '' 5000 0 '' "$OWNER"
  local before
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "an unreadable marker is allowed" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  chmod 000 "$MARKER"
  if [ -r "$MARKER" ]; then
    chmod 644 "$MARKER"
    skip "the marker stays readable here"
  fi
  run_hook "$(hook_input "$OWNER")"
  chmod 644 "$MARKER"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "marker lines are read by key, in any order" {
  mkdir -p "$(dirname "$MARKER")"
  {
    printf 'session=%s\n' "$OWNER"
    printf 'block_heartbeat=\n'
    printf 'blocks=0\n'
    printf 'heartbeat=5000\n'
    printf 'started=1000\n'
    printf 'plan=plans/my plan\n'
  } > "$MARKER"
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
}

@test "the plan path in the reason goes through print_path and is escaped for JSON" {
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  write_marker 'plans\my "q" plan' 5000 0 '' "$OWNER"
  run --separate-stderr env CLAUDE_PROJECT_DIR="$PROJECT" PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" <<< "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = '{"decision":"block","reason":"An Orcastrat run is in progress for cygpath-stub [-m] [plans\\my \"q\" plan]. Run the next script for cygpath-stub [-m] [plans\\my \"q\" plan] and continue the run from the step it names. If you meant to pause or stop, follow run'"'"'s Pause or Stop section, which removes the marker."}' ]
}

@test "a block counts itself and records the heartbeat" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
  [ "$(sed -n '1p' "$MARKER")" = "plan=plans/my plan" ]
  [ "$(sed -n '2p' "$MARKER")" = "started=1000" ]
  [ "$(sed -n '3p' "$MARKER")" = "heartbeat=5000" ]
  [ "$(sed -n '4p' "$MARKER")" = "blocks=1" ]
  [ "$(sed -n '5p' "$MARKER")" = "block_heartbeat=5000" ]
  [ "$(sed -n '6p' "$MARKER")" = "session=$OWNER" ]
  [ ! -e "$MARKER.tmp" ]
}

@test "three stops in a row with no heartbeat change are blocked and the fourth is allowed" {
  write_marker "plans/my plan" 5000 0 '' "$OWNER"
  for i in 1 2 3; do
    run_hook "$(hook_input "$OWNER")"
    [ "$status" -eq 0 ]
    [ "$output" = "$(block_json "plans/my plan")" ]
    [ -z "$stderr" ]
  done
  [ "$(sed -n '4p' "$MARKER")" = "blocks=3" ]
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ ! -e "$MARKER" ]
  [ ! -e "$MARKER.tmp" ]
  [ "$(wc -l < "$MARKER.released")" -eq 1 ]
  grep -qE '^released [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z after 3 blocked stops with no heartbeat change; plan plans/my plan$' "$MARKER.released"
}

@test "the stop after a release is allowed and recreates no marker" {
  write_marker "plans/my plan" 5000 3 5000 "$OWNER"
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ ! -e "$MARKER" ]
  [ "$(wc -l < "$MARKER.released")" -eq 1 ]
}

@test "a heartbeat change since the last block restarts the count" {
  write_marker "plans/my plan" 6000 3 5000 "$OWNER"
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
  [ "$(sed -n '3p' "$MARKER")" = "heartbeat=6000" ]
  [ "$(sed -n '4p' "$MARKER")" = "blocks=1" ]
  [ "$(sed -n '5p' "$MARKER")" = "block_heartbeat=6000" ]
}

@test "a heartbeat or block count that isn't a whole number is allowed and leaves the marker unchanged" {
  local before
  write_marker "plans/my plan" '' 0 '' "$OWNER"
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]

  write_marker "plans/my plan" abc 0 '' "$OWNER"
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]

  write_marker "plans/my plan" -5 0 '' "$OWNER"
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]

  write_marker "plans/my plan" 5000 '' '' "$OWNER"
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]

  write_marker "plans/my plan" 5000 x '' "$OWNER"
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
}

@test "a failed marker write is allowed and leaves the marker unchanged" {
  write_marker "plans/my plan" 5000 1 5000 "$OWNER"
  mkdir "$MARKER.tmp"
  local before
  before=$(cat "$MARKER")
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$MARKER")" = "$before" ]
  [ -d "$MARKER.tmp" ]
}

@test "a different session leaves the block count as it was" {
  write_marker "plans/my plan" 5000 2 5000 "$OWNER"
  run_hook "$(hook_input "$OTHER")"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(sed -n '4p' "$MARKER")" = "blocks=2" ]
  run_hook "$(hook_input "$OWNER")"
  [ "$status" -eq 0 ]
  [ "$output" = "$(block_json "plans/my plan")" ]
  [ -z "$stderr" ]
  [ "$(sed -n '4p' "$MARKER")" = "blocks=3" ]
}
