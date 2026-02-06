import { Tool } from "./base";

export class MessageTool extends Tool {
  name = "message";
  description = "Send a message (not implemented).";
  parameters = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };

  async execute() {
    return "message tool not implemented";
  }
}
