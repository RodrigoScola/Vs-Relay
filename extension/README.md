# VS Relay

Give agents hands inside your editor.

This extension exposes your running VSCode workspace to agents over MCP, so agents can read
editor/diagnostic state, open and edit files, run tasks, drive the debugger, and trigger UI
actions — instead of just editing files blind from the terminal.

## What agents can do with it

- **See what you see** — open files, active editor, current selection, diagnostics (errors/warnings),
  workspace symbol search.
- **Edit and manage files** — apply edits, create/delete/rename files, open a file and jump straight
  to a location (so you can watch the change land).
- **Run and debug** — list and run tasks, start/stop debug sessions, list active sessions.
- **Use the terminal** — list terminals, read output, run commands in a named terminal.
- **Drive the UI** — show messages and quick picks, execute any VSCode command by ID, list commands
  to discover the right one.

Once installed, these show up as `vscode_*` tools in agent clients, or any other
MCP-compatible client — no manual tool wiring required.

## Setup

Install the extension, then open the folder you want agents to work in. That's it.

On activation, the extension:

1. Starts a local WebSocket server (`127.0.0.1:4823` by default) that answers editor/file/run/debug
   requests using the VSCode API.
2. Spawns its own bundled MCP server alongside it.
3. Automatically adds a `vs-relay` entry to `.mcp.json` (agent clients) and
   `.vscode/mcp.json` (VSCode's built-in MCP support, e.g. Copilot Chat) in every open workspace
   folder, if one isn't already present.

Nothing else needs to be configured by hand. Restart your agent client (or start a fresh session) in the
workspace and `vs-relay` will show up under `/mcp`.

The extension must stay running (i.e. the workspace open in VSCode) for tool calls to work — if
it's not, agents get a clear "could not connect" error instead of hanging.

### Using it with another MCP client

Point the client at the extension's bundled server:

```json
{
  "mcpServers": {
    "vs-relay": {
      "command": "node",
      "args": [
        "/absolute/path/to/.vscode/extensions/<vs-relay-version>/bundled/mcp-server.cjs"
      ]
    }
  }
}
```

Or install `agents-vscode-mcp-server` from npm and run it directly; it connects to
`ws://127.0.0.1:4823` by default, overridable with the `VS_RELAY_PORT` environment variable if
you changed `vsRelay.port` below.

## Settings

| Setting                    | Default | Description                                                                                                                 |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `vsRelay.port`             | `4823`  | Port the bridge WebSocket server listens on.                                                                                |
| `vsRelay.mcpHttpPort`      | `4824`  | Port the bundled MCP server's HTTP endpoint listens on.                                                                     |
| `vsRelay.autoConfigureMcp` | `true`  | Automatically add a `vs-relay` entry to `.mcp.json` / `.vscode/mcp.json` on activation. Never overwrites an existing entry. |

## Commands

- **VS Relay: Restart Server** — restart the WebSocket/MCP server without reloading the window.
- **VS Relay: Show Status** — check whether the bridge is listening and on which port.

## How it works

```
Agents  <--stdio/HTTP (MCP)-->  bundled MCP server  <--WebSocket (localhost)-->  extension  <--VSCode API-->  VSCode
```

The extension is self-contained: the MCP server ships bundled inside the `.vsix`, so there's
nothing separate to install or build — just the extension.

## Troubleshooting

- **"Could not connect" errors from agents** — the extension isn't active in any open VSCode
  window. Open the workspace in VSCode and check **VS Relay: Show Status**.
- **Port already in use** — another instance (or another app) is bound to `4823`/`4824`. Change
  `vsRelay.port` / `vsRelay.mcpHttpPort` in settings and reload.
- **`vs-relay` entry missing from `/mcp`** — check `vsRelay.autoConfigureMcp` is `true`,
  or add the entry manually as shown above.
