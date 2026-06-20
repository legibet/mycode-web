import type {
  ChatRequest,
  ChatResponse,
  GlobalConfig,
  RemoteConfig,
  RunEventPayload,
  SessionResponse,
  SessionsResponse,
  SettingsResponse,
  WorkspaceBrowseResponse,
  WorkspaceRootsResponse,
} from "../types";

interface APIResult<T> {
  ok?: boolean | undefined;
  status?: number | undefined;
  data?: T | undefined;
  detail?: unknown;
  OK?: boolean | undefined;
  Status?: number | undefined;
  Data?: T | undefined;
  Detail?: unknown;
}

interface SelectedFile {
  name: string;
  data: string;
  mime_type?: string | undefined;
}

interface WailsApp {
  GetConfig(cwd: string): Promise<APIResult<RemoteConfig>>;
  Settings(): Promise<APIResult<SettingsResponse>>;
  UpdateSettings(req: {
    config: GlobalConfig;
  }): Promise<APIResult<SettingsResponse>>;
  ListSessions(cwd: string): Promise<APIResult<SessionsResponse>>;
  LoadSession(sessionId: string): Promise<APIResult<SessionResponse>>;
  DeleteSession(sessionId: string): Promise<APIResult<{ status: string }>>;
  ClearSession(sessionId: string): Promise<APIResult<{ status: string }>>;
  StartChat(req: ChatRequest): Promise<APIResult<ChatResponse>>;
  CancelRun(runId: string): Promise<APIResult<{ status: string }>>;
  DecideRun(
    runId: string,
    req: { request_id: string; decision: "allow" | "deny" },
  ): Promise<APIResult<{ status: string }>>;
  SelectFiles(
    title: string,
    pattern: string,
    multiple: boolean,
  ): Promise<APIResult<SelectedFile[]>>;
  ReadFiles(paths: string[]): Promise<APIResult<SelectedFile[]>>;
  WorkspaceRoots(): Promise<APIResult<WorkspaceRootsResponse>>;
  BrowseWorkspace(
    root: string,
    path: string,
  ): Promise<APIResult<WorkspaceBrowseResponse>>;
}

interface WailsRuntime {
  EventsOn?: (name: string, callback: (payload: unknown) => void) => () => void;
  BrowserOpenURL?: (url: string) => void;
  WindowSetTitle?: (title: string) => void;
  OnFileDrop?: (
    callback: (x: number, y: number, paths: string[]) => void,
    useDropTarget?: boolean,
  ) => void;
  OnFileDropOff?: () => void;
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsApp;
      };
    };
    runtime?: WailsRuntime;
  }
}

export type DesktopCommand = "new_chat" | "select_workspace" | "open_settings";

const IMAGE_FILE_PATTERNS = [
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.svg",
  "*.bmp",
  "*.tif",
  "*.tiff",
  "*.heic",
  "*.heif",
  "*.avif",
];

export class APIError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, fallback: string) {
    super(detailToMessage(detail, fallback));
    this.status = status;
    this.detail = detail;
  }
}

function app(): WailsApp {
  const value = window.go?.main?.App;
  if (!value) throw new Error("Wails runtime is not available");
  return value;
}

function normalizeResult<T>(result: APIResult<T>): APIResult<T> {
  return {
    ok: result.ok ?? result.OK,
    status: result.status ?? result.Status,
    data: result.data ?? result.Data,
    detail: result.detail ?? result.Detail,
  };
}

async function call<T>(
  method: keyof WailsApp,
  fallback: string,
  ...args: unknown[]
): Promise<T> {
  const fn = app()[method] as (...args: unknown[]) => Promise<APIResult<T>>;
  const result = normalizeResult(await fn(...args));
  if (!result.ok) {
    throw new APIError(result.status || 500, result.detail, fallback);
  }
  return result.data as T;
}

function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail) return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }
  return fallback;
}

function acceptToDialogPattern(accept: string): string {
  const patterns = new Set<string>();
  for (const rawToken of accept.split(",")) {
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;
    if (token.startsWith(".")) patterns.add(`*${token}`);
    if (token === "image/*") {
      for (const pattern of IMAGE_FILE_PATTERNS) patterns.add(pattern);
    }
  }
  return Array.from(patterns).join(";");
}

