export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Function = 11,
  Class = 4,
}

export class Uri {
  private constructor(public readonly fsPath: string) {}

  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(value: string): Uri {
    return new Uri(value.replace(/^file:\/\//, ""));
  }
}

export class FileSystemError extends Error {}
