<!-- intent-skills:start -->

# Skill mappings - load `use` with `npx @tanstack/intent@latest load <use>`.

skills:

- when: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
  use: "@tanstack/devtools#devtools-app-setup"
- when: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
  use: "@tanstack/devtools#devtools-marketplace"
- when: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
  use: "@tanstack/devtools#devtools-plugin-panel"
- when: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
  use: "@tanstack/devtools#devtools-production"
- when: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
  use: "@tanstack/devtools-event-client#devtools-bidirectional"
- when: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
  use: "@tanstack/devtools-event-client#devtools-event-client"
- when: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
  use: "@tanstack/devtools-event-client#devtools-instrumentation"
- when: "Configure @tanstack/devtools-vite for source inspection (data-tsd-source, inspectHotkey, ignore patterns), console piping (client-to-server, server-to-client, levels), enhanced logging, server event bus (port, host, HTTPS), production stripping (removeDevtoolsOnBuild), editor integration (launch-editor, custom editor.open). Must be FIRST plugin in Vite config. Vite ^6 || ^7 only."
  use: "@tanstack/devtools-vite#devtools-vite-plugin"
- when: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
  use: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
- when: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
  use: "@tanstack/react-start#react-start"
- when: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
  use: "@tanstack/react-start#react-start/server-components"
- when: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
  use: "@tanstack/router-core#router-core"
- when: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (\_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
  use: "@tanstack/router-core#router-core/auth-and-guards"
- when: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
  use: "@tanstack/router-core#router-core/code-splitting"
- when: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
  use: "@tanstack/router-core#router-core/data-loading"
- when: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
  use: "@tanstack/router-core#router-core/navigation"
- when: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
  use: "@tanstack/router-core#router-core/not-found-and-errors"
- when: "Dynamic path segments ($paramName), splat routes ($ / \_splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
  use: "@tanstack/router-core#router-core/path-params"
- when: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
  use: "@tanstack/router-core#router-core/search-params"
- when: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
  use: "@tanstack/router-core#router-core/ssr"
- when: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
  use: "@tanstack/router-core#router-core/type-safety"
- when: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
  use: "@tanstack/router-plugin#router-plugin"
- when: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
  use: "@tanstack/start-client-core#start-core"
- when: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
  use: "@tanstack/start-client-core#start-core/deployment"
- when: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE\_ prefix, process.env)."
  use: "@tanstack/start-client-core#start-core/execution-model"
- when: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
  use: "@tanstack/start-client-core#start-core/middleware"
- when: "createServerFn (GET/POST), inputValidator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
  use: "@tanstack/start-client-core#start-core/server-functions"
- when: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
  use: "@tanstack/start-client-core#start-core/server-routes"
- when: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStorage context."
  use: "@tanstack/start-server-core#start-server-core"
- when: "Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteConfig option."
  use: "@tanstack/virtual-file-routes#virtual-file-routes"
- when: "Write JSDoc-style documentation for JSR-published packages. Symbol docs via JSDoc above exports (functions, interfaces, classes, types). Module docs via `@module` tag at top of file. Supported tags: `@param`, `@returns`, `@example`, `{@link}`. Custom wildcard import identifiers via `@module <name>`. Overview tab behavior controlled by module doc vs README setting."
use: "jsr#writing-docs"
<!-- intent-skills:end -->

# Documentation (JSR)

JSR generates API documentation from JSDoc comments in source code. Two mandatory checks must pass:

1. **Module docs (0/1)** — every entrypoint listed in `jsr.json` `exports` needs `@module`
2. **Symbol docs (0/1)** — at least 80 % of exported symbols need JSDoc

## Symbol Documentation

Add JSDoc above all exported symbols (`/** ... */`) — especially types, interfaces, and functions defined directly in entrypoint files (re-exports inherit docs from their source):

