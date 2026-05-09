# Vanilla HTML + JavaScript example

Plain `<script type="module">` using **`@vivsh1999/upupload/browser`** (no React, no bundler in source — Vite is only the dev/build tool).

## Develop

1. Start the TanStack Start example (TUS server on port 3000):

   ```bash
   pnpm dev:tanstack-start
   ```

2. Start this example (port 4174; proxies `/api/tus` → `http://localhost:3000`):

   ```bash
   pnpm dev:vanilla-html
   ```

3. Open `http://localhost:4174/`, pick a file, use **Run pipeline only** or **Run pipeline + TUS upload**.

> **Note:** The `transport` and `tus` options were removed from `useMediaUpload`. Pipeline processing produces artifact blobs — you handle upload yourself (TUS, fetch, etc.) in the `onFileComplete` callback.

## Build

```bash
pnpm --dir examples/vanilla-html build
```

Preview the static output:

```bash
pnpm --dir examples/vanilla-html preview
```

For uploads after `vite build`, serve `dist/` behind the same TUS backend or set the **TUS endpoint** field to your server URL.
