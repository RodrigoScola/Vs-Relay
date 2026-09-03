import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiagnosticInfo } from "@agents-vscode/shared";
import type { BridgeClient } from "./wsClient.js";

const positionSchema = z.object({
  line: z.number().int().min(0).describe("0-based line number"),
  character: z.number().int().min(0).describe("0-based character offset"),
});

const rangeSchema = z.object({
  start: positionSchema,
  end: positionSchema,
});

const textEditSchema = z.object({
  range: rangeSchema,
  newText: z.string(),
});

function textResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function confirm(
  ok: boolean,
  whenTrue: string,
  whenFalse: string,
): { content: { type: "text"; text: string }[] } {
  return textResult(ok ? whenTrue : whenFalse);
}

function formatDiagnostics(result: { diagnostics: DiagnosticInfo[] }): {
  content: { type: "text"; text: string }[];
} {
  if (result.diagnostics.length === 0) {
    return textResult("No diagnostics.");
  }
  const lines = result.diagnostics.map((diagnostic) => {
    const line = diagnostic.range.start.line + 1;
    const character = diagnostic.range.start.character + 1;
    const source =
      diagnostic.source !== undefined ? `${diagnostic.source}: ` : "";
    return `${diagnostic.path}:${String(line)}:${String(character)} [${diagnostic.severity}] ${source}${diagnostic.message}`;
  });
  return textResult(lines.join("\n"));
}

