# shellcheck shell=bash
# Shared helpers for the orcastrat bats tests. Load with: load test_helper

# Absolute path of the repository root.
REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

# make_fixture_repo <dir>: creates a git repository at <dir> on branch main,
# with a repository-local commit identity and one commit that adds README.md.
make_fixture_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init --quiet
  git -C "$dir" symbolic-ref HEAD refs/heads/main
  git -C "$dir" config user.name 'Orcastrat Test'
  git -C "$dir" config user.email 'orcastrat-test@example.invalid'
  git -C "$dir" config commit.gpgsign false
  printf 'fixture\n' > "$dir/README.md"
  git -C "$dir" add README.md
  git -C "$dir" commit --quiet -m 'Initial commit'
}

# make_cygpath_stub <dir>: writes an executable <dir>/cygpath that prints
# "cygpath-stub" followed by each argument it received in square brackets,
# on one line. Put <dir> first on PATH to use it.
make_cygpath_stub() {
  local dir="$1"
  mkdir -p "$dir"
  cat > "$dir/cygpath" <<'STUB'
#!/usr/bin/env bash
out='cygpath-stub'
for arg in "$@"; do
  out="$out [$arg]"
done
printf '%s\n' "$out"
STUB
  chmod +x "$dir/cygpath"
}
