#!/usr/bin/env bash
# Offline tests for cardfile-jira's markdown and Jira document (ADF) converters.
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/cardfile-jira"
fail() { echo "FAIL: $*" >&2; exit 1; }

md='# Plan

Some **bold**, *italic*, `code`, ~~gone~~ and a [link](https://example.com).
Second line.

- one
- two
  - nested

1. first
2. second

> quoted

```sh
echo hi
```

| a | b |
| --- | --- |
| 1 | 2 |

---'

adf="$(printf '%s' "$md" | "$script" md-to-adf)"
jq -e '.type == "doc" and .version == 1' <<<"$adf" >/dev/null || fail "not a doc"
jq -e '[.content[].type] == ["heading","paragraph","bulletList","orderedList","blockquote","codeBlock","table","rule"]' <<<"$adf" >/dev/null \
  || fail "block types: $(jq -c '[.content[].type]' <<<"$adf")"
jq -e '.content[1].content | map(select(.type == "hardBreak")) | length == 1' <<<"$adf" >/dev/null || fail "line break"
jq -e '[.content[1].content[] | .marks[]?.type] | index("strong") and index("em") and index("code") and index("strike") and index("link")' <<<"$adf" >/dev/null \
  || fail "inline marks"
jq -e '.content[2].content[1].content[1].type == "bulletList"' <<<"$adf" >/dev/null || fail "nested list"
jq -e '.content[5].attrs.language == "sh"' <<<"$adf" >/dev/null || fail "code language"

# Round trip: what the drawer shows is what a save sends back.
back="$(jq -c . <<<"$adf" | "$script" adf-to-md | jq -r .markdown)"
[[ "$back" == "$md" ]] || { diff <(printf '%s\n' "$md") <(printf '%s\n' "$back") >&2; fail "round trip"; }
jq -e '.lossy == []' <<<"$(jq -c . <<<"$adf" | "$script" adf-to-md)" >/dev/null || fail "plain document reported lossy"

# Formatting the writer can't produce is named, so the drawer can warn before a save.
rich='{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"hi","marks":[{"type":"underline"}]},{"type":"mention","attrs":{"text":"@Sam"}}]},{"type":"mediaSingle","content":[{"type":"media"}]},{"type":"panel","content":[{"type":"paragraph","content":[{"type":"text","text":"note"}]}]}]}'
out="$("$script" adf-to-md <<<"$rich")"
jq -e '.lossy == ["underlines","mentions","images and files","panels"]' <<<"$out" >/dev/null || fail "lossy: $(jq -c .lossy <<<"$out")"
jq -e '.markdown == "hi@Sam\n\n*(attachment)*\n\n> note"' <<<"$out" >/dev/null || fail "rich markdown: $(jq -c .markdown <<<"$out")"

# Bad keys are refused before any settings or network.
if "$script" show nope 2>/dev/null; then fail "accepted a bad key"; fi

echo "cardfile-jira: ok"
