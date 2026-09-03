import * as vscode from "vscode";
import type {
  CommandInfo,
  DebugSessionInfo,
  DiagnosticInfo,
  MethodName,
  MethodParams,
  MethodResult,
  OpenFileInfo,
  SymbolInfo,
  TaskInfo,
  TerminalInfo,
  TextEditOp,
} from "@agents-vscode/shared";
import {
  resolveUri,
  severityToString,
  toSharedRange,
  toVscodePosition,
  toVscodeRange,
} from "./convert";
import type { BridgeState } from "./state";

export type Handlers = {
  [M in MethodName]: (params: MethodParams<M>) => Promise<MethodResult<M>>;
};

function requireActiveEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("No active editor.");
  }
  return editor;
}

function findEditorForPath(path: string): vscode.TextEditor | undefined {
  const uri = resolveUri(path);
  return vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.fsPath === uri.fsPath,
  );
}

function toOpenFileInfo(
  document: vscode.TextDocument,
  activeUri: vscode.Uri | undefined,
): OpenFileInfo {
  return {
    path: document.uri.fsPath,
    languageId: document.languageId,
    isDirty: document.isDirty,
    isActive: document.uri.fsPath === activeUri?.fsPath,
  };
}

function diagnosticsForEntry(
  uri: vscode.Uri,
  diagnostics: readonly vscode.Diagnostic[],
): DiagnosticInfo[] {
  return diagnostics.map((diagnostic) => {
    const info: DiagnosticInfo = {
      path: uri.fsPath,
      range: toSharedRange(diagnostic.range),
      message: diagnostic.message,
      severity: severityToString(diagnostic.severity),
    };
    if (diagnostic.source !== undefined) {
      info.source = diagnostic.source;
    }
    if (diagnostic.code !== undefined) {
      info.code =
        typeof diagnostic.code === "object"
          ? diagnostic.code.value
          : diagnostic.code;
    }
    return info;
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function titleFromContribution(rawTitle: unknown): string | undefined {
  if (typeof rawTitle === "string") {
    return rawTitle;
  }
  const record = asRecord(rawTitle);
  const value = record?.["value"];
  return typeof value === "string" ? value : undefined;
}

function commandsFromExtension(
  extension: vscode.Extension<unknown>,
): CommandInfo[] {
  const contributes = asRecord(
    asRecord(extension.packageJSON)?.["contributes"],
  );
  const rawCommands = contributes?.["commands"];
  if (!Array.isArray(rawCommands)) {
    return [];
  }

  const result: CommandInfo[] = [];
  for (const entry of rawCommands) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const id = record["command"];
    if (typeof id !== "string") {
      continue;
    }
    const info: CommandInfo = { id };
    const title = titleFromContribution(record["title"]);
    if (title !== undefined) {
      info.title = title;
    }
    const category = record["category"];
    if (typeof category === "string") {
      info.category = category;
    }
    result.push(info);
  }
  return result;
}

function matchesQuery(command: CommandInfo, query: string): boolean {
  const haystack =
    `${command.id} ${command.title ?? ""} ${command.category ?? ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function createHandlers(state: BridgeState): Handlers {
  return {
    "editor/getOpenFiles": async () => {
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const files = vscode.workspace.textDocuments
        .filter((document) => document.uri.scheme === "file")
        .map((document) => toOpenFileInfo(document, activeUri));
      return { files };
    },

    "editor/getActiveEditor": async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.uri.scheme !== "file") {
        return { file: null };
      }
      return { file: toOpenFileInfo(editor.document, editor.document.uri) };
    },

    "editor/getSelection": async (params) => {
      const editor =
        params.path !== undefined
          ? findEditorForPath(params.path)
          : vscode.window.activeTextEditor;
      if (!editor) {
        return null;
      }
      return {
        path: editor.document.uri.fsPath,
        selections: editor.selections.map((selection) =>
          toSharedRange(selection),
        ),
        selectedText: editor.selections.map((selection) =>
          editor.document.getText(selection),
        ),
      };
    },

    "editor/getDiagnostics": async (params) => {
      if (params.path !== undefined) {
        const uri = resolveUri(params.path);
        return {
          diagnostics: diagnosticsForEntry(
            uri,
            vscode.languages.getDiagnostics(uri),
          ),
        };
      }
      const all = vscode.languages.getDiagnostics();
      const diagnostics: DiagnosticInfo[] = [];
      for (const [uri, uriDiagnostics] of all) {
        diagnostics.push(...diagnosticsForEntry(uri, uriDiagnostics));
      }
      return { diagnostics };
    },

    "editor/getWorkspaceSymbols": async (params) => {
      const results = await vscode.commands.executeCommand<
        vscode.SymbolInformation[] | undefined
      >("vscode.executeWorkspaceSymbolProvider", params.query);
      const symbols: SymbolInfo[] = (results ?? []).map((symbol) => {
        const info: SymbolInfo = {
          name: symbol.name,
          kind: vscode.SymbolKind[symbol.kind],
          path: symbol.location.uri.fsPath,
          range: toSharedRange(symbol.location.range),
        };
        if (symbol.containerName !== "") {
          info.containerName = symbol.containerName;
        }
        return info;
      });
      return { symbols };
    },

    "editor/getFileContent": async (params) => {
      const uri = resolveUri(params.path);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return { content: Buffer.from(bytes).toString("utf8") };
    },

    "file/open": async (params) => {
      const uri = resolveUri(params.path);
      await vscode.window.showTextDocument(uri, {
        preview: params.preview ?? false,
      });
      return { opened: true };
    },

    "file/applyEdit": async (params) => {
      const uri = resolveUri(params.path);
      const workspaceEdit = new vscode.WorkspaceEdit();
      const edits: TextEditOp[] = params.edits;
      workspaceEdit.set(
        uri,
        edits.map((edit) =>
          vscode.TextEdit.replace(toVscodeRange(edit.range), edit.newText),
        ),
      );
      const applied = await vscode.workspace.applyEdit(workspaceEdit);
      return { applied };
    },

    "file/create": async (params) => {
      const uri = resolveUri(params.path);
      if (params.overwrite !== true) {
        try {
          await vscode.workspace.fs.stat(uri);
          throw new Error(`File already exists: ${params.path}`);
        } catch (error) {
          if (!(error instanceof vscode.FileSystemError)) {
            throw error;
          }
        }
      }
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(params.content ?? "", "utf8"),
      );
      return { created: true };
    },

    "file/delete": async (params) => {
      const uri = resolveUri(params.path);
      await vscode.workspace.fs.delete(uri, {
        useTrash: params.useTrash ?? true,
        recursive: true,
      });
      return { deleted: true };
    },

    "file/rename": async (params) => {
      const oldUri = resolveUri(params.oldPath);
      const newUri = resolveUri(params.newPath);
      await vscode.workspace.fs.rename(oldUri, newUri, {
        overwrite: params.overwrite ?? false,
      });
      return { renamed: true };
    },

    "file/goToLocation": async (params) => {
      const uri = resolveUri(params.path);
      const editor = await vscode.window.showTextDocument(uri);
      const position = toVscodePosition(params.position);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter,
      );
      return { moved: true };
    },

    "run/getTasks": async () => {
      const tasks = await vscode.tasks.fetchTasks();
      const taskInfos: TaskInfo[] = tasks.map((task) => {
        const info: TaskInfo = { name: task.name, source: task.source };
        if (task.detail !== undefined) {
          info.detail = task.detail;
        }
        return info;
      });
      return { tasks: taskInfos };
    },

    "run/runTask": async (params) => {
      const tasks = await vscode.tasks.fetchTasks();
      const task = tasks.find((candidate) => candidate.name === params.name);
      if (!task) {
        throw new Error(`No task named "${params.name}" was found.`);
      }
      await vscode.tasks.executeTask(task);
      return { started: true };
    },

    "debug/start": async (params) => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const folder =
        params.workspaceFolder !== undefined
          ? folders.find(
              (candidate) => candidate.name === params.workspaceFolder,
            )
          : folders[0];
      const started = await vscode.debug.startDebugging(
        folder,
        params.configName ?? "",
      );
      return { started };
    },

    "debug/stop": async (params) => {
      const session =
        params.sessionId !== undefined
          ? state.findDebugSession(params.sessionId)
          : vscode.debug.activeDebugSession;
      if (!session) {
        return { stopped: false };
      }
      await vscode.debug.stopDebugging(session);
      return { stopped: true };
    },

    "debug/getSessions": async () => {
      const sessions: DebugSessionInfo[] = state
        .listDebugSessions()
        .map((session) => ({
          id: session.id,
          name: session.name,
          type: session.type,
        }));
      return { sessions };
    },

    "terminal/list": async () => {
      const terminals = await Promise.all(
        vscode.window.terminals.map(async (terminal): Promise<TerminalInfo> => {
          const processId = await terminal.processId;
          const info: TerminalInfo = {
            name: terminal.name,
            isActive: terminal === vscode.window.activeTerminal,
          };
          if (processId !== undefined) {
            info.processId = processId;
          }
          return info;
        }),
      );
      return { terminals };
    },

    "terminal/getOutput": async (params) => {
      const name = params.name ?? vscode.window.activeTerminal?.name;
      if (name === undefined) {
        return { output: "" };
      }
      const output = state.getTerminalOutput(name) ?? "";
      if (params.maxLines === undefined) {
        return { output };
      }
      const lines = output.split("\n");
      return {
        output: lines
          .slice(Math.max(0, lines.length - params.maxLines))
          .join("\n"),
      };
    },

    "terminal/run": async (params) => {
      const name = params.name ?? "VS Relay";
      let terminal = vscode.window.terminals.find(
        (candidate) => candidate.name === name,
      );
      terminal ??= vscode.window.createTerminal(name);
      terminal.show();

      if (terminal.shellIntegration) {
        const execution = terminal.shellIntegration.executeCommand(
          params.command,
        );
        void (async () => {
          for await (const chunk of execution.read()) {
            state.appendTerminalOutput(name, chunk);
          }
        })();
      } else {
        terminal.sendText(params.command);
      }
      return { sent: true };
    },

    "ui/showMessage": async (params) => {
      const items = params.items ?? [];
      const kind = params.kind ?? "info";
      let selected: string | undefined;
      if (kind === "warning") {
        selected = await vscode.window.showWarningMessage(
          params.message,
          ...items,
        );
      } else if (kind === "error") {
        selected = await vscode.window.showErrorMessage(
          params.message,
          ...items,
        );
      } else {
        selected = await vscode.window.showInformationMessage(
          params.message,
          ...items,
        );
      }
      return { selected: selected ?? null };
    },

    "ui/showQuickPick": async (params) => {
      const options: vscode.QuickPickOptions = {};
      if (params.placeholder !== undefined) {
        options.placeHolder = params.placeholder;
      }
      const selected: string | undefined = await vscode.window.showQuickPick(
        params.items,
        options,
      );
      return { selected: selected ?? null };
    },

    "ui/executeCommand": async (params) => {
      const result = await vscode.commands.executeCommand(
        params.command,
        ...(params.args ?? []),
      );
      return { result };
    },

    "ui/listCommands": async (params) => {
      const contributed = new Map<string, CommandInfo>();
      for (const extension of vscode.extensions.all) {
        for (const command of commandsFromExtension(extension)) {
          contributed.set(command.id, command);
        }
      }

      const registeredIds = new Set(await vscode.commands.getCommands(true));
      const commands = Array.from(contributed.values())
        .filter((command) => registeredIds.has(command.id))
        .sort((a, b) => a.id.localeCompare(b.id));

      const { query } = params;
      const filtered =
        query !== undefined
          ? commands.filter((command) => matchesQuery(command, query))
          : commands;
      return { commands: filtered };
    },
  };
}

export function requireEditorForDocs(): vscode.TextEditor {
  return requireActiveEditor();
}
