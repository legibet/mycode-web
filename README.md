# mycode-web

Shared React + Vite UI for [mycode](https://github.com/legibet/mycode) (Python backend)
and [mycode-go](https://github.com/legibet/mycode-go) (Go backend). Both backends consume
this repository as a git submodule at `web/` and build it into their served/embedded assets.

The UI talks to the backend purely over the HTTP/SSE API contract, so it is backend-agnostic.

## Develop

```bash
pnpm install
pnpm dev          # Vite dev server on :5173, proxies /api to a running backend on :8000
```

Run a backend (`mycode web --dev` or `mycode-go web --dev`) alongside for a full stack.

## Commands

```bash
pnpm check        # Biome lint + format check
pnpm typecheck    # tsc --noEmit
pnpm test:run     # Vitest
pnpm build        # production build -> dist/
```

## Consumed as a submodule

Backends pin this repo at a specific commit. To update the UI in a backend repo:

```bash
cd web && git checkout <commit> && cd ..
git add web && git commit -m "chore(web): bump mycode-web"
```
