import path from "node:path";

function isSubpath(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class Policy {
  private readAllowlist: string[];
  private writeAllowlist: string[];
  private execAllowlist: string[];
  private readOnly: boolean;
  private allowAllExec: boolean;

  constructor(options?: {
    readAllowlist?: string[];
    writeAllowlist?: string[];
    execAllowlist?: string[];
    readOnly?: boolean;
  }) {
    this.readAllowlist = (options?.readAllowlist ?? []).map((p) => path.resolve(p));
    this.writeAllowlist = (options?.writeAllowlist ?? []).map((p) => path.resolve(p));
    const rawExecAllowlist = options?.execAllowlist ?? [];
    this.allowAllExec = rawExecAllowlist.includes("*");
    this.execAllowlist = rawExecAllowlist
      .filter((p) => p !== "*")
      .map((p) => path.resolve(p));
    this.readOnly = options?.readOnly ?? false;
  }

  canRead(filePath: string) {
    if (this.readAllowlist.length === 0) return false;
    const resolved = path.resolve(filePath);
    return this.readAllowlist.some((root) => isSubpath(root, resolved));
  }

  assertCanRead(filePath: string) {
    if (!this.canRead(filePath)) {
      throw new Error(`Read denied by policy: ${filePath}`);
    }
  }

  canWrite(filePath: string) {
    if (this.readOnly) return false;
    if (this.writeAllowlist.length === 0) return false;
    const resolved = path.resolve(filePath);
    return this.writeAllowlist.some((root) => isSubpath(root, resolved));
  }

  assertCanWrite(filePath: string) {
    if (!this.canWrite(filePath)) {
      throw new Error(`Write denied by policy: ${filePath}`);
    }
  }

  canExec(command: string) {
    if (this.readOnly) return false;
    if (this.allowAllExec) return true;
    if (this.execAllowlist.length === 0) return false;
    const resolved = path.resolve(command);
    return this.execAllowlist.some((root) => isSubpath(root, resolved));
  }

  assertCanExec(command: string) {
    if (!this.canExec(command)) {
      throw new Error(`Exec denied by policy: ${command}`);
    }
  }
}
