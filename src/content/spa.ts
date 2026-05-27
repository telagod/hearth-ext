/**
 * SPA navigation watcher — monkey-patches history API once and fans out to
 * subscribers, so the float bar / recall orb / deep-read probe all see the
 * same "URL just changed" event.
 *
 * Handles: pushState, replaceState, popstate, hashchange.
 */

const subs = new Set<(href: string) => void>();
let installed = false;
let lastHref = location.href;

export function onSpaNav(fn: (href: string) => void): () => void {
  install();
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function install() {
  if (installed) return;
  installed = true;

  const fire = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    subs.forEach((f) => { try { f(lastHref); } catch (e) { console.warn('[hearth/spa] sub failed', e); } });
  };

  // Monkey-patch pushState / replaceState. Once per page.
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args as Parameters<typeof history.pushState>);
    queueMicrotask(fire);
    return r;
  };
  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args as Parameters<typeof history.replaceState>);
    queueMicrotask(fire);
    return r;
  };
  window.addEventListener('popstate', fire);
  window.addEventListener('hashchange', fire);
}