export function registerTools(server: McpServer, client: BridgeClient): void {
  server.registerTool(
    "vscode_get_open_files",
    {
      description:
        "List files currently open in the VSCode editor, with dirty/active state.",
      inputSchema: {},
    },
    async () => textResult(await client.call("editor/getOpenFiles", undefined)),
  );

  server.registerTool(
    "vscode_get_active_editor",
    {
      description:
        "Get the file currently focused in the VSCode editor, or null if none.",
      inputSchema: {},
    },
    async () =>
      textResult(await client.call("editor/getActiveEditor", undefined)),
  );

  server.registerTool(
    "vscode_get_selection",
    {
      description:
        "Get the current text selection(s) in a file. Uses the active editor if no path is given.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Absolute path of the file. Defaults to the active editor.",
          ),
      },
    },
    async ({ path }) =>
      textResult(await client.call("editor/getSelection", { path })),
  );

  server.registerTool(
    "vscode_get_diagnostics",
    {
      description:
        "Get compiler/linter diagnostics (errors, warnings) for a file, or the whole workspace if no path is given.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Absolute path of the file. Omit for all open diagnostics.",
          ),
      },
    },
    async ({ path }) =>
      formatDiagnostics(await client.call("editor/getDiagnostics", { path })),
  );

  server.registerTool(
    "vscode_get_workspace_symbols",
    {
      description:
        "Search workspace-wide symbols (functions, classes, etc.) by name.",
      inputSchema: { query: z.string().describe("Symbol name or fuzzy query") },
    },
    async ({ query }) =>
      textResult(await client.call("editor/getWorkspaceSymbols", { query })),
  );

  server.registerTool(
    "vscode_get_file_content",
    {
      description:
        "Read the current on-disk content of a file via VSCode's filesystem layer.",
      inputSchema: { path: z.string().describe("Absolute path of the file") },
    },
    async ({ path }) =>
      textResult(await client.call("editor/getFileContent", { path })),
  );

  server.registerTool(
    "vscode_open_file",
    {
      description: "Open a file in the VSCode editor.",
      inputSchema: {
        path: z.string().describe("Absolute path of the file to open"),
        preview: z
          .boolean()
          .optional()
          .describe(
            "Open in preview (single-use) tab mode. Defaults to false.",
          ),
      },
    },
    async ({ path, preview }) => {
      const { opened } = await client.call("file/open", { path, preview });
      return confirm(opened, `Opened ${path}.`, `Could not open ${path}.`);
    },
  );

  server.registerTool(
    "vscode_apply_edit",
    {
      description:
        "Apply one or more text edits to a file through VSCode's editor (supports undo, respects unsaved state).",
      inputSchema: {
        path: z.string().describe("Absolute path of the file to edit"),
        edits: z
          .array(textEditSchema)
          .min(1)
          .describe("List of range replacements to apply"),
      },
    },
    async ({ path, edits }) => {
      const { applied } = await client.call("file/applyEdit", { path, edits });
      return confirm(
        applied,
        `Applied ${String(edits.length)} edit(s) to ${path}.`,
        `Failed to apply edits to ${path}.`,
      );
    },
  );

  server.registerTool(
    "vscode_create_file",
    {
      description: "Create a new file with optional content.",
      inputSchema: {
        path: z.string().describe("Absolute path of the file to create"),
        content: z
          .string()
          .optional()
          .describe("Initial file content. Defaults to empty."),
        overwrite: z
          .boolean()
          .optional()
          .describe("Overwrite if the file already exists. Defaults to false."),
      },
    },
    async ({ path, content, overwrite }) => {
      const { created } = await client.call("file/create", {
        path,
        content,
        overwrite,
      });
      return confirm(created, `Created ${path}.`, `Could not create ${path}.`);
    },
  );

  server.registerTool(
    "vscode_delete_file",
    {
      description: "Delete a file or directory.",
      inputSchema: {
        path: z.string().describe("Absolute path to delete"),
        useTrash: z
          .boolean()
          .optional()
          .describe(
            "Send to OS trash instead of permanent delete. Defaults to true.",
          ),
      },
    },
    async ({ path, useTrash }) => {
      const { deleted } = await client.call("file/delete", { path, useTrash });
      return confirm(deleted, `Deleted ${path}.`, `Could not delete ${path}.`);
    },
  );

  server.registerTool(
    "vscode_rename_file",
    {
      description: "Rename or move a file.",
      inputSchema: {
        oldPath: z.string().describe("Current absolute path"),
        newPath: z.string().describe("New absolute path"),
        overwrite: z
          .boolean()
          .optional()
          .describe("Overwrite destination if it exists. Defaults to false."),
      },
    },
    async ({ oldPath, newPath, overwrite }) => {
      const { renamed } = await client.call("file/rename", {
        oldPath,
        newPath,
        overwrite,
      });
      return confirm(
        renamed,
        `Renamed ${oldPath} to ${newPath}.`,
        `Could not rename ${oldPath}.`,
      );
    },
  );

  server.registerTool(
    "vscode_go_to_location",
    {
      description:
        "Open a file and move the cursor/selection to a specific position.",
      inputSchema: {
        path: z.string().describe("Absolute path of the file"),
        position: positionSchema,
      },
    },
    async ({ path, position }) => {
      const { moved } = await client.call("file/goToLocation", {
        path,
        position,
      });
      return confirm(
        moved,
        `Moved cursor to ${path}:${String(position.line + 1)}:${String(position.character + 1)}.`,
        `Could not move cursor in ${path}.`,
      );
    },
  );

  server.registerTool(
    "vscode_get_tasks",
    {
      description:
        "List tasks defined in the workspace (from tasks.json and task providers).",
      inputSchema: {},
    },
    async () => textResult(await client.call("run/getTasks", undefined)),
  );

  server.registerTool(
    "vscode_run_task",
    {
      description: "Run a workspace task by name.",
      inputSchema: {
        name: z
          .string()
          .describe("Exact task name as returned by vscode_get_tasks"),
      },
    },
    async ({ name }) => {
      const { started } = await client.call("run/runTask", { name });
      return confirm(
        started,
        `Started task "${name}".`,
        `Could not start task "${name}".`,
      );
    },
  );

  server.registerTool(
    "vscode_debug_start",
    {
      description: "Start a debug session using a launch configuration.",
      inputSchema: {
        configName: z
          .string()
          .optional()
          .describe(
            "Name of the launch configuration. Uses the default if omitted.",
          ),
        workspaceFolder: z
          .string()
          .optional()
          .describe("Workspace folder name, for multi-root workspaces."),
      },
    },
    async ({ configName, workspaceFolder }) => {
      const { started } = await client.call("debug/start", {
        configName,
        workspaceFolder,
      });
      return confirm(
        started,
        "Debug session started.",
        "Debug session did not start.",
      );
    },
  );

  server.registerTool(
    "vscode_debug_stop",
    {
      description: "Stop a debug session.",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe(
            "Session id from vscode_debug_get_sessions. Stops the active one if omitted.",
          ),
      },
    },
    async ({ sessionId }) => {
      const { stopped } = await client.call("debug/stop", { sessionId });
      return confirm(
        stopped,
        "Debug session stopped.",
        "No matching debug session to stop.",
      );
    },
  );

  server.registerTool(
    "vscode_debug_get_sessions",
    {
      description: "List active debug sessions.",
      inputSchema: {},
    },
    async () => textResult(await client.call("debug/getSessions", undefined)),
  );

  server.registerTool(
    "vscode_terminal_list",
    {
      description: "List open integrated terminals.",
      inputSchema: {},
    },
    async () => textResult(await client.call("terminal/list", undefined)),
  );

  server.registerTool(
    "vscode_terminal_get_output",
    {
      description:
        "Get captured output from a terminal that was run via vscode_terminal_run.",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe("Terminal name. Defaults to the active terminal."),
        maxLines: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Only return the last N lines."),
      },
    },
    async ({ name, maxLines }) =>
      textResult(await client.call("terminal/getOutput", { name, maxLines })),
  );

  server.registerTool(
    "vscode_terminal_run",
    {
      description:
        "Run a shell command in an integrated terminal (creates it if needed). Output is captured when shell integration is available.",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe(
            'Terminal name to reuse or create. Defaults to "VS Relay".',
          ),
        command: z.string().describe("Shell command to run"),
      },
    },
    async ({ name, command }) => {
      const { sent } = await client.call("terminal/run", { name, command });
      return confirm(
        sent,
        `Sent to terminal: ${command}`,
        `Could not send command to terminal.`,
      );
    },
  );

  server.registerTool(
    "vscode_show_message",
    {
      description:
        "Show a VSCode notification, optionally with action buttons, and return which one was clicked.",
      inputSchema: {
        message: z.string(),
        kind: z.enum(["info", "warning", "error"]).optional(),
        items: z.array(z.string()).optional().describe("Button labels"),
      },
    },
    async ({ message, kind, items }) => {
      const { selected } = await client.call("ui/showMessage", {
        message,
        kind,
        items,
      });
      return textResult(
        selected !== null
          ? `Clicked: ${selected}`
          : "Dismissed with no selection.",
      );
    },
  );

  server.registerTool(
    "vscode_show_quick_pick",
    {
      description:
        "Show a VSCode quick-pick list and return the selected item.",
      inputSchema: {
        items: z.array(z.string()).min(1),
        placeholder: z.string().optional(),
      },
    },
    async ({ items, placeholder }) => {
      const { selected } = await client.call("ui/showQuickPick", {
        items,
        placeholder,
      });
      return textResult(
        selected !== null
          ? `Selected: ${selected}`
          : "Dismissed with no selection.",
      );
    },
  );

  server.registerTool(
    "vscode_execute_command",
    {
      description:
        "Execute an arbitrary registered VSCode command by id. Escape hatch for actions not covered by other " +
        "tools (git operations, other installed extensions, workbench actions, etc). If you don't already know " +
        "the exact command id, call vscode_list_commands first to find it — don't guess ids from memory.",
      inputSchema: {
        command: z
          .string()
          .describe('VSCode command id, e.g. "workbench.action.files.save"'),
        args: z.array(z.unknown()).optional(),
      },
    },
    async ({ command, args }) =>
      textResult(await client.call("ui/executeCommand", { command, args })),
  );

  server.registerTool(
    "vscode_list_commands",
    {
      description:
        "Search VSCode's live command registry (id, title, category) for every installed extension, including " +
        "built-ins like Git (git.init, git.commit, git.push, ...). Use this to find the exact command id for " +
        "something not covered by the other vscode_* tools, then run it with vscode_execute_command. Always " +
        "pass a query — omitting it returns every palette-visible command in the editor (a very large list).",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Case-insensitive substring match against id/title/category, e.g. "git commit"',
          ),
      },
    },
    async ({ query }) =>
      textResult(await client.call("ui/listCommands", { query })),
  );
}
