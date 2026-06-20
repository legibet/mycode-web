# mycode-web Wails Branch — Agent Context

This branch is the Wails-native UI for `mycode-go-wails`.

The UI is not backend-agnostic on this branch. It runs inside Wails, calls Go
bindings through `window.go.main.App`, and receives live run updates through
Wails runtime events.

## Dev

```bash
pnpm install
pnpm dev
pnpm check
pnpm typecheck
pnpm test:run
pnpm build
```

For the full desktop app, run `make wails-dev` from the parent repository.

## Component Structure

```text
src/
  App.tsx                # root layout, config loading, Wails menu commands
  main.tsx               # React entry
  types.ts               # shared TypeScript types
  index.css              # Tailwind CSS and Wails chrome rules
  components/
    Chat/
      MessageList.tsx      # scrollable message history
      MessageBubble.tsx    # single message, role-based styling
      CompactMarker.tsx    # inline divider rendered for `compact` markers
      InputArea.tsx        # user input, native file attach/drop, submit
      ToolCard.tsx         # tool execution block (start/output/done)
      ReasoningBlock.tsx   # thinking block
      MarkdownBlock.tsx    # markdown rendering
      CodeBlock.tsx        # syntax-highlighted code
      HighlightedCode.tsx  # shared highlighting wrapper
      EditDiff.tsx         # diff view for edit tool results
    Layout.tsx             # main layout shell
    Sidebar.tsx            # session list + workspace picker trigger
    WorkspacePicker.tsx    # workspace browser through Wails bindings
    MobileHeader.tsx       # mobile nav header
    ThemeProvider.tsx      # light/dark theme toggle
    UI/                    # shared UI primitives
  hooks/
    useChat.ts             # chat state + Wails run events
    sessionSelection.ts    # session picker state
    *.test.ts(x)           # focused unit and hook tests
  test/
    setup.ts               # Vitest + Testing Library setup
  utils/
    wails.ts               # Wails binding/runtime wrapper
    messages.ts            # block helpers + buildRenderMessages() projection
    highlighter.ts         # code syntax highlighting
    storage.ts             # localStorage helpers
    config.ts              # provider normalization with remote config
    clipboard.ts           # clipboard copy helper
    cn.ts                  # CSS class merging
```

## Wails Contract

Go binding methods are exposed as `window.go.main.App`:

- `GetConfig(cwd)`
- `Settings()`
- `UpdateSettings({config})`
- `ListSessions(cwd)`
- `LoadSession(sessionId)`
- `DeleteSession(sessionId)`
- `ClearSession(sessionId)`
- `StartChat(request)`
- `CancelRun(runId)`
- `DecideRun(runId, {request_id, decision})`
- `SelectFiles(title, pattern, multiple)`
- `ReadFiles(paths)`
- `WorkspaceRoots()`
- `BrowseWorkspace(root, path)`

Each method returns `{ok, status, data, detail}`. Errors preserve the same
status/detail shape as the Go service layer so active-run conflicts and
validation errors stay visible to the UI.

Runtime events:

- `mycode:run_event` carries `{run_id, session_id, event}`
- `mycode:desktop_command` carries `new_chat`, `select_workspace`, or
  `open_settings`

`mycode:run_event.event` uses the same stream event payloads as the core run
manager. The desktop-only `done` event ends the live subscription after the Go
run finishes.

## Message State Model

`useChat.ts` keeps two reducer fields:

- `rawMessages: ChatMessage[]` mirrors the persisted message timeline
- `toolRuntimeById` keeps live tool output, pending flags, and final results

`messages: RenderMessage[]` is derived with
`buildRenderMessages(rawMessages, toolRuntimeById)`. There is no second copy of
message state to keep in sync.

Reducer actions:

- `set_messages` loads session history and replays pending run events
- `start_turn` adds the optimistic user message and empty assistant
- `rewind_and_start_turn` rewinds visible history and starts a new turn
- `apply_event` applies one run event
- `rollback` restores the pre-turn snapshot after a failed start

Rendering rules:

- `thinking` blocks render as `ReasoningBlock`
- `tool_use` blocks render as `ToolCard`
- `text` blocks render as `MarkdownBlock`
- `image` blocks render inline previews
- `compact` messages render as `CompactMarker`

## Run Flow

1. `StartChat(request)` returns `{run, session}`.
2. `useChat` subscribes to `mycode:run_event`.
3. Matching run events are dispatched into the reducer.
4. `permission_request` opens the approval prompt.
5. `permission_resolved` clears the prompt.
6. `done` stops loading and refreshes the session list.
7. A 409 active-run error attaches to the existing run.

`streamTokenRef`, `pendingRequestTokenRef`, and `activeRunRef` invalidate stale
subscriptions, deduplicate concurrent sends, and keep cancel/decision actions
pointed at the current run.

## Attachments

The attachment button uses the Wails file dialog. Native file drops use Wails
file-drop paths and then call `ReadFiles(paths)` so the existing attachment
processing still handles text, image, and PDF payloads in one place.

Unsupported image/PDF attachments are cleared when the active model changes.

## Config Persistence

Local UI config is stored in `localStorage`:

- `provider`
- `model`
- `cwd`
- `reasoningEffort`

`auto` and an empty reasoning effort both mean the request does not send
`reasoning_effort`. The reasoning effort selector only renders when the remote
config says the current provider/model supports it.
