import fs from "node:fs/promises";
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
    this.policy.assertCanRead(filePath);
    return fs.readFile(filePath, "utf8");
  }
}
