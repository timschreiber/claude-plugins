setup() {
  load test_helper
  SKILLS="$REPO_ROOT/plugins/orcastrat/skills"
  REFERENCE="$REPO_ROOT/plugins/orcastrat/reference"
}

# field <file> <key>: prints the value of the frontmatter line "<key>: <value>"
# of <file>, ignoring carriage returns. Prints nothing when the file or the
# line is missing. Lines after the frontmatter's closing --- are never read.
field() {
  [ -f "$1" ] || return 0
  tr -d '\r' < "$1" | awk -v key="$2: " '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    inside && index($0, key) == 1 { print substr($0, length(key) + 1); exit }
  '
}

@test "field reads a frontmatter key and ignores the body" {
  printf -- '---\r\nname: sample\r\nmodel: opus\r\n---\r\n\r\nmodel: haiku\r\n' > "$BATS_TEST_TMPDIR/SKILL.md"
  [ "$(field "$BATS_TEST_TMPDIR/SKILL.md" model)" = 'opus' ]
  [ -z "$(field "$BATS_TEST_TMPDIR/SKILL.md" effort)" ]
}

@test "no skill pins a model" {
  local bad='' count=0 f
  for f in "$SKILLS"/*/SKILL.md; do
    count=$((count + 1))
    [ -z "$(field "$f" model)" ] || bad="$bad $(dirname "$f")"
  done
  echo "model pinned in:$bad"
  [ "$count" -ge 3 ]
  [ -z "$bad" ]
}

@test "every skill is invoked by name only" {
  local bad='' f
  for f in "$SKILLS"/*/SKILL.md; do
    [ "$(field "$f" disable-model-invocation)" = 'true' ] || bad="$bad $(dirname "$f")"
  done
  echo "not name-only:$bad"
  [ -z "$bad" ]
}

@test "no skill or reference file has a command substitution" {
  local bad='' f
  for f in "$SKILLS"/*/SKILL.md "$REFERENCE"/*.md; do
    if grep -qF '$(' "$f"; then
      bad="$bad ${f#$REPO_ROOT/}"
    fi
  done
  echo "command substitution in:$bad"
  [ -z "$bad" ]
}
