import { describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { resolveUri, severityToString, toSharedPosition, toSharedRange, toVscodePosition, toVscodeRange } from "./convert";

describe("position/range conversion", () => {
  it("round-trips a position through the shared representation", () => {
    const original = new vscode.Position(3, 7);
    const shared = toSharedPosition(original);
    expect(shared).toEqual({ line: 3, character: 7 });

    const back = toVscodePosition(shared);
    expect(back.line).toBe(3);
    expect(back.character).toBe(7);
  });

  it("round-trips a range through the shared representation", () => {
    const original = new vscode.Range(new vscode.Position(1, 0), new vscode.Position(2, 5));
    const shared = toSharedRange(original);
    expect(shared).toEqual({ start: { line: 1, character: 0 }, end: { line: 2, character: 5 } });

    const back = toVscodeRange(shared);
    expect(back.start.line).toBe(1);
    expect(back.end.character).toBe(5);
  });
});

describe("severityToString", () => {
  it("maps each VSCode diagnostic severity to its string form", () => {
    expect(severityToString(vscode.DiagnosticSeverity.Error)).toBe("error");
    expect(severityToString(vscode.DiagnosticSeverity.Warning)).toBe("warning");
    expect(severityToString(vscode.DiagnosticSeverity.Information)).toBe("information");
    expect(severityToString(vscode.DiagnosticSeverity.Hint)).toBe("hint");
  });
});

describe("resolveUri", () => {
  it("treats plain paths as filesystem paths", () => {
    expect(resolveUri("C:/repo/file.ts").fsPath).toBe("C:/repo/file.ts");
  });

  it("parses file:// URIs", () => {
    expect(resolveUri("file:///C:/repo/file.ts").fsPath).toBe("/C:/repo/file.ts");
  });
});
