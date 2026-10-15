#!/usr/bin/env bash
#
# Builds the body of a GitHub release from the commits since the previous
# release tag, grouped by conventional-commit type.
#
#   GITHUB_REF_NAME    the tag being released (set by Actions)
#   GITHUB_REPOSITORY  used to link the compare view (set by Actions)
#   INSTALLER_DIR      optional directory of built installers to list
#
set -euo pipefail

tag="${GITHUB_REF_NAME:-$(git describe --tags --abbrev=0)}"
previous="$(git describe --tags --abbrev=0 "${tag}^" 2>/dev/null || true)"

if [ -n "$previous" ]; then
  range="${previous}..${tag}"
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    compare="[\`${previous}...${tag}\`](https://github.com/${GITHUB_REPOSITORY}/compare/${previous}...${tag})"
  else
    compare="\`${previous}\` → \`${tag}\`"
  fi
else
  # First release: keep it to a readable window instead of the whole history.
  range="-n 60 ${tag}"
  compare="\`${tag}\`"
fi

groups=(feat fix perf refactor docs chore other)
declare -A titles=(
  [feat]="✨ 新功能"
  [fix]="🐛 修复"
  [perf]="⚡ 性能"
  [refactor]="♻️ 重构"
  [docs]="📝 文档"
  [chore]="🔧 维护"
  [other]="其它变更"
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for group in "${groups[@]}"; do : > "$work/$group"; done

total=0
while IFS= read -r -d $'\x1e' record; do
  # git appends a newline after each formatted commit, so every record but the
  # first starts with one.
  record="${record#$'\n'}"
  [ -n "$record" ] || continue

  subject="${record%%$'\x1f'*}"
  body="${record#*$'\x1f'}"
  [ -n "$subject" ] || continue

  type="other"
  if [[ "$subject" =~ ^([A-Za-z]+)(\([^\)]*\))?!?:[[:space:]]+ ]]; then
    case "${BASH_REMATCH[1],,}" in
      feat | feature) type=feat ;;
      fix | bugfix | hotfix) type=fix ;;
      perf) type=perf ;;
      refactor) type=refactor ;;
      docs | doc) type=docs ;;
      chore | build | ci | test | style | revert) type=chore ;;
      *) type=other ;;
    esac
  fi

  # The opening paragraph adds context when the subject alone is terse. Commit
  # bodies are hard-wrapped, so join the first paragraph before trimming it.
  detail="$(printf '%s\n' "$body" | awk '
    /^[[:space:]]*$/ { if (out != "") exit; else next }
    { out = (out == "" ? $0 : out " " $0) }
    END { sub(/[[:space:]]+$/, "", out); print out }
  ')"
  detail="${detail#- }"
  case "$detail" in
    "Signed-off-by:"* | "Co-authored-by:"* | "Refs:"* | "Closes:"*) detail="" ;;
  esac

  if [ -n "$detail" ] && [ "$detail" != "$subject" ]; then
    [ "${#detail}" -le 140 ] || detail="${detail:0:140}…"
    printf -- '- %s\n  %s\n' "$subject" "$detail" >> "$work/$type"
  else
    printf -- '- %s\n' "$subject" >> "$work/$type"
  fi
  total=$((total + 1))
done < <(git log --no-merges --reverse --format='%s%x1f%b%x1e' $range)

echo "## 本次变更"
echo

if [ "$total" -eq 0 ]; then
  echo "自上一个版本以来没有新的提交。"
  echo
else
  for group in "${groups[@]}"; do
    if [ -s "$work/$group" ]; then
      echo "### ${titles[$group]}"
      echo
      cat "$work/$group"
      echo
    fi
  done
fi

if [ -n "${INSTALLER_DIR:-}" ] && [ -d "${INSTALLER_DIR}" ]; then
  echo "### 📦 下载"
  echo
  for file in "$INSTALLER_DIR"/*; do
    [ -e "$file" ] || continue
    case "$file" in
      *.exe) echo "- \`$(basename "$file")\` — 推荐，NSIS 安装包" ;;
      *.msi) echo "- \`$(basename "$file")\` — MSI 安装包" ;;
    esac
  done
  echo
fi

echo "---"
echo
echo "对比：${compare}（共 ${total} 个提交）"
