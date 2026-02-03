import blessed from "blessed";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import { AgentEvent, AgentLoop } from "../agent/loop";

export type CreateLoop = () => AgentLoop;

export async function runTui(createLoop: CreateLoop) {
  const loop = createLoop();

  const mdRenderer = new TerminalRenderer();
  marked.setOptions({ renderer: mdRenderer as any });

  const renderMarkdown = (text: string) => {
    return String(marked.parse(text));
  };

  const theme = {
    bg: "black", // Main background
    gray: "#555555",
    user: {
        border: "cyan",
        header: "cyan",
        text: "white"
    },
    assistant: {
        border: "green",
        header: "green",
        text: "white"
    },
    error: {
        border: "red",
        header: "red",
        text: "red"
    },
    status: {
        border: "#666666",
        header: "#888888",
        text: "#888888"
    },
    tool: {
        border: "yellow",
        header: "yellow",
        text: "white"
    },
    toolResult: {
        border: "blue",
        header: "blue",
        text: "white"
    },
    input: {
        border: "white",
        focusBorder: "blue"
    }
  };

  const screen = blessed.screen({
    smartCSR: true,
    title: "YANA",
    fullUnicode: true,
  });

  // Container for chat history
  const historyBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3", // Leave space for input
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    style: {
      bg: theme.bg,
    },
    scrollbar: {
      ch: " ",
      track: { bg: theme.bg },
      style: { bg: theme.gray },
    },
  });

  // Input area
  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    border: { type: 'line' },
    padding: { left: 1, right: 1 },
    keys: true,
    inputOnFocus: true,
    style: {
      bg: theme.bg,
      border: { fg: theme.input.border },
    },
  });

  // Focus effect for input
  inputBox.on('focus', () => {
    inputBox.style.border.fg = theme.input.focusBorder;
    screen.render();
  });
  inputBox.on('blur', () => {
    inputBox.style.border.fg = theme.input.border;
    screen.render();
  });

  screen.append(historyBox);
  screen.append(inputBox);
  inputBox.focus();

  // State Management
  let contentOffset = 0;
  let activeAssistantBox: blessed.Widgets.BoxElement | null = null;
  let activeAssistantContent = "";
  let busy = false;

  const truncate = (text: string, max = 800) => {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
  };

  // Helper to add a message cell
  const appendCell = (
    role: "user" | "assistant" | "error" | "status" | "tool" | "tool_result",
    text: string,
  ): blessed.Widgets.BoxElement => {
    
    // Config based on role
    let borderColor = theme.gray;
    let title = "";
    
    switch (role) {
        case 'user':
            borderColor = theme.user.border;
            title = " Create ";
            break;
        case 'assistant':
            borderColor = theme.assistant.border;
            title = " Yana "; // Or " Assistant "
            break;
        case 'error':
            borderColor = theme.error.border;
            title = " Error ";
            break;
        case 'status':
            borderColor = theme.status.border;
            title = " Status ";
            break;
        case 'tool':
            borderColor = theme.tool.border;
            title = " Tool Call ";
            break;
        case 'tool_result':
            borderColor = theme.toolResult.border;
            title = " Tool Result ";
            break;
    }

    const cell = blessed.box({
        top: contentOffset,
        left: 0,
        width: "100%-2", // Account for scrollbar safely
        height: 'shrink', // Auto-height
        content: text,
        tags: false, // We'll handle raw text mostly, or enable if needed. Let's start false to avoid unescaped issues.
        label: ` ${title} `,
        border: { type: 'line' }, // 'line' is standard. 'rounded' might break on some fonts/terms but worth a try? stick to line for safety.
        padding: { left: 1, right: 1 },
        style: {
            border: { fg: borderColor },
            label: { fg: borderColor, bold: true },
            fg:
              role === "tool_result"
                ? theme.toolResult.text
                : theme[role === "error" ? "error" : role].text
        }
    });

    historyBox.append(cell);
    return cell;
  };

  /**
   * Finalizes the position of the last cell.
   * Should be called after the cell is "done" (fully rendered and static).
   */
  const finalizeCellConfig = (cell: blessed.Widgets.BoxElement) => {
    // We need to trigger a render or calculation to get the true height.
    // box.getScreenLines() returns the lines array. 
    // box.lpos might be null if not rendered.
    
    // Force a minimal calculation without full render?
    // Using `cell.getTextHeight()` is documented in some forks but standard blessed might lack it?
    // Standard blessed workaround:
    // We assume the screen has been rendered at least once or we force it.
    
    // Let's rely on screen.render() having been called during the streaming updates.
    // But for User message, we append and immediately want to know height.
    screen.render(); 
    
    // Calculate height based on lines.
    // 'lpos' contains { yi, yl } (y-initial, y-last). height = yl - yi.
    // But lpos is absolute. 
    // Easier: `cell.getScreenLines().length + 2` (borders).
    const lines = cell.getScreenLines();
    const height = lines.length + 2; 

    cell.height = height; // Fix the height so it doesn't shrink/grow unexpectedly later
    contentOffset += height;
  };

  const finalizeActiveAssistant = () => {
    if (activeAssistantBox) {
      finalizeCellConfig(activeAssistantBox);
      activeAssistantBox = null;
    }
  };

  const handleEvent = (event: AgentEvent) => {
    if (event.type === "status") {
      const statusCell = appendCell("status", event.message);
      finalizeCellConfig(statusCell);
      historyBox.setScrollPerc(100);
      screen.render();
      return;
    }

    if (event.type === "tool_call") {
      finalizeActiveAssistant();
      const text = `${event.name} ${JSON.stringify(event.arguments)}`;
      const cell = appendCell("tool", truncate(text));
      finalizeCellConfig(cell);
      historyBox.setScrollPerc(100);
      screen.render();
      return;
    }

    if (event.type === "tool_result") {
      finalizeActiveAssistant();
      const text = `${event.name}: ${event.result}`;
      const cell = appendCell("tool_result", truncate(text));
      finalizeCellConfig(cell);
      historyBox.setScrollPerc(100);
      screen.render();
      return;
    }

    if (event.type === "tool_error") {
      finalizeActiveAssistant();
      const text = `${event.name}: ${event.error}`;
      const cell = appendCell("error", truncate(text));
      finalizeCellConfig(cell);
      historyBox.setScrollPerc(100);
      screen.render();
    }
  };

  inputBox.on("submit", async (value: string) => {
    const text = value.trim();
    if (!text || busy) {
        inputBox.focus();
        return;
    }
    
    inputBox.setValue("");
    inputBox.screen.render();
    
    busy = true;

    // 1. Add User Cell
    const userCell = appendCell('user', text);
    finalizeCellConfig(userCell);
    
    try {
        await loop.runOnceStream("default", text, (delta) => {
            if (!activeAssistantBox) {
                activeAssistantContent = "";
                activeAssistantBox = appendCell("assistant", "");
                screen.render();
            }
            activeAssistantContent += delta;
            if (activeAssistantBox) {
                activeAssistantBox.setContent(renderMarkdown(activeAssistantContent));
                // During streaming, we leave height as 'shrink' so it grows.
                // We keep scrolling to bottom.
                historyBox.setScrollPerc(100);
                screen.render();
            }
        }, handleEvent);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendCell('error', msg); 
        // Note: we appended error below the assistant box? 
        // If assistant failed mid-stream, we might want to just append error box.
        // We'll calculate offset for the assistant box first.
    } finally {
        finalizeActiveAssistant();
        busy = false;
        inputBox.focus();
        screen.render();
    }
  });

  // Global Key Bindings for Scrolling
  screen.key(['pageup'], () => {
    historyBox.scroll(-10); // Scroll up 10 lines
    screen.render();
  });
  screen.key(['pagedown'], () => {
    historyBox.scroll(10); // Scroll down 10 lines
    screen.render();
  });
  screen.key(['C-up'], () => {
    historyBox.scroll(-1);
    screen.render();
  });
  screen.key(['C-down'], () => {
    historyBox.scroll(1);
    screen.render();
  });

  screen.key(["C-c", "q"], () => process.exit(0));
  
  screen.render();
}
