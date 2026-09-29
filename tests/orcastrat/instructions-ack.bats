bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/instructions-ack"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  ACK="$REPO/.git/orcastrat/instructions/ack"
  mkdir -p "$REPO/docs" "$REPO/a b"
  printf 'root rules\n' > "$REPO/CLAUDE.md"
  printf 'docs rules\n' > "$REPO/docs/CLAUDE.md"
  printf 'agent rules\r\n' > "$REPO/a b/AGENTS.md"
  cd "$REPO"
}

# run_script <args...>: runs instructions-ack with the stub cygpath first on
# PATH, keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# hash_of <file>: prints the git blob hash of <file>'s raw bytes.
hash_of() {
  git hash-object --no-filters -- "$1"
}

# line_count <file>: prints the number of lines in <file>.
line_count() {
  wc -l < "$1" | tr -d ' '
}

@test "continue writes the choice, then one hash line per file, sorted by path" {
  run_script continue docs/CLAUDE.md CLAUDE.md "a b/AGENTS.md"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  expected=$(printf '%s\n%s\n%s\n%s' \
    'choice continue' \
    "$(hash_of CLAUDE.md) CLAUDE.md" \
    "$(hash_of "a b/AGENTS.md") a b/AGENTS.md" \
    "$(hash_of docs/CLAUDE.md) docs/CLAUDE.md")
  [ "$(cat "$ACK")" = "$expected" ]
}

@test "stop writes the stop choice" {
  run_script stop CLAUDE.md
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(sed -n '1p' "$ACK")" = 'choice stop' ]
  [ "$(line_count "$ACK")" -eq 2 ]
}

@test "a file given twice is written once" {
  run_script continue CLAUDE.md CLAUDE.md
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(line_count "$ACK")" -eq 2 ]
}

@test "writing again replaces the ack" {
  run_script continue CLAUDE.md docs/CLAUDE.md
  run_script stop CLAUDE.md
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  expected=$(printf '%s\n%s' 'choice stop' "$(hash_of CLAUDE.md) CLAUDE.md")
  [ "$(cat "$ACK")" = "$expected" ]
}

@test "the hash is of the file's bytes, carriage returns included" {
  git config core.autocrlf true
  run_script continue "a b/AGENTS.md"
  [ "$(sed -n '2p' "$ACK")" = "$(hash_of "a b/AGENTS.md") a b/AGENTS.md" ]
  [ "$(hash_of "a b/AGENTS.md")" != "$(git hash-object -- "a b/AGENTS.md")" ]
}

@test "--check prints OK for the acknowledged files, in any order" {
  run_script continue CLAUDE.md docs/CLAUDE.md
  run_script --check docs/CLAUDE.md CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'OK' ]
  [ -z "$stderr" ]
}

@test "--check prints REVIEW when a file changed" {
  run_script continue CLAUDE.md docs/CLAUDE.md
  printf 'more\n' >> CLAUDE.md
  run_script --check CLAUDE.md docs/CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
}

@test "--check prints REVIEW when a file was added" {
  run_script continue CLAUDE.md
  run_script --check CLAUDE.md docs/CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
}

@test "--check adds the files the ack records, and a removed one means REVIEW" {
  run_script continue CLAUDE.md docs/CLAUDE.md
  run_script --check CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'OK' ]
  [ -z "$stderr" ]
  rm docs/CLAUDE.md
  run_script --check CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
}

@test "--check prints REVIEW when the choice was stop" {
  run_script stop CLAUDE.md
  run_script --check CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
}

@test "--check prints REVIEW when there is no ack, and writes none" {
  run_script --check CLAUDE.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
  [ ! -f "$ACK" ]
}

@test "--check prints REVIEW for a given file that doesn't exist" {
  run_script continue CLAUDE.md
  run_script --check CLAUDE.md missing.md
  [ "$status" -eq 0 ]
  [ "$output" = 'REVIEW' ]
  [ -z "$stderr" ]
}

@test "--check never changes the ack" {
  run_script continue CLAUDE.md
  saved=$(cat "$ACK")
  printf 'more\n' >> CLAUDE.md
  run_script --check CLAUDE.md docs/CLAUDE.md
  [ "$(cat "$ACK")" = "$saved" ]
}

@test "in a linked worktree the ack goes to the repository's common git dir" {
  git worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"
  printf 'tree rules\n' > "$BATS_TEST_TMPDIR/other tree/CLAUDE.md"
  cd "$BATS_TEST_TMPDIR/other tree"
  run_script continue CLAUDE.md
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ -f "$ACK" ]
}

@test "file paths in both drive-letter forms are stored as given" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  for form in -m -w; do
    p="$(cygpath "$form" "$REPO/CLAUDE.md")"
    run_script continue "$p"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [ -z "$stderr" ]
    [ "$(sed -n '2p' "$ACK")" = "$(hash_of CLAUDE.md) $p" ]
    run_script --check "$p"
    [ "$status" -eq 0 ]
    [ "$output" = 'OK' ]
  done
}

@test "exits 2 with too few arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: instructions-ack <continue|stop> <file>... | --check <file>...' ]

  run_script continue
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: instructions-ack <continue|stop> <file>... | --check <file>...' ]

  run_script --check
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: instructions-ack <continue|stop> <file>... | --check <file>...' ]
}

@test "exits 2 for an unknown choice" {
  run_script maybe CLAUDE.md
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: unknown choice: maybe' ]
  [ ! -f "$ACK" ]
}

@test "exits 2 when a file to acknowledge doesn't exist" {
  run_script continue CLAUDE.md missing.md
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: not a file: cygpath-stub [-m] [missing.md]' ]
  [ ! -f "$ACK" ]
}

@test "exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  cd "$BATS_TEST_TMPDIR/plain dir"
  printf 'x\n' > CLAUDE.md
  run_script continue CLAUDE.md
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  case "$stderr" in
    'error: not inside a git work tree: cygpath-stub [-m] ['*) ;;
    *) false ;;
  esac
}
