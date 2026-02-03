import fs from "node:fs/promises";
import path from "node:path";
import { Tool } from "./base";
import { Policy } from "../policy";

export class ReadFileTool extends Tool {
  name = "read_file";
  description = "Read a UTF-8 text file from disk.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
    },
    required: ["path"],
  };

  constructor(private policy: Policy) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const filePath = String(params.path ?? "");
    if (!filePath) throw new Error("Missing required parameter: path");
    this.policy.assertCanRead(filePath);
    return fs.readFile(filePath, "utf8");
  }
}

export class ListDirTool extends Tool {
  name = "list_dir";
  description = "List files and folders in a directory.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory" },
    },
    required: ["path"],
  };

  constructor(private policy: Policy) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const dirPath = String(params.path ?? "");
    if (!dirPath) throw new Error("Missing required parameter: path");
    this.policy.assertCanRead(dirPath);

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other",
    }));

    return JSON.stringify(result);
  }
}

export class WriteFileTool extends Tool {
  name = "write_file";
  description = "Write a UTF-8 text file to disk.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
      content: { type: "string", description: "File contents" },
    },
    required: ["path", "content"],
  };

  constructor(private policy: Policy) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const filePath = String(params.path ?? "");
    if (!filePath) throw new Error("Missing required parameter: path");
    const content = String(params.content ?? "");
    this.policy.assertCanWrite(filePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return `Wrote ${filePath}`;
  }
}

export class EditFileTool extends Tool {
  name = "edit_file";
  description = "Replace the contents of a UTF-8 text file.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
      content: { type: "string", description: "New file contents" },
    },
    required: ["path", "content"],
  };

  constructor(private policy: Policy) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const filePath = String(params.path ?? "");
    if (!filePath) throw new Error("Missing required parameter: path");
    const content = String(params.content ?? "");
    this.policy.assertCanWrite(filePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return `Edited ${filePath}`;
  }
}
