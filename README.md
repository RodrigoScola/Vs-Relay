# Claude VSCode Bridge

Lets Claude (via MCP) drive a running VSCode instance: read editor/diagnostic state,
open and edit files, run tasks and debug sessions, and trigger UI actions.

## Architecture

```
Claude  <--stdio (MCP)-->  mcp-server  <--WebSocket (localhost)-->  extension  <--VSCode API-->  VSCode
```

- **`shared/`** — protocol types shared by both sides (`RpcRequest`/`RpcResponse`, method table).
- **`extension/`** — a VSCode extension. On activation it starts a WebSocket server on
  `127.0.0.1:4823` (configurable via `claudeBridge.port`) and answers RPC calls using the
  VSCode API.
- **`mcp-server/`** — a standalone MCP server (stdio transport) that connects to the extension's
  WebSocket server and exposes each bridge method as an MCP tool (`vscode_get_open_files`,
  `vscode_apply_edit`, `vscode_run_task`, `vscode_debug_start`, `vscode_execute_command`,
  `vscode_list_commands`, etc.).

The extension must be running (i.e. VSCode open with the workspace loaded) before the MCP server
can do anything — it's a thin client that fails fast with a clear error if it can't connect.

**The extension is self-contained.** At build time, `extension`'s build script bundles all of
`mcp-server` (via esbuild, into `extension/bundled/mcp-server.cjs`) so the packaged `.vsix` doesn't
depend on a separate `npm install`/build of `mcp-server` — it's just `node` + one file. On
activation, the extension automatically adds a `vscode-bridge` entry (pointing at that bundled
file) to `.mcp.json` (Claude Code CLI) and `.vscode/mcp.json` (VSCode's own MCP support, e.g.
Copilot) in every open workspace folder, if one isn't already present — so installing the
extension is normally the *only* setup step; there is nothing to configure by hand. It never
overwrites an existing `vscode-bridge` entry or touches a file it can't parse. Disable this with
`"claudeBridge.autoConfigureMcp": false`.

## Setup

```
npm install
npm run build
```

This builds `shared`, then `extension`, then `mcp-server` in order (they depend on each other via
npm workspaces).

## Running it

1. **Start the extension.** Press `F5` in VSCode (or Run and Debug → "Run Extension (Extension
   Development Host)"). This opens a second VSCode window with the bridge extension active,
   pre-loaded with [`test-workspace/`](test-workspace) — a small scratch folder with a sample
   file and a sample task. `test-workspace/.vscode/mcp.json` was created manually before
   auto-provisioning existed and points at the dev-mode `mcp-server/dist/index.js`; the
   auto-provisioning feature described above only fills in a `vscode-bridge` entry when one is
   *missing*, so it leaves that file alone. Check the extension's status bar item or the "Claude
   VSCode Bridge" output channel to confirm it's listening, then use the MCP/Tools view in that
   window (or Copilot Chat's MCP picker) to start the `vscode-bridge` server and try a tool
   against `test-workspace/src/sample.ts`.
2. **Point an MCP client at the server.** This repo's root already has [`.mcp.json`](.mcp.json)
   configuring `vscode-bridge` for the **Claude Code CLI** — restart Claude Code (or start a fresh
   session) in this directory and it'll show up under `/mcp` (it'll ask for a one-time trust
   approval for the project-scoped server). Note this is a *different* file/format from
   `test-workspace/.vscode/mcp.json`, which is VSCode's own built-in MCP config (used by e.g.
   Copilot Chat) — Claude Code CLI does not read `.vscode/mcp.json`. For Claude Desktop, or any
   other project, add the same shape under `mcpServers` to that tool's config:

   ```json
   {
     "mcpServers": {
       "vscode-bridge": {
         "command": "node",
         "args": ["/absolute/path/to/mcp/mcp-server/dist/index.js"]
       }
     }
   }
   ```

   The server connects to `ws://127.0.0.1:4823` by default; override with the `CLAUDE_BRIDGE_PORT`
   env var if you changed `claudeBridge.port`. Either way, the extension (step 1) must already be
   running or the tool calls will fail with a clear "could not connect" error.

### Testing without a full MCP client

- **`.vscode/launch.json` → "Run Extension + MCP Inspector"** starts the Extension Development
  Host and runs the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against the
  built server, giving you a web UI to call each tool by hand.
- **"Debug MCP Server (stdio)"** launches `mcp-server` under the Node debugger directly, useful
  for stepping through startup/connection logic.
- **`.vscode/tasks.json` → "watch: all"** runs `tsc --watch` for all three packages so edits
  rebuild automatically while the Extension Development Host is open (reload it with
  `Ctrl+R`/`Cmd+R` to pick up changes).

## Testing

```
npm test          # vitest run, across all three packages
npm run test:watch
npm run lint
```

Install the recommended **Vitest** extension (`vitest.explorer`, see `.vscode/extensions.json`) to
get all three packages' suites in the Testing sidebar. The extension package's tests mock the
`vscode` module (`extension/src/test/vscodeMock.ts`) since it only really exists inside the
Extension Host; `mcp-server`'s tests spin up a real in-process WebSocket server and use the MCP
SDK's `InMemoryTransport` to exercise tool registration end-to-end.

## Type/lint strictness

All three packages compile under a shared strict `tsconfig.base.json` (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, etc.) and are linted with
`typescript-eslint`'s `strictTypeChecked` + `stylisticTypeChecked` rule sets
(`eslint.config.mjs`). Optional fields in `shared/src/index.ts` are typed as `T | undefined`
rather than bare `T` so they satisfy `exactOptionalPropertyTypes` when explicit `undefined` is
passed through from zod-parsed tool arguments.

## Adding a new capability

1. Add the method to `Methods` in `shared/src/index.ts` (params/result types).
2. Implement it in `extension/src/handlers.ts`.
3. Expose it as a tool in `mcp-server/src/tools.ts` with a zod input schema.

## Packaging the extension

```
npm run package --workspace=extension
```

Produces a `.vsix` you can install via "Extensions: Install from VSIX...".
