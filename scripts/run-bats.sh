#!/usr/bin/env bash
# Runs the orcastrat bats tests (D02). Dev tooling only: the plugin never runs it.
# With no arguments, runs every test under tests/orcastrat. Any arguments are
# passed to bats unchanged, for example: bash scripts/run-bats.sh tests/orcastrat/verify.bats
set -euo pipefail

BATS_URL='https://github.com/bats-core/bats-core'
BATS_TAG='v1.14.0'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bats_dir="$repo_root/.tools/bats-core"

if [ ! -d "$bats_dir" ]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$BATS_TAG" "$BATS_URL" "$bats_dir"
fi

cd "$repo_root"
if [ "$#" -eq 0 ]; then
  exec "$bats_dir/bin/bats" -r tests/orcastrat
fi
exec "$bats_dir/bin/bats" "$@"
