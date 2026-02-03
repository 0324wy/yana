import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { Tool } from "./base";
import { Policy } from "../policy";

const execAsync = promisify(execCb);

export class ExecTool extends Tool {
  name = "exec";
  description = "Run a shell command on the local machine.";
  parameters = {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Shell command to run" },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds (default 30000)",
      },
    },
    required: ["cmd"],
  };

  constructor(private policy: Policy) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const cmd = String(params.cmd ?? "");
    if (!cmd) throw new Error("Missing required parameter: cmd");

    const bin = cmd.trim().split(/\s+/)[0];
    this.policy.assertCanExec(bin);

    const timeoutMs = Number(params.timeoutMs ?? 30000);
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return JSON.stringify({ stdout, stderr });
  }
}
