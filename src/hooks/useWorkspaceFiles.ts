/**
 * Fetch workspace file/dir candidates for the @ completion menu. Debounced,
 * no cross-request caching (new/deleted files must show immediately). A 404
 * (backend without the endpoint) sticks as "unsupported" so we stop asking.
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceFilesResponse } from "../utils/completion";

interface WorkspaceFilesState {
  entries: WorkspaceFilesResponse["entries"];
  loading: boolean;
  truncated: boolean;
  unsupported: boolean;
}

const EMPTY: WorkspaceFilesResponse["entries"] = [];

export function useWorkspaceFiles(
  cwd: string,
  dir: string,
  prefix: string,
  enabled: boolean,
): WorkspaceFilesState {
  const [state, setState] = useState<WorkspaceFilesState>({
    entries: EMPTY,
    loading: false,
    truncated: false,
    unsupported: false,
  });
  // Remember cwds whose backend lacks the endpoint so we never re-request.
  const unsupportedCwds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || unsupportedCwds.current.has(cwd)) {
      setState({
        entries: EMPTY,
        loading: false,
        truncated: false,
        unsupported: unsupportedCwds.current.has(cwd),
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ cwd, dir, prefix });
        const res = await fetch(`/api/workspaces/files?${params}`, {
          signal: controller.signal,
        });
        if (res.status === 404) {
          unsupportedCwds.current.add(cwd);
          setState({
            entries: EMPTY,
            loading: false,
            truncated: false,
            unsupported: true,
          });
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as WorkspaceFilesResponse;
        setState({
          entries: data.error ? EMPTY : data.entries,
          loading: false,
          truncated: data.truncated,
          unsupported: false,
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        console.error("Failed to list workspace files:", e);
        setState({
          entries: EMPTY,
          loading: false,
          truncated: false,
          unsupported: false,
        });
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cwd, dir, prefix, enabled]);

  return state;
}
