import { useCallback, useEffect, useRef, useState } from "react";

const empty = {
  posts: [],
  page: 1,
  hasMore: false,
  total: 0,
  loading: false,
  loadingMore: false,
  error: "",
  meta: null,
};

export default function usePagedList(loadPage, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ ...empty, loading: enabled });
  const lockRef = useRef(false);
  const pageRef = useRef(1);
  const stateRef = useRef(state);
  const loadRef = useRef(loadPage);
  stateRef.current = state;
  loadRef.current = loadPage;

  useEffect(() => {
    let cancelled = false;
    lockRef.current = false;
    if (!enabled) {
      pageRef.current = 1;
      setState({ ...empty });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true, error: "", posts: [] }));
    loadRef.current(1)
      .then((data) => {
        if (cancelled) return;
        pageRef.current = data.page || 1;
        setState({
          posts: data.posts || [],
          page: data.page || 1,
          hasMore: Boolean(data.hasMore),
          total: data.total || 0,
          loading: false,
          loadingMore: false,
          error: "",
          meta: data,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ ...empty, loading: false, error: err.message || "无法加载" });
      });
    return () => {
      cancelled = true;
    };
    // Caller passes the values that should reset the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || lockRef.current || !current.hasMore || current.loading || current.loadingMore) return;
    lockRef.current = true;
    const next = pageRef.current + 1;
    setState((prev) => ({ ...prev, loadingMore: true, error: "" }));
    loadRef.current(next)
      .then((data) => {
        pageRef.current = data.page || next;
        setState((prev) => ({
          ...prev,
          posts: [...prev.posts, ...(data.posts || [])],
          page: data.page || next,
          hasMore: Boolean(data.hasMore),
          total: data.total ?? prev.total,
          loadingMore: false,
          meta: data,
        }));
      })
      .catch((err) => {
        setState((prev) => ({ ...prev, loadingMore: false, error: err.message || "加载失败" }));
      })
      .finally(() => {
        lockRef.current = false;
      });
  }, [enabled]);

  return { ...state, loadMore };
}
