# CLI MVP Plan (TUI)

Goal: minimal interactive terminal UI with a transcript pane and a single-line input, streaming assistant output.

## Scope (MVP Only)
- Two panes: transcript (top), input (bottom)
- Single-line input, submit on Enter
- Streaming assistant output (token deltas)
- `Ctrl+C` exit
- Keep existing `yana -m "..."` one-shot mode

## Out of Scope (Later)
- Multi-line input
- Tool permission prompts
- Tool logs/events
- Message history / persistence in UI
- Status bar, timestamps, theming

## Files to Add/Update
Add:
- `src/channels/tui.ts`

Update:
- `src/cli/index.ts` (route default to TUI, keep `-m` one-shot)
- `src/agent/loop.ts` (add streaming runner or emit streaming deltas)
- `package.json` (add `blessed` dependency)

## Implementation Steps
1) Add dependency: `blessed`.
2) Implement `src/channels/tui.ts`:
   - Create `screen`, `transcriptBox`, `inputBox`.
   - On Enter: send input, append to transcript, clear input.
   - Append assistant deltas to the last assistant line as they stream.
   - Bind `Ctrl+C` to exit.
3) Update `AgentLoop`:
   - Add `runOnceStream(sessionKey, userContent)` that yields deltas.
4) Update CLI:
   - If `-m/--message` is provided, run one-shot.
   - Otherwise start TUI channel.

## Acceptance Criteria
- Running `yana` opens a TUI with input and transcript panes.
- Enter sends a prompt and shows a streaming assistant reply.
- `Ctrl+C` exits cleanly.
- `yana -m "..."` still works as before.

