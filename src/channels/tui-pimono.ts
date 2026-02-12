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
    heading: (text: string) => `\x1b[1;38;2;240;198;116m${text}\x1b[0m`, // Bold headings
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
    codeBlockIndent: "  ", // Add indent for code blocks
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
  let scrollOffset = 0; // Lines scrolled from bottom
  const SCROLL_PAGE_SIZE = 10; // Lines per Page Up/Down

  // Create terminal and TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Create editor
  const editor = new Editor(tui, editorTheme);
  tui.addChild(editor);

  // Set focus to editor
  tui.setFocus(editor);

  // Add keyboard handler for scrolling
  const getMaxScroll = (): number => {
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex <= 0) return 0;
    // Estimate max scroll based on message count
    return Math.max(0, (editorIndex - 1) * 5); // ~5 lines per message average
  };

  // Store original handleInput to chain handlers
  const originalHandleInput = (editor as any).handleInput?.bind(editor);
  (editor as any).handleInput = (data: string) => {
    // Handle scroll keys before passing to editor
    if (data === "\x1b[5~") {
      // Page Up
      scrollOffset = Math.min(scrollOffset + SCROLL_PAGE_SIZE, getMaxScroll());
      tui.requestRender();
      return;
    }
    if (data === "\x1b[6~") {
      // Page Down
      scrollOffset = Math.max(scrollOffset - SCROLL_PAGE_SIZE, 0);
      tui.requestRender();
      return;
    }
    if (data === "\x1b[1;5A") {
      // Ctrl+Up
      scrollOffset = Math.min(scrollOffset + 1, getMaxScroll());
      tui.requestRender();
      return;
    }
    if (data === "\x1b[1;5B") {
      // Ctrl+Down
      scrollOffset = Math.max(scrollOffset - 1, 0);
      tui.requestRender();
      return;
    }

    // Pass through to editor
    if (originalHandleInput) originalHandleInput(data);
  };

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
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;138;190;183m• You\x1b[0m`,
      1,
      0
    );

    // Markdown content with padding
    const content = new Markdown(text, 1, 0, markdownTheme);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
  };

  // Helper to create assistant message box
  const createAssistantMessage = () => {
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;181;189;104m• Yana\x1b[0m`,
      1,
      0
    );

    // Markdown content with padding
    const content = new Markdown("", 1, 0, markdownTheme);

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
    return content;
  };

  // Helper to add tool call box
  const addToolCallBox = (name: string, args: Record<string, unknown>) => {
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;255;255;0m🔧 Tool Call\x1b[0m`,
      1,
      0
    );

    const text = `${name}\n${JSON.stringify(args, null, 2)}`;
    const content = new Text(
      truncate(text, 800),
      1,
      0,
      (text: string) => `\x1b[2m${text}\x1b[0m` // Dimmed text
    );

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
  };

  // Helper to add tool result box
  const addToolResultBox = (name: string, result: string) => {
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;95;135;255m✓ Tool Result\x1b[0m`,
      1,
      0
    );

    const text = `${name}: ${result}`;
    const content = new Text(
      truncate(text, 800),
      1,
      0,
      (text: string) => `\x1b[2m${text}\x1b[0m` // Dimmed text
    );

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
  };

  // Helper to add error box
  const addErrorBox = (name: string, error: string) => {
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;204;102;102m✗ Error\x1b[0m`,
      1,
      0
    );

    const text = `${name}: ${error}`;
    const content = new Text(
      truncate(text, 800),
      1,
      0,
      (text: string) => `\x1b[38;2;204;102;102m${text}\x1b[0m`
    );

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
  };

  // Helper to add status box
  const addStatusBox = (message: string) => {
    // Simple label with minimal styling
    const label = new Text(
      `\x1b[38;2;128;128;128m⋯ Status\x1b[0m`,
      1,
      0
    );

    const content = new Text(
      message,
      1,
      0,
      (text: string) => `\x1b[38;2;128;128;128m${text}\x1b[0m`
    );

    // Insert before editor
    const children = (tui as any).children as any[];
    const editorIndex = children.indexOf(editor);
    if (editorIndex !== -1) {
      children.splice(editorIndex, 0, label, content);
    }

    addSpacer();
    scrollOffset = 0; // Auto-scroll to bottom on new message
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
    try {
      if (!streamingMarkdown) {
        streamingContent = "";
        streamingMarkdown = createAssistantMessage();
      }
      if (!streamingMarkdown) {
        console.error("Failed to create streaming message component");
        return;
      }
      streamingContent += delta;
      streamingMarkdown.setText(streamingContent);
      tui.requestRender();
    } catch (err) {
      console.error("Error in onDelta:", err);
      // Attempt recovery by finalizing current message
      finalizeStreaming();
    }
  };

  // Handle agent events
  const onEvent = (event: AgentEvent) => {
    try {
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
    } catch (err) {
      console.error("Error in onEvent:", err);
      // Show error to user
      try {
        addErrorBox("TUI Error", String(err));
        tui.requestRender();
      } catch {
        // Last resort - log and continue
        console.error("Critical TUI error - could not render error box");
      }
    }
  };

  // Handle editor submit
  editor.onSubmit = async (value: string) => {
    const text = value.trim();
    if (!text || busy) {
      return;
    }

    editor.setText("");
    busy = true;

    try {
      addUserMessage(text);
      tui.requestRender();

      await loop.runOnceStream("default", text, onDelta, onEvent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error in submit handler:", err);
      try {
        addErrorBox("System", msg);
        tui.requestRender();
      } catch (innerErr) {
        console.error("Failed to display error:", innerErr);
      }
    } finally {
      finalizeStreaming();
      busy = false;
      // Always try to render final state
      try {
        tui.requestRender();
      } catch (renderErr) {
        console.error("Failed to render after submit:", renderErr);
      }
    }
  };

  // Start TUI
  tui.start();
}