function base64ToBuffer(data: string): ArrayBuffer {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function isExternalURL(url: URL): boolean {
  return (
    url.protocol === "http:" ||
    url.protocol === "https:" ||
    url.protocol === "mailto:"
  );
}

export const wailsAPI = {
  getConfig(cwd: string): Promise<RemoteConfig> {
    return call("GetConfig", "Failed to load config", cwd);
  },

  settings(): Promise<SettingsResponse> {
    return call("Settings", "Failed to load settings");
  },

  updateSettings(config: GlobalConfig): Promise<SettingsResponse> {
    return call("UpdateSettings", "Failed to save settings", { config });
  },

  listSessions(cwd: string): Promise<SessionsResponse> {
    return call("ListSessions", "Failed to load sessions", cwd);
  },

  loadSession(sessionId: string): Promise<SessionResponse> {
    return call("LoadSession", "Failed to load session", sessionId);
  },

  async deleteSession(sessionId: string): Promise<void> {
    await call("DeleteSession", "Failed to delete session", sessionId);
  },

  async clearSession(sessionId: string): Promise<void> {
    await call("ClearSession", "Failed to clear session", sessionId);
  },

  startChat(req: ChatRequest): Promise<ChatResponse> {
    return call("StartChat", "Failed to start task", req);
  },

  async cancelRun(runId: string): Promise<void> {
    await call("CancelRun", "Failed to cancel run", runId);
  },

  async decideRun(
    runId: string,
    requestId: string,
    decision: "allow" | "deny",
  ): Promise<void> {
    await call("DecideRun", "Failed to send decision", runId, {
      request_id: requestId,
      decision,
    });
  },

  workspaceRoots(): Promise<WorkspaceRootsResponse> {
    return call("WorkspaceRoots", "Failed to load roots");
  },

  browseWorkspace(root: string, path = ""): Promise<WorkspaceBrowseResponse> {
    return call("BrowseWorkspace", "Failed to browse directory", root, path);
  },

  onRunEvent(handler: (payload: RunEventPayload) => void): () => void {
    return (
      window.runtime?.EventsOn?.("mycode:run_event", (payload) => {
        handler(payload as RunEventPayload);
      }) || (() => {})
    );
  },

  onDesktopCommand(handler: (command: DesktopCommand) => void): () => void {
    return (
      window.runtime?.EventsOn?.("mycode:desktop_command", (payload) => {
        if (
          payload === "new_chat" ||
          payload === "select_workspace" ||
          payload === "open_settings"
        ) {
          handler(payload);
        }
      }) || (() => {})
    );
  },
};

export async function selectFiles(
  accept: string,
  multiple: boolean,
): Promise<File[]> {
  const pattern = acceptToDialogPattern(accept);
  if (!pattern) return [];

  const selected = await call<SelectedFile[]>(
    "SelectFiles",
    "Failed to attach files",
    "Attach files",
    pattern,
    multiple,
  );
  return selected.map(
    (file) =>
      new File([base64ToBuffer(file.data)], file.name, {
        type: file.mime_type || "",
      }),
  );
}

export async function readFiles(paths: string[]): Promise<File[]> {
  if (paths.length === 0) return [];
  const selected = await call<SelectedFile[]>(
    "ReadFiles",
    "Failed to attach dropped files",
    paths,
  );
  return selected.map(
    (file) =>
      new File([base64ToBuffer(file.data)], file.name, {
        type: file.mime_type || "",
      }),
  );
}

export function onNativeFileDrop(
  handler: (x: number, y: number, paths: string[]) => void,
): () => void {
  window.runtime?.OnFileDrop?.(handler, false);
  return () => window.runtime?.OnFileDropOff?.();
}

export function installDesktopChrome(): () => void {
  document.documentElement.setAttribute("data-mycode-desktop", "wails");

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;

    const url = new URL(anchor.href, window.location.href);
    if (!isExternalURL(url)) return;

    event.preventDefault();
    window.runtime?.BrowserOpenURL?.(url.href);
  };

  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("click", onClick, true);
  };
}

export function setWindowTitle(title: string): void {
  window.runtime?.WindowSetTitle?.(title);
}
