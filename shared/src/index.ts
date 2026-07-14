export const DEFAULT_PORT = 4823;
export const PROTOCOL_VERSION = 1;

export interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { message: string; code?: string };
}

export interface HelloMessage {
  type: "hello";
  protocolVersion: number;
  workspaceName?: string;
  workspaceFolders: string[];
}

// ---- Shared domain types ----

export interface Position {
  line: number; // 0-based
  character: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextEditOp {
  range: Range;
  newText: string;
}

export interface OpenFileInfo {
  path: string;
  languageId: string;
  isDirty: boolean;
  isActive: boolean;
  visibleRanges?: Range[];
}

export interface DiagnosticInfo {
  path: string;
  range: Range;
  message: string;
  severity: "error" | "warning" | "information" | "hint";
  source?: string;
  code?: string | number;
}

export interface SelectionInfo {
  path: string;
  selections: Range[];
  selectedText: string[];
}

export interface SymbolInfo {
  name: string;
  kind: string;
  path: string;
  range: Range;
  containerName?: string;
}

export interface TaskInfo {
  name: string;
  source: string;
  detail?: string;
}

export interface DebugSessionInfo {
  id: string;
  name: string;
  type: string;
}

export interface TerminalInfo {
  name: string;
  isActive: boolean;
  processId?: number;
}

export interface CommandInfo {
  id: string;
  title?: string;
  category?: string;
}

// ---- Method params/results ----

export interface Methods {
  "editor/getOpenFiles": { params: undefined; result: { files: OpenFileInfo[] } };
  "editor/getActiveEditor": { params: undefined; result: { file: OpenFileInfo | null } };
  "editor/getSelection": { params: { path?: string | undefined }; result: SelectionInfo | null };
  "editor/getDiagnostics": { params: { path?: string | undefined }; result: { diagnostics: DiagnosticInfo[] } };
  "editor/getWorkspaceSymbols": { params: { query: string }; result: { symbols: SymbolInfo[] } };
  "editor/getFileContent": { params: { path: string }; result: { content: string } };

  "file/open": { params: { path: string; preview?: boolean | undefined }; result: { opened: boolean } };
  "file/applyEdit": { params: { path: string; edits: TextEditOp[] }; result: { applied: boolean } };
  "file/create": {
    params: { path: string; content?: string | undefined; overwrite?: boolean | undefined };
    result: { created: boolean };
  };
  "file/delete": { params: { path: string; useTrash?: boolean | undefined }; result: { deleted: boolean } };
  "file/rename": {
    params: { oldPath: string; newPath: string; overwrite?: boolean | undefined };
    result: { renamed: boolean };
  };
  "file/goToLocation": { params: { path: string; position: Position }; result: { moved: boolean } };

  "run/getTasks": { params: undefined; result: { tasks: TaskInfo[] } };
  "run/runTask": { params: { name: string }; result: { started: boolean } };
  "debug/start": {
    params: { configName?: string | undefined; workspaceFolder?: string | undefined };
    result: { started: boolean };
  };
  "debug/stop": { params: { sessionId?: string | undefined }; result: { stopped: boolean } };
  "debug/getSessions": { params: undefined; result: { sessions: DebugSessionInfo[] } };
  "terminal/list": { params: undefined; result: { terminals: TerminalInfo[] } };
  "terminal/getOutput": {
    params: { name?: string | undefined; maxLines?: number | undefined };
    result: { output: string };
  };
  "terminal/run": { params: { name?: string | undefined; command: string }; result: { sent: boolean } };

  "ui/showMessage": {
    params: { message: string; kind?: "info" | "warning" | "error" | undefined; items?: string[] | undefined };
    result: { selected: string | null };
  };
  "ui/showQuickPick": {
    params: { items: string[]; placeholder?: string | undefined };
    result: { selected: string | null };
  };
  "ui/executeCommand": { params: { command: string; args?: unknown[] | undefined }; result: { result: unknown } };
  "ui/listCommands": { params: { query?: string | undefined }; result: { commands: CommandInfo[] } };
}

export type MethodName = keyof Methods;
export type MethodParams<M extends MethodName> = Methods[M]["params"];
export type MethodResult<M extends MethodName> = Methods[M]["result"];
