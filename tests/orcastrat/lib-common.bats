setup() {
  load test_helper
  LIB_COMMON="$REPO_ROOT/plugins/orcastrat/scripts/lib/common"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  mkdir -p "$BATS_TEST_TMPDIR/empty-bin"
}

@test "print_path prints the cygpath -m form when cygpath is on PATH" {
  run env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/c/Users/me/file.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [/c/Users/me/file.txt]" ]
}

@test "print_path passes a path with spaces to cygpath as one argument" {
  run env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/c/Users/me/some dir/file.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [/c/Users/me/some dir/file.txt]" ]
}

@test "print_path prints the path unchanged when cygpath is not on PATH" {
  run env PATH="$BATS_TEST_TMPDIR/empty-bin" "$BASH" -c 'source "$1"; print_path "$2"' _ "$LIB_COMMON" "/tmp/some dir/file.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "/tmp/some dir/file.txt" ]
}
