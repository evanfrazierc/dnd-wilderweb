import { useCallback, useEffect, useState } from "react";

// Keeps the active top-level page in the URL (/timeline, /settlements, ...) instead of only in
// React state, so the six top-level views are linkable, bookmarkable, and back/forward work --
// no router dependency needed, since server/index.js already falls back to index.html for any
// non-/api path. An unrecognized or root path (a stale bookmark, or "/") silently renders
// `defaultKey` without rewriting the URL; navigating from the sidebar always pushes an explicit
// path so every page gets its own real URL once visited.
export function usePageRoute(pageKeys, defaultKey) {
  function keyFromPath(pathname) {
    const segment = pathname.replace(/^\/+/, "").split("/")[0];
    return pageKeys.includes(segment) ? segment : defaultKey;
  }

  const [page, setPage] = useState(() => keyFromPath(window.location.pathname));

  useEffect(() => {
    function onPopState() {
      setPage(keyFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((key) => {
    const path = `/${key}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setPage(key);
  }, []);

  return [page, navigate];
}
