import * as vscode from "vscode";
import type { Position, Range as SharedRange } from "@agents-vscode/shared";

export function toSharedPosition(p: vscode.Position): Position {
  return { line: p.line, character: p.character };
}

export function toSharedRange(r: vscode.Range): SharedRange {
  return { start: toSharedPosition(r.start), end: toSharedPosition(r.end) };
}

export function toVscodePosition(p: Position): vscode.Position {
  return new vscode.Position(p.line, p.character);
}

export function toVscodeRange(r: SharedRange): vscode.Range {
  return new vscode.Range(toVscodePosition(r.start), toVscodePosition(r.end));
}

export function severityToString(
  s: vscode.DiagnosticSeverity,
): "error" | "warning" | "information" | "hint" {
  switch (s) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "information";
    default:
      return "hint";
  }
}

export function resolveUri(path: string): vscode.Uri {
  // Accept absolute filesystem paths (and file:// URIs) from the MCP client.
  if (path.startsWith("file://")) {
    return vscode.Uri.parse(path);
  }
  return vscode.Uri.file(path);
}
