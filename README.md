# mycode-web

This branch is the Wails-native UI for `mycode-go-wails`.

It is consumed by `mycode-go` as the `web/` git submodule on the
`mycode-go-wails` branch. The UI calls Wails Go bindings through
`window.go.main.App` and receives live run events from the Wails runtime.

## Develop

Run the desktop app from the parent repository:

```bash
make wails-dev
```

Useful UI-only commands:

```bash
pnpm install
pnpm dev
pnpm check
pnpm typecheck
pnpm test:run
pnpm build
```

## Submodule Update

After committing UI changes in this repository, update the parent repo pointer:

```bash
git add web
git commit -m "chore(web): bump Wails UI"
```
