import { Tool } from "./base";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  get(name: string) {
    return this.tools.get(name);
  }

  getDefinitions() {
    return Array.from(this.tools.values()).map((tool) => tool.toSchema());
  }

  async execute(name: string, params: Record<string, unknown>) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params);
  }
}
