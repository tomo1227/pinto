# Pinto

## Cloudflare Worker

The initial backend is a Hono app running on Cloudflare Workers.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:8787/` for `Hello World!` or
`http://localhost:8787/api/hello` for a JSON response.

Run `pnpm typecheck` to check types, `pnpm build` to validate the Worker
bundle locally, and `pnpm deploy` to deploy it to Cloudflare.