- `@param` — describe function parameters
- `@returns` — describe return value
- `@example` — show usage with \`\`\`ts code blocks
- `{@link}` — create clickable cross-reference links

## Module Documentation

Add a JSDoc comment at the top of **every entrypoint file** with `@module`:

- `/** Overview of this module's purpose. @module */` — shown on package "Overview" tab (overrides README by default; toggle via Settings > Readme Source)
- Custom wildcard import identifier: `/** @module <name> */` makes `import * as <name> from "..."` use the custom name instead of `mod`

See: https://jsr.io/docs/writing-docs

# Publishing

## npm

```bash
pnpm build
pnpm publish
```

Requirements:

- Logged into npm (`npm login`)
- Package is public (already configured via `publishConfig.access = "public"`)
- Version bump as needed before publish

## JSR

```bash
pnpm build
npx jsr publish
```

Requirements:

- Authenticated at https://jsr.io (run `npx jsr auth` or use `JSR_TOKEN` env var)
- Version bump as needed before publish

# Architecture & API

## Pipeline Engine (`src/core/`)

The generic pipeline engine (`runPipeline`) executes ordered stages with:

- **Shared context bag** (`ctx.shared: Map<string, unknown>`) — stages/plugins communicate by reading/writing shared keys
- **AbortSignal support** — pipelines and uploads can be cancelled mid-flight
- **Stage middleware** — `PipelineDefinition.middleware` transforms every stage (timing, monitoring, etc.)
- **Progress events** — `PipelineOptions.onProgress` fires `start`/`end` per stage
- **Retry on error** — error handler supports `{ action: "retry"; maxRetries; delayMs? }`
- **Accumulated result in `when()`** — stage guards receive the current accumulated `PipelineResult`

### Utilities

```ts
compose(...defs); // Merge multiple pipeline definitions
stage(s); // Wrap a single stage as a definition
createTimingMiddleware(); // Log stage duration to ctx.log
```

## Plugin System (`src/plugin/`)

```ts
interface ProcessingPlugin<TOpts = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  supports(file: { name: string; type?: string | null }): boolean;
  createStages(
    input: PipelineSource,
    opts: TOpts, // Typed options — no more cast
    classif: FileClassification,
    ctx: PipelineContext, // Logger + shared bag + signal
  ): PipelineStage<PipelineSource, PipelineResult>[];
  preload?(): void;
}
```

`FileClassification` now includes `size`, `lastModified`, and optional `meta` bag.

### Plugin Factory Pattern

```ts
function createMyPlugin(): ProcessingPlugin<DefaultBrowserPipelineOptions> {
  return {
    id: "my-plugin",
    name: "My Plugin",
    supports(file) { /* return true/false */ },
    createStages(input, opts, classif, ctx) {
      // opts is DefaultBrowserPipelineOptions — fully typed, no cast
      // ctx.shared: Map<string, unknown> — inter-plugin communication
      // ctx.log(level, message, extra?) — structured logging
      // ctx.signal?: AbortSignal — cancellation support
      return [{ id: "my-stage", when: () => ({ run: true }), run: async () => { ... } }];
    },
  };
}
```

### Built-in Plugins

| Factory                        | File type            | Import path                                   |
| ------------------------------ | -------------------- | --------------------------------------------- |
| `createRawToJpegPlugin()`      | RAW/HEIC/TIFF → JPEG | `@vivsh1999/upupload/plugins/raw-to-jpeg`     |
| `createJpegCompressorPlugin()` | JPEG/PNG/WebP → JPEG | `@vivsh1999/upupload/plugins/jpeg-compressor` |

Both return `ProcessingPlugin<DefaultBrowserPipelineOptions>` — the `opts` parameter is fully typed.

### Writing a Custom Plugin

```ts
const myPlugin: ProcessingPlugin<MyOpts> = {
  id: "my-plugin",
  name: "My Plugin",
  supports(file) { /* return true/false */ },
  createStages(input, opts, classif, ctx) {
    // opts is typed as MyOpts
    // ctx.shared lets you read/write inter-plugin state
    // ctx.log for structured logging
    return [{ id: "my-stage", when: () => ({ run: true }), run: async () => { ... } }];
  },
};
```

## React Hook (`src/react/`)

```ts
function useMediaUpload<TMeta = void>(
  options?: UseMediaUploadOptions<TMeta>,
): UseMediaUploadResult<TMeta>;
```

Key features:

- **Generic over metadata** — `queue` items include `meta?: TMeta` from `getMeta: (file) => TMeta`
- **`file: File` on every queue item** — no more DOM queries
- **`cancelUpload(fileId)` / `cancelAll()`** — aborts in-flight pipelines and uploads
- **`isDragOver` state** — composable drag-and-drop with enter/leave counter
- **`tuning.simultaneousUploads`** — concurrency-limited via `Semaphore`
- **Preview URLs** — `previewUrl` and per-artifact `url` on queue items (auto-released)
- **`startUpload(fileIds?)`** — selective processing of specific items
- **No `xhr` transport** dead path — only `"tus"` and `"custom"`
- **`onWarning` wired** — error messages in queue trigger the callback

## Semaphore Utility

```ts
import { Semaphore } from "@vivsh1999/upupload/react"; // internal, re-exported

const sem = new Semaphore(4); // max 4 concurrent
await sem.run(() => fetch(...));
```

It is also used internally by `useMediaUpload` with `tuning.simultaneousUploads`.

## File Locations

### Core

- `src/core/types.ts` — All pipeline types
- `src/core/runPipeline.ts` — Generic engine
- `src/core/utils.ts` — `compose`, `stage`, `createTimingMiddleware`
- `src/core/index.ts` — Barrel

### Plugin

- `src/plugin/types.ts` — `ProcessingPlugin<TOpts>`, `FileClassification`
- `src/plugin/raw-to-jpeg.ts` — RAW/HEIC/TIFF decoder plugin
- `src/plugin/jpeg-compressor.ts` — JPEG/PNG/WebP compressor plugin
- `src/plugin/index.ts` — Barrel

### Browser

- `src/browser/pipeline.ts` — Default browser pipeline + `preloadBrowserPipelineForFiles`
- `src/browser/pipeline-utils.ts` — Options, filename helpers
- `src/browser/allowlist.ts` — Extension/MIME classifiers
- `src/browser/tusUpload.ts` — TUS upload client
- `src/browser/rawDecode.ts` — LibRaw WASM decoder
- `src/browser/optionalDecoders.ts` — HEIC/TIFF runtime imports
- `src/browser/rasterize.ts` — Canvas JPEG conversion

### React

- `src/react/index.ts` — `useMediaUpload` hook
- `src/react/utils.ts` — `Semaphore` utility

### Server

- `src/server/types.ts` — `ServerProcessor` interface
