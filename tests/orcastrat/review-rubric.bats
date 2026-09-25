setup() {
  load test_helper
  AGENTS="$REPO_ROOT/plugins/orcastrat/agents"
  CANONICAL="$REPO_ROOT/plugins/orcastrat/reference/review-rubric.md"
}

# The agents that score review findings (D21). Each carries a verbatim copy
# of the canonical rubric block, between the rubric markers.
SCORING_AGENTS='reviewer milestone-reviewer plan-reviewer validator'

# rubric_block <file>: prints the lines of <file> strictly between the line
# <!-- rubric:start --> and the line <!-- rubric:end -->, ignoring carriage
# returns. Prints nothing when the file or the markers are missing.
rubric_block() {
  [ -f "$1" ] || return 0
  tr -d '\r' < "$1" | awk '
    $0 == "<!-- rubric:end -->" { inside = 0 }
    inside { print }
    $0 == "<!-- rubric:start -->" { inside = 1 }
  '
}

# marker_count <file> <marker>: prints how many lines of <file> equal
# <marker>, ignoring carriage returns.
marker_count() {
  tr -d '\r' < "$1" | grep -cxF -- "$2"
}

@test "rubric_block prints only the lines between the markers" {
  printf 'before\r\n<!-- rubric:start -->\r\none\r\n\r\ntwo\r\n<!-- rubric:end -->\r\nafter\r\n' > "$BATS_TEST_TMPDIR/sample.md"
  run rubric_block "$BATS_TEST_TMPDIR/sample.md"
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'one\n\ntwo')" ]
}

@test "the canonical rubric has the five anchors in the spec's wording" {
  local line missing=''
  rubric_block "$CANONICAL" > "$BATS_TEST_TMPDIR/block"
  cat > "$BATS_TEST_TMPDIR/anchors" <<'EOF'
- **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
- **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
- **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
- **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
- **100:** certain. The evidence directly confirms it, and it will be hit.
EOF
  while IFS= read -r line; do
    grep -qxF -- "$line" "$BATS_TEST_TMPDIR/block" || missing="$missing|$line"
  done < "$BATS_TEST_TMPDIR/anchors"
  echo "missing:$missing"
  [ -z "$missing" ]
}

@test "every scoring agent carries the canonical rubric verbatim" {
  local bad='' name canonical
  canonical="$(rubric_block "$CANONICAL")"
  [ -n "$canonical" ]
  for name in $SCORING_AGENTS; do
    [ "$(rubric_block "$AGENTS/$name.md")" = "$canonical" ] || bad="$bad $name"
  done
  echo "rubric differs in:$bad"
  [ -z "$bad" ]
}

@test "every scoring agent has exactly one rubric block" {
  local bad='' name
  for name in $SCORING_AGENTS; do
    if [ ! -f "$AGENTS/$name.md" ]; then
      bad="$bad $name(missing)"
      continue
    fi
    [ "$(marker_count "$AGENTS/$name.md" '<!-- rubric:start -->')" = 1 ] || bad="$bad $name(start)"
    [ "$(marker_count "$AGENTS/$name.md" '<!-- rubric:end -->')" = 1 ] || bad="$bad $name(end)"
  done
  echo "wrong markers:$bad"
  [ -z "$bad" ]
}

@test "a copy that differs by one character is caught" {
  [ -n "$(rubric_block "$CANONICAL")" ]
  sed 's/it will be hit\./it will be hit!/' "$CANONICAL" > "$BATS_TEST_TMPDIR/changed.md"
  [ "$(rubric_block "$BATS_TEST_TMPDIR/changed.md")" != "$(rubric_block "$CANONICAL")" ]
}
