#!/usr/bin/env bash
#
# Hearth · 手动部署 site/ 到 gh-pages 分支（备用方案）
#
# 用法:
#   bash scripts/deploy-pages.sh                      # 自动从 git remote 推断 repo URL
#   REPO_URL=https://github.com/x/y bash scripts/deploy-pages.sh   # 显式覆盖
#   BRANCH=v0.1 bash scripts/deploy-pages.sh          # 链接里指向哪个源 branch
#
# 工作流:
#   1. 拷 site/ 到 .pages-tmp/
#   2. 把 config.js 里的 REPO_URL/BRANCH 替换为真值
#   3. 在 .pages-tmp/ 内做 git init → push --force gh-pages
#   4. 清理 .pages-tmp/
#
# 当 GitHub Actions 不可用、或要先在某个 fork 上预览时使用。
#
set -euo pipefail

# ---- detect repo ----
GIT_ORIGIN=$(git config --get remote.origin.url 2>/dev/null || true)
if [[ -z "${REPO_URL:-}" ]] && [[ -n "${GIT_ORIGIN}" ]]; then
  # transform git@github.com:user/repo.git → https://github.com/user/repo
  REPO_URL=$(echo "${GIT_ORIGIN}" \
    | sed -E 's|git@github.com:|https://github.com/|' \
    | sed -E 's|\.git$||')
fi
if [[ -z "${REPO_URL:-}" ]]; then
  echo "× cannot determine REPO_URL — pass it explicitly or set git remote origin" >&2
  exit 1
fi

BRANCH="${BRANCH:-main}"
TARGET_BRANCH="${TARGET_BRANCH:-gh-pages}"
TMP=".pages-tmp"

echo "🔥 Hearth deploy → ${REPO_URL} (gh-pages branch)"
echo "   source branch for doc links: ${BRANCH}"
echo

# ---- prepare ----
rm -rf "${TMP}"
cp -r site "${TMP}"

# Inject real REPO_URL into config.js
sed -i.bak \
  -e "s|https://github.com/telagod/hearth-ext|${REPO_URL}|" \
  -e "s|const BRANCH = 'main';|const BRANCH = '${BRANCH}';|" \
  "${TMP}/config.js"
rm -f "${TMP}/config.js.bak"
echo "✓ rewrote ${TMP}/config.js"

# ---- commit + push ----
cd "${TMP}"
git init -q -b "${TARGET_BRANCH}"
git config user.email "deploy@hearth.local"
git config user.name "hearth-deploy"
git add -A
git commit -q -m "deploy site $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "✓ committed in ${TMP}/"

git remote add origin "${REPO_URL}"
echo "→ pushing to ${TARGET_BRANCH} (force)…"
git push -q --force origin "${TARGET_BRANCH}"
cd ..

# ---- cleanup ----
rm -rf "${TMP}"

echo
echo "✓ deployed."
echo
echo "Next:"
echo "  - GitHub repo → Settings → Pages → Source = ${TARGET_BRANCH}"
echo "  - URL will be https://<user>.github.io/<repo>/"
echo "  - Or set a CNAME by adding site/CNAME and re-running."
