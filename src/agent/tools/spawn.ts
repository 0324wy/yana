import { Tool } from "./base";

export class SpawnTool extends Tool {
  name = "spawn";
  description = "Spawn a process (not implemented).";
  parameters = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };

  async execute() {
    return "spawn tool not implemented";
  }
}
