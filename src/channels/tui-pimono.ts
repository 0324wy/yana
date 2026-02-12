import { AgentLoop, AgentEvent } from "../agent/loop";

export type CreateLoop = () => AgentLoop;

// Dynamic import type - will be loaded at runtime
type PiTuiModule = typeof import("@mariozechner/pi-tui");

export async function runTui(createLoop: CreateLoop) {
  // Dynamic import for ESM compatibility
  const piTui = (await import("@mariozechner/pi-tui")) as PiTuiModule;
  const { TUI, ProcessTerminal, Box, Editor, Markdown, Text, Spacer } = piTui;

  const loop = createLoop();

  // Pi-mono's dark theme colors (same as their coding agent TUI)
  const colors = {
    accent: "#8abeb7", // Teal accent
    border: "#5f87ff", // Blue borders
    borderMuted: "#505050", // Muted borders
    success: "#b5bd68", // Green
    error: "#cc6666", // Red
    warning: "#ffff00", // Yellow
    muted: "#808080", // Gray for muted text
    dim: "#666666", // Dimmer gray
  };

  // Markdown theme for rendering
  const markdownTheme = {
    heading: (text: string) => `\x1b[38;2;240;198;116m${text}\x1b[0m`,
    link: (text: string) => `\x1b[38;2;129;162;190m${text}\x1b[0m`,
    linkUrl: (text: string) => `\x1b[38;2;102;102;102m${text}\x1b[0m`,
    code: (text: string) => `\x1b[38;2;138;190;183m${text}\x1b[0m`,
    codeBlock: (text: string) => `\x1b[38;2;181;189;104m${text}\x1b[0m`,
    codeBlockBorder: (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`,
    quote: (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`,
    quoteBorder: (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`,
    hr: (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`,
    listBullet: (text: string) => `\x1b[38;2;138;190;183m${text}\x1b[0m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
    italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
    underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
    strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
    highlightCode: (code: string) =>
      code.split("\n").map((line) => `\x1b[38;2;181;189;104m${line}\x1b[0m`),
  };

  const editorTheme = {
    borderColor: (text: string) => `\x1b[38;2;80;80;80m${text}\x1b[0m`,
    selectList: {
      selectedPrefix: (text: string) => `\x1b[38;2;138;190;183m${text}\x1b[0m`,
      selectedText: (text: string) => `\x1b[48;2;80;80;80m${text}\x1b[0m`,
      description: (text: string) => `\x1b[38;2;102;102;102m${text}\x1b[0m`,
      scrollInfo: (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`,
      noMatch: (text: string) => `\x1b[38;2;204;102;102m${text}\x1b[0m`,
    },
  };

  // State
  let streamingMarkdown: any | null = null;
  let streamingContent = "";
  let busy = false;

  // Create terminal and TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Create editor
  const editor = new Editor(tui, editorTheme);
  tui.addChild(editor);

  // Set focus to editor
  tui.setFocus(editor);

  // Helper to add separator
  const addSpacer = () => {
    const spacer = new Spacer(1);
    tui.addChild(spacer);
    // Need to insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, children.pop()!); // Move spacer before editor
    }
  };

  // Helper to create user message box
  const addUserMessage = (text: string) => {
    const border = (str: string) => `\x1b[38;2;138;190;183m${str}\x1b[0m`;
    const box = new Box(1, 0, undefined);

    // Add title manually using a text component
    const title = new Text(
      `\x1b[38;2;138;190;183m┌─ You ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const content = new Markdown(text, 0, 0, markdownTheme);
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;138;190;183m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
  };

  // Helper to create assistant message box
  const createAssistantMessage = () => {
    const box = new Box(1, 0, undefined);

    const title = new Text(
      `\x1b[38;2;181;189;104m┌─ Yana ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const content = new Markdown("", 0, 0, markdownTheme);
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;181;189;104m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
    return content;
  };

  // Helper to add tool call box
  const addToolCallBox = (name: string, args: Record<string, unknown>) => {
    const box = new Box(1, 0, undefined);

    const title = new Text(
      `\x1b[38;2;255;255;0m┌─ Tool Call ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const text = `${name}\n${JSON.stringify(args, null, 2)}`;
    const content = new Text(truncate(text, 800), 0, 0);
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;255;255;0m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
  };

  // Helper to add tool result box
  const addToolResultBox = (name: string, result: string) => {
    const box = new Box(1, 0, undefined);

    const title = new Text(
      `\x1b[38;2;95;135;255m┌─ Tool Result ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const text = `${name}: ${result}`;
    const content = new Text(truncate(text, 800), 0, 0);
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;95;135;255m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
  };

  // Helper to add error box
  const addErrorBox = (name: string, error: string) => {
    const box = new Box(1, 0, undefined);

    const title = new Text(
      `\x1b[38;2;204;102;102m┌─ Error ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const text = `${name}: ${error}`;
    const content = new Text(
      truncate(text, 800),
      0,
      0,
      (text: string) => `\x1b[38;2;204;102;102m${text}\x1b[0m`
    );
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;204;102;102m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
  };

  // Helper to add status box
  const addStatusBox = (message: string) => {
    const box = new Box(1, 0, undefined);

    const title = new Text(
      `\x1b[38;2;128;128;128m┌─ Status ${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(title);

    const content = new Text(
      message,
      0,
      0,
      (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`
    );
    box.addChild(content);

    const bottomBorder = new Text(
      `\x1b[38;2;128;128;128m└${"─".repeat(100)}\x1b[0m`,
      0,
      0
    );
    box.addChild(bottomBorder);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, box);
    }

    addSpacer();
  };

  // Truncate helper
  const truncate = (text: string, max = 800) => {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
  };

  // Finalize streaming message
  const finalizeStreaming = () => {
    streamingMarkdown = null;
    streamingContent = "";
  };

  // Handle streaming delta
  const onDelta = (delta: string) => {
    if (!streamingMarkdown) {
      streamingContent = "";
      streamingMarkdown = createAssistantMessage();
    }
    streamingContent += delta;
    streamingMarkdown.setText(streamingContent);
    tui.requestRender();
  };

  // Handle agent events
  const onEvent = (event: AgentEvent) => {
    finalizeStreaming();

    switch (event.type) {
      case "status":
        addStatusBox(event.message);
        break;
      case "tool_call":
        addToolCallBox(event.name, event.arguments);
        break;
      case "tool_result":
        addToolResultBox(event.name, event.result);
        break;
      case "tool_error":
        addErrorBox(event.name, event.error);
        break;
    }

    tui.requestRender();
  };

  // Handle editor submit
  editor.onSubmit = async (value: string) => {
    const text = value.trim();
    if (!text || busy) {
      return;
    }

    editor.setText("");
    busy = true;

    // Add user message
    addUserMessage(text);
    tui.requestRender();

    try {
      await loop.runOnceStream("default", text, onDelta, onEvent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addErrorBox("System", msg);
    } finally {
      finalizeStreaming();
      busy = false;
      tui.requestRender();
    }
  };

  // Start TUI
  tui.start();
}
