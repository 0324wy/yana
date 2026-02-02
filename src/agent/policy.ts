import path from "node:path";

function isSubpath(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class Policy {
  private readAllowlist: string[];

  constructor(options?: { readAllowlist?: string[] }) {
    this.readAllowlist = (options?.readAllowlist ?? []).map((p) => path.resolve(p));
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
}
