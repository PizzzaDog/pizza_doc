#!/usr/bin/env bash
# Template pre-commit hook. Install with:
#   cp templates/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Runs `pd validate` for every space whose files are touched by the
# commit. Blocks on errors; warnings print but don't fail (switch to
# --strict-warnings when your team is ready to enforce them).

set -euo pipefail

changed=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^spaces/[^/]+/' || true)
if [ -z "$changed" ]; then
  exit 0
fi

spaces=$(echo "$changed" | awk -F/ '{print $2}' | sort -u)

failed=0
for id in $spaces; do
  if [ -d "spaces/${id}" ] && [ -f "spaces/${id}/space.yaml" ]; then
    echo "→ pd validate spaces/${id}"
    if ! pnpm pd validate "spaces/${id}"; then
      failed=1
    fi
  fi
done

exit $failed
