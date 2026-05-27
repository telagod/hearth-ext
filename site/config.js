/**
 * Site configuration — single source of truth for repo URL and brand.
 *
 * Override at deploy time by:
 *   1. Editing this file directly and committing, OR
 *   2. GH Actions workflow rewriting `REPO_URL` from `GITHUB_REPOSITORY`.
 *
 * The IIFE rewrites `[data-href="repo"]` and `[data-href="repo:DOC"]` anchors
 * to point at the configured URL, so the HTML stays static and the JS layer
 * is the only place that knows where to find the source.
 */
(function () {
  const REPO_URL = 'https://github.com/telagod/hearth-ext';   // ← edit me or let CI inject
  const BRANCH = 'main';

  function repoLink(target) {
    if (!target || target === 'repo') return REPO_URL;
    if (target.startsWith('repo:')) {
      const path = target.slice(5);
      return `${REPO_URL}/blob/${BRANCH}/${path}`;
    }
    return target;
  }

  function apply() {
    document.querySelectorAll('[data-href]').forEach((el) => {
      const target = el.getAttribute('data-href');
      const url = repoLink(target);
      el.setAttribute('href', url);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
