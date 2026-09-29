setup() {
  load test_helper
}

@test "REPO_ROOT is the repository root" {
  [ -f "$REPO_ROOT/.claude-plugin/marketplace.json" ]
  [ -d "$REPO_ROOT/plugins/orcastrat" ]
}

@test "make_fixture_repo creates a clean repository on main with one commit" {
  make_fixture_repo "$BATS_TEST_TMPDIR/repo"
  run git -C "$BATS_TEST_TMPDIR/repo" rev-list --count HEAD
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
  run git -C "$BATS_TEST_TMPDIR/repo" symbolic-ref --short HEAD
  [ "$status" -eq 0 ]
  [ "$output" = "main" ]
  run git -C "$BATS_TEST_TMPDIR/repo" status --porcelain
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "make_fixture_repo commits without a global git identity" {
  mkdir -p "$BATS_TEST_TMPDIR/home"
  HOME="$BATS_TEST_TMPDIR/home" XDG_CONFIG_HOME="$BATS_TEST_TMPDIR/home/.config" GIT_CONFIG_NOSYSTEM=1 make_fixture_repo "$BATS_TEST_TMPDIR/repo"
  run git -C "$BATS_TEST_TMPDIR/repo" log -1 --format=%ae
  [ "$status" -eq 0 ]
  [ "$output" = "orcastrat-test@example.invalid" ]
}

@test "make_cygpath_stub prints each argument in square brackets" {
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  run "$BATS_TEST_TMPDIR/stub-bin/cygpath" -m "/c/Users/me/some dir/file.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [/c/Users/me/some dir/file.txt]" ]
}
