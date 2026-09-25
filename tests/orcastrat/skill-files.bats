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

# has_stripped_line <file> <text>: succeeds when <file> has a line equal to
# <text> once carriage returns and leading spaces are removed.
has_stripped_line() {
  [ -f "$1" ] || return 1
  tr -d '\r' < "$1" | sed 's/^ *//' | grep -qxF -- "$2"
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

@test "plan's validator dispatch carries the finding without its score" {
  local f="$SKILLS/plan/SKILL.md"
  has_stripped_line "$f" 'Finding: <the candidate line, without its list marker and without its leading [<score>] >'
  has_stripped_line "$f" 'Plan: <plan dir>'
  has_stripped_line "$f" 'Milestone: <ID>'
  run grep -qiE '^ *(reviewer )?score:' "$f"
  [ "$status" -ne 0 ]
}
