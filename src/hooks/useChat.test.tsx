import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, RenderMessage, RunEventPayload } from "../types";
import { isCompactMarker } from "../types";
import { loadActiveSession, saveActiveSession } from "../utils/storage";
import { useChat } from "./useChat";

type Handler = (payload: unknown) => void;
type MockFn = ReturnType<typeof vi.fn>;

interface WailsMock {
  GetConfig: MockFn;
  Settings: MockFn;
  UpdateSettings: MockFn;
  ListSessions: MockFn;
  LoadSession: MockFn;
  DeleteSession: MockFn;
  ClearSession: MockFn;
  StartChat: MockFn;
  CancelRun: MockFn;
  DecideRun: MockFn;
  SelectFiles: MockFn;
  WorkspaceRoots: MockFn;
  BrowseWorkspace: MockFn;
}

let appMock: WailsMock;
let handlers: Map<string, Set<Handler>>;

function expectChat(message: RenderMessage | undefined): ChatMessage {
  if (!message || isCompactMarker(message)) {
    throw new Error("expected a ChatMessage, got compact marker or undefined");
  }
  return message;
}

function ok<T>(data: T) {
  return Promise.resolve({ ok: true, status: 200, data });
}

function fail(status: number, detail: unknown) {
  return Promise.resolve({ ok: false, status, detail });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createLocalStorage() {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function emit(name: string, payload: unknown) {
  for (const handler of handlers.get(name) ?? []) handler(payload);
}

function emitRun(
  runID: string,
  sessionID: string,
  event: RunEventPayload["event"],
) {
  act(() => {
    emit("mycode:run_event", {
      run_id: runID,
      session_id: sessionID,
      event,
    } satisfies RunEventPayload);
  });
}

function installWailsMock() {
  handlers = new Map();
  appMock = {
    GetConfig: vi.fn(),
    Settings: vi.fn(),
    UpdateSettings: vi.fn(),
    ListSessions: vi.fn(() => ok({ sessions: [] })),
    LoadSession: vi.fn(),
    DeleteSession: vi.fn(() => ok({ status: "ok" })),
    ClearSession: vi.fn(() => ok({ status: "ok" })),
    StartChat: vi.fn(),
    CancelRun: vi.fn(() => ok({ status: "ok" })),
    DecideRun: vi.fn(() => ok({ status: "ok" })),
    SelectFiles: vi.fn(),
    WorkspaceRoots: vi.fn(),
    BrowseWorkspace: vi.fn(),
  };

  window.go = { main: { App: appMock as never } };
  window.runtime = {
    EventsOn: vi.fn((name: string, callback: Handler) => {
      const set = handlers.get(name) ?? new Set<Handler>();
      set.add(callback);
      handlers.set(name, set);
      return () => set.delete(callback);
    }),
    BrowserOpenURL: vi.fn(),
    WindowSetTitle: vi.fn(),
    OnFileDrop: vi.fn(),
    OnFileDropOff: vi.fn(),
  };
}

function renderChatHook(overrides?: Partial<Parameters<typeof useChat>[0]>) {
  return renderHook(() =>
    useChat({
      provider: "",
      model: "",
      cwd: "/workspace/a",
      reasoningEffort: "",
      ...overrides,
    }),
  );
}

describe("useChat", () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorage();
    installWailsMock();
  });

  it("creates a draft session when the workspace has no saved sessions", async () => {
    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.sessions).toHaveLength(1);
    });

    expect(appMock.ListSessions).toHaveBeenCalledWith("/workspace/a");
    expect(result.current.activeSession.isDraft).toBe(true);
    expect(result.current.sessions[0]?.id).toBe(
      result.current.activeSession.id,
    );
    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("sends text attachments as Wails chat input blocks", async () => {
    appMock.StartChat.mockImplementation((req) =>
      ok({
        run: {
          id: "run-1",
          session_id: req.session_id,
          status: "running",
          last_seq: 0,
        },
        session: { id: req.session_id, title: "Draft" },
      }),
    );

    const { result } = renderChatHook({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
    });

    await act(async () => {
      await result.current.send("check this", [
        { id: "file-1", kind: "text", name: "main.py", text: 'print("ok")' },
      ]);
    });

    expect(appMock.StartChat).toHaveBeenCalledWith({
      session_id: result.current.activeSession.id,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      cwd: "/workspace/a",
      input: [
        { type: "text", text: "check this" },
        {
          type: "text",
          text: 'print("ok")',
          name: "main.py",
          is_attachment: true,
        },
      ],
    });

    emitRun("run-1", result.current.activeSession.id, {
      type: "done",
      status: "completed",
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sends document data without keeping it in UI messages", async () => {
    appMock.StartChat.mockImplementation((req) =>
      ok({
        run: {
          id: "run-1",
          session_id: req.session_id,
          status: "running",
          last_seq: 0,
        },
        session: { id: req.session_id, title: "Draft" },
      }),
    );

    const { result } = renderChatHook({
      provider: "xiaomi",
      model: "mimo-v2.5-pro",
    });

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
    });

    await act(async () => {
      await result.current.send("summarize", [
        {
          id: "file-1",
          kind: "document",
          name: "report.pdf",
          mime_type: "application/pdf",
          data: "large-pdf-base64",
        },
      ]);
    });

    expect(appMock.StartChat.mock.calls[0]?.[0].input[1]).toEqual({
      type: "document",
      data: "large-pdf-base64",
      mime_type: "application/pdf",
      name: "report.pdf",
    });

    await waitFor(() => {
      const userMessage = result.current.messages.find(
        (message): message is ChatMessage =>
          !isCompactMarker(message) && message.role === "user",
      );
      expect(userMessage?.content[1]).toEqual({
        type: "document",
        data: "",
        mime_type: "application/pdf",
        name: "report.pdf",
        renderKey: "user:0:1",
      });
    });
  });

  it("loads a persisted session through Wails bindings", async () => {
    saveActiveSession("/workspace/a", "session-1");
    appMock.ListSessions.mockImplementation(() =>
      ok({ sessions: [{ id: "session-1", title: "Persisted" }] }),
    );
    appMock.LoadSession.mockImplementation(() =>
      ok({
        session: { id: "session-1", title: "Persisted" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "check this" },
              {
                type: "text",
                text: '<file name="main.py">\nprint("ok")\n</file>',
                meta: { attachment: true, path: "main.py" },
              },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "looks good" }],
          },
        ],
        active_run: null,
        pending_events: [],
      }),
    );

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.messages).toHaveLength(2);
    });

    expect(appMock.LoadSession).toHaveBeenCalledWith("session-1");
    expect(result.current.messages[1]).toEqual({
      role: "assistant",
      renderKey: "assistant:1",
      sourceIndex: 1,
      content: [
        {
          type: "text",
          text: "looks good",
          renderKey: "assistant:1:0",
        },
      ],
    });
  });

  it("replays pending run events and handles live Wails permission events", async () => {
    saveActiveSession("/workspace/a", "session-3");
    appMock.ListSessions.mockImplementation(() =>
      ok({ sessions: [{ id: "session-3", title: "Awaiting" }] }),
    );
    appMock.LoadSession.mockImplementation(() =>
      ok({
        session: { id: "session-3", title: "Awaiting" },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "run command" }],
          },
        ],
        active_run: {
          id: "run-3",
          session_id: "session-3",
          status: "running",
          last_seq: 1,
        },
        pending_events: [{ type: "text", delta: "working", seq: 1 }],
      }),
    );
    appMock.DecideRun.mockImplementation(async () => {
      emitRun("run-3", "session-3", {
        type: "permission_resolved",
        seq: 3,
        request_id: "req-1",
        decision: "allow",
      });
      return ok({ status: "ok" });
    });

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.activeSession.id).toBe("session-3");
      expect(result.current.messages).toHaveLength(2);
    });
    expect(expectChat(result.current.messages[1]).content[0]).toEqual({
      type: "text",
      text: "working",
      renderKey: "assistant:1:0",
    });

    emitRun("run-3", "session-3", {
      type: "permission_request",
      seq: 2,
      request_id: "req-1",
      tool_use_id: "call-1",
      tool_name: "bash",
      preview: "pnpm install",
    });

    await waitFor(() => {
      expect(result.current.pendingPermission?.request_id).toBe("req-1");
    });

    await act(async () => {
      await result.current.decidePermission("allow");
    });

    await waitFor(() => {
      expect(result.current.pendingPermission).toBeNull();
    });
    expect(appMock.DecideRun).toHaveBeenCalledWith("run-3", {
      request_id: "req-1",
      decision: "allow",
    });
  });

  it("keeps the permission prompt visible when the Wails decision call fails", async () => {
    saveActiveSession("/workspace/a", "session-4");
    appMock.ListSessions.mockImplementation(() =>
      ok({ sessions: [{ id: "session-4", title: "Awaiting" }] }),
    );
    appMock.LoadSession.mockImplementation(() =>
      ok({
        session: { id: "session-4", title: "Awaiting" },
        messages: [],
        active_run: {
          id: "run-4",
          session_id: "session-4",
          status: "running",
          last_seq: 0,
        },
        pending_events: [],
      }),
    );
    appMock.DecideRun.mockImplementation(() =>
      fail(500, "failed to send decision"),
    );

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.activeSession.id).toBe("session-4");
    });

    emitRun("run-4", "session-4", {
      type: "permission_request",
      seq: 1,
      request_id: "req-1",
      tool_use_id: "call-1",
      tool_name: "bash",
      preview: "pnpm install",
    });

    await waitFor(() => {
      expect(result.current.pendingPermission?.request_id).toBe("req-1");
    });

    await act(async () => {
      await result.current.decidePermission("allow");
    });

    expect(result.current.pendingPermission?.request_id).toBe("req-1");
  });

  it("ignores stale selected history when switching sessions again", async () => {
    saveActiveSession("/workspace/a", "session-1");

    const session2 = deferred<ReturnType<typeof ok>>();
    const session3 = deferred<ReturnType<typeof ok>>();

    appMock.ListSessions.mockImplementation(() =>
      ok({
        sessions: [
          { id: "session-3", title: "Third" },
          { id: "session-2", title: "Second" },
          { id: "session-1", title: "First" },
        ],
      }),
    );
    appMock.LoadSession.mockImplementation((sessionID: string) => {
      if (sessionID === "session-1") {
        return ok({
          session: { id: "session-1", title: "First" },
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "first session" }],
            },
          ],
          active_run: null,
          pending_events: [],
        });
      }
      if (sessionID === "session-2") return session2.promise;
      return session3.promise;
    });

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.activeSession.id).toBe("session-1");
    });

    let selectSession2!: Promise<void>;
    act(() => {
      selectSession2 = result.current.selectSession("session-2");
    });
    expect(result.current.activeSession.id).toBe("session-2");
    expect(result.current.messageSessionId).toBe("session-2");

    let selectSession3!: Promise<void>;
    act(() => {
      selectSession3 = result.current.selectSession("session-3");
    });
    expect(result.current.activeSession.id).toBe("session-3");
    expect(result.current.messageSessionId).toBe("session-3");

    await act(async () => {
      session2.resolve(
        ok({
          session: { id: "session-2", title: "Second" },
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "second session" }],
            },
          ],
          active_run: null,
          pending_events: [],
        }),
      );
      await selectSession2;
    });

    expect(result.current.activeSession.id).toBe("session-3");
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      session3.resolve(
        ok({
          session: { id: "session-3", title: "Third" },
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "third session" }],
            },
          ],
          active_run: null,
          pending_events: [],
        }),
      );
      await selectSession3;
    });

    await waitFor(() => {
      expect(result.current.messageSessionId).toBe("session-3");
      expect(result.current.messages).toHaveLength(1);
    });
    expect(expectChat(result.current.messages[0]).content[0]).toEqual({
      type: "text",
      text: "third session",
      renderKey: "assistant:0:0",
    });
  });

  it("deletes the active session and loads the nearest history fallback", async () => {
    saveActiveSession("/workspace/a", "session-2");

    appMock.ListSessions.mockImplementation(() =>
      ok({
        sessions: [
          { id: "session-2", title: "Second" },
          { id: "session-1", title: "First" },
        ],
      }),
    );
    appMock.LoadSession.mockImplementation((sessionID: string) =>
      ok({
        session:
          sessionID === "session-2"
            ? { id: "session-2", title: "Second" }
            : { id: "session-1", title: "First" },
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text:
                  sessionID === "session-2"
                    ? "second session"
                    : "first session",
              },
            ],
          },
        ],
        active_run: null,
        pending_events: [],
      }),
    );

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.activeSession.id).toBe("session-2");
    });

    await act(async () => {
      await result.current.deleteSession("session-2");
    });

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.activeSession.id).toBe("session-1");
      expect(result.current.sessions.map((session) => session.id)).toEqual([
        "session-1",
      ]);
    });
    expect(expectChat(result.current.messages[0]).content[0]).toEqual({
      type: "text",
      text: "first session",
      renderKey: "assistant:0:0",
    });
    expect(loadActiveSession("/workspace/a")).toBe("session-1");
  });

  it("deletes the last active session and falls back to a draft", async () => {
    saveActiveSession("/workspace/a", "session-1");

    appMock.ListSessions.mockImplementation(() =>
      ok({ sessions: [{ id: "session-1", title: "Only Session" }] }),
    );
    appMock.LoadSession.mockImplementation(() =>
      ok({
        session: { id: "session-1", title: "Only Session" },
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "only session" }],
          },
        ],
        active_run: null,
        pending_events: [],
      }),
    );

    const { result } = renderChatHook();

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.activeSession.id).toBe("session-1");
    });

    await act(async () => {
      await result.current.deleteSession("session-1");
    });

    await waitFor(() => {
      expect(result.current.sessionLoading).toBe(false);
      expect(result.current.activeSession.isDraft).toBe(true);
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0]?.id).toBe(
        result.current.activeSession.id,
      );
      expect(result.current.messages).toEqual([]);
    });

    expect(loadActiveSession("/workspace/a")).toBe("");
  });
});
