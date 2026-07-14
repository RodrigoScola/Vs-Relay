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

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri([base.fsPath, ...segments].join("/").replace(/\/+/g, "/"));
  }
}

export class FileSystemError extends Error {}

const mockFiles = new Map<string, Uint8Array>();
const mockDirectories = new Set<string>();
let mockConfig: Record<string, unknown> = {};
let mockWorkspaceFolders: { uri: Uri; name: string; index: number }[] | undefined;
let mockShowInformationMessage: (message: string, ...items: string[]) => Promise<string | undefined> = () =>
  Promise.resolve(undefined);

export const __mockControls = {
  reset(): void {
    mockFiles.clear();
    mockDirectories.clear();
    mockConfig = {};
    mockWorkspaceFolders = undefined;
    mockShowInformationMessage = () => Promise.resolve(undefined);
  },
  setFile(uri: Uri, content: string): void {
    mockFiles.set(uri.fsPath, Buffer.from(content, "utf8"));
  },
  getFile(uri: Uri): string | undefined {
    const data = mockFiles.get(uri.fsPath);
    return data ? Buffer.from(data).toString("utf8") : undefined;
  },
  hasDirectory(uri: Uri): boolean {
    return mockDirectories.has(uri.fsPath);
  },
  setWorkspaceFolders(folders: { uri: Uri; name: string; index: number }[]): void {
    mockWorkspaceFolders = folders;
  },
  setConfig(config: Record<string, unknown>): void {
    mockConfig = config;
  },
  setShowInformationMessage(impl: (message: string, ...items: string[]) => Promise<string | undefined>): void {
    mockShowInformationMessage = impl;
  },
};

export const workspace = {
  get workspaceFolders(): { uri: Uri; name: string; index: number }[] | undefined {
    return mockWorkspaceFolders;
  },
  getConfiguration(_section?: string): { get: (key: string) => unknown } {
    return { get: (key: string): unknown => mockConfig[key] };
  },
  fs: {
    readFile(uri: Uri): Promise<Uint8Array> {
      const data = mockFiles.get(uri.fsPath);
      if (!data) {
        return Promise.reject(new FileSystemError("FileNotFound"));
      }
      return Promise.resolve(data);
    },
    writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      mockFiles.set(uri.fsPath, content);
      return Promise.resolve();
    },
    createDirectory(uri: Uri): Promise<void> {
      mockDirectories.add(uri.fsPath);
      return Promise.resolve();
    },
  },
};

export const window = {
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return mockShowInformationMessage(message, ...items);
  },
};
