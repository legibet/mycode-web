# mycode-web — Agent Context

Shared React + Vite UI for the [`mycode`](https://github.com/legibet/mycode) (Python) and
[`mycode-go`](https://github.com/legibet/mycode-go) (Go) backends, which consume this repo as the
`web/` git submodule. The UI is backend-agnostic: it talks to whichever backend over the HTTP/SSE
API contract (defined by the backend — see its `docs/api.md`).

## Dev

```bash
pnpm install
pnpm dev          # Vite dev server on :5173, proxies /api to a backend on :8000
pnpm check        # Biome lint + format
pnpm typecheck    # tsc --noEmit
pnpm test:run     # Vitest
pnpm build        # production build -> dist/
```

Run a backend (`mycode web --dev` or `mycode-go web --dev`) alongside for a full stack.

## Component Structure

```text
web/src/
  App.tsx                # root layout, config loading, session init
  main.tsx               # React entry
  types.ts               # shared TypeScript types
  index.css              # Tailwind CSS
  components/
    Chat/
      MessageList.tsx      # scrollable message history
      MessageBubble.tsx    # single message, role-based styling
      CompactMarker.tsx    # inline divider rendered for `compact` markers
      InputArea.tsx        # upload attachments, drag-and-drop, bottom action row
      Composer.tsx         # Lexical editor: built-in slash, inline skill/@ completion, @file pills
      WorkspaceFileNode.ts # atomic @path token node (Lexical TextNode, token mode)
      CompletionMenu.tsx   # listbox above the composer (commands + skills + @ files)
      ToolCard.tsx         # tool execution block (start/output/done)
      ReasoningBlock.tsx   # thinking block — expanded while streaming, collapses after
      MarkdownBlock.tsx    # markdown rendering
      CodeBlock.tsx        # syntax-highlighted code
      HighlightedCode.tsx  # shared highlighting wrapper
      EditDiff.tsx         # diff view for edit tool results
    Layout.tsx             # main layout shell
    Sidebar.tsx            # session list + settings panel
    WorkspacePicker.tsx    # workspace browser using /api/workspaces
    MobileHeader.tsx       # mobile nav header
    ThemeProvider.tsx       # light/dark theme toggle
    UI/                    # shared UI primitives
  hooks/
    useChat.ts             # main chat state + SSE streaming
    sessionSelection.ts    # session picker state
    *.test.ts(x)           # focused unit and hook tests
  test/
    setup.ts               # Vitest + Testing Library setup
  utils/
    messages.ts            # block helpers + buildRenderMessages() projection
    highlighter.ts         # code syntax highlighting (shiki)
    storage.ts             # localStorage helpers
    config.ts              # reasoning effort defaults + provider normalization with remote config
    clipboard.ts           # clipboard copy helper
    cn.ts                  # CSS class merging (clsx + tailwind-merge)
```

## Message State Model

`useChat.ts` keeps two pieces of reducer state:

- `rawMessages: ChatMessage[]` — canonical block messages (mirrors the JSONL timeline; includes `role: "compact"` markers)
- `toolRuntimeById` — ephemeral tool runtime state (streaming output, pending flags, final result)

The render-ready list `messages: RenderMessage[]` (where `RenderMessage = ChatMessage | CompactMarkerMessage`) is derived via `useMemo(buildRenderMessages(rawMessages, toolRuntimeById))`. There is no second copy of state to keep in sync — every reducer transition produces a new `rawMessages` and/or `toolRuntimeById` reference and the projection is recomputed.

`CompactMarkerMessage` (`{kind: "compact-marker", sourceIndex, renderKey}`) carries no content of its own — it just tells `MessageList` to render `CompactMarker` instead of `MessageBubble`. Use the `isCompactMarker(msg)` type guard from `types.ts` to narrow when iterating.

State is managed via `useReducer` with actions:

- `set_messages` — load session history from server
- `start_turn` — optimistic user message + empty assistant
- `rewind_and_start_turn` — rewind + optimistic new turn
- `apply_event` — apply one SSE event to `rawMessages` / `toolRuntimeById`
- `rollback` — restore the snapshot taken before an optimistic turn

`buildRenderMessages()` in `utils/messages.ts` is the single projection used by both initial load and live streaming: tool results visually attach to their `tool_use`, multiple assistant turns of a tool loop merge into one bubble, and every `role: "compact"` entry surfaces as a `CompactMarkerMessage`. A live `compact` SSE event appends a `{role: "compact"}` entry to `rawMessages`; the marker appears on the next render.

Key design decisions:

- Tool results persisted as `user` messages with `tool_result` blocks are visually folded into the preceding assistant message during rendering
- Each render message and block gets a stable `renderKey` for React reconciliation
- `sourceIndex` tracks the original message position; rewind uses this index against the visible list, so rewinding to a real user message before a `compact` marker slices the marker away too

Rendering rules:

- `thinking` blocks → `ReasoningBlock` (expanded while streaming, uses `meta.duration_ms` when present)
- `tool_use` blocks → `ToolCard` (with matching `tool_result` and live runtime folded in)
- `text` blocks → `MarkdownBlock`
- `image` blocks → inline image preview in `MessageBubble`
- `compact-marker` entries → `CompactMarker` (a thin labelled divider, no interactivity)

`MessageList` renders long histories as a tail window: initial session load renders the latest messages and scrolls to the bottom before paint. Scrolling near the top prepends older messages in batches and preserves the current viewport by restoring the previous distance from the bottom. Auto-scroll follows incoming message updates only while the user is already near the bottom; local height changes such as expanding tools do not trigger it.

## Streaming

1. `POST /api/chat` → get `{run, session}`
2. `GET /api/runs/{run_id}/stream` → SSE reader
3. Each `data:` line parsed as `StreamEvent`, dispatched to reducer
4. `data: [DONE]` ends the stream
5. On disconnect: attempt session reload recovery via `GET /api/sessions/{id}`
6. 409 conflict: attach to the existing run's stream

A live `compact` SSE event is consumed by the reducer at the position it arrives — the marker lands between whatever just streamed and whatever streams next, mirroring where the agent emitted it (e.g. between two tool calls of the same turn). The server has already persisted the `compact` JSONL record at the same point, so a later session reload renders the same marker without any extra round-trip.

`permission_request` opens the approval prompt. `permission_resolved` clears it. `deny` cancels the active run.

Streaming state tracking:

- `streamTokenRef` — incremented to invalidate stale streams
- `pendingRequestTokenRef` — deduplicates concurrent send requests
- `activeRunRef` — tracks the current run for cancel

Composer and attachments:

- `Composer` (Lexical) is the single source of truth for message text + inline `@` refs; submit hands `useChat.send` a `ComposerSubmission = { text, workspaceFiles }` and `useChat` builds the `input` blocks (workspace refs deduped by `kind + path`, uploads appended).
- `WorkspaceFileNode` pills serialize as `@path` inside the message text; the file content travels separately as a `path` input block — both must stay consistent with the CLI `@file` behavior.
- Built-in slash commands match a whole-input token while the composer is idle with an empty upload list. Skills from `GET /api/config` complete as editable `/<skill-name>` text at any standalone slash token. The backend expands exact discovered names; other slash tokens are submitted as text.
- Skill snapshot text blocks (`meta.skill_snapshot=true`) remain in `rawMessages` for provider replay. `buildRenderMessages()` gives history, copy, and edit the original user text.
- `@` completion needs `GET /api/workspaces/files`; a 404 backend degrades to a quiet "not supported" footer. Refs the model can't ingest block submit with a hint — never silently drop a pill (it would break the sentence).
- Optimistic workspace refs render as empty-data file cards; after reload the server-persisted blocks render instead (workspace image: card live, real preview after reload — intentional).
- Upload attachments (picker/drag/paste) stay in `InputArea`: text as inline snapshot blocks and media as base64 blocks. Unsupported additions briefly replace the effort pill with a compact toolbar notice; attachments already in the draft survive model changes and block submit with a persistent notice until removed or supported again, matching inline `@` refs.

## Config Persistence

Web UI config is persisted to `localStorage`:

- `provider`, `model`, `cwd`, `reasoningEffort`
- `auto` and empty string both mean "do not send reasoning_effort to server"
- The reasoning effort selector in the sidebar only renders when `supports_reasoning_effort` is true AND the current model appears in `reasoning_models` (from `GET /api/config`)
- Settings editor options come from `provider_type_env_vars` and `provider_type_default_models`
