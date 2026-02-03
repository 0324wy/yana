import fs from "node:fs/promises";
import path from "node:path";

export async function readText(filePath: string) {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}
