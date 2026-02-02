import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SessionMessage = {
  role: string;
  content: string | null;
  timestamp: string;
};

export class Session {
  readonly key: string;
  readonly createdAt: string;
  updatedAt: string;
  private messages: SessionMessage[] = [];
  private lastSavedIndex = 0;

  constructor(key: string, messages?: SessionMessage[]) {
    this.key = key;
    const now = new Date().toISOString();
    this.createdAt = now;
    this.updatedAt = now;
    if (messages && messages.length > 0) {
      this.messages = messages;
      this.lastSavedIndex = messages.length;
    }
  }

  addMessage(role: string, content: string | null) {
    const msg: SessionMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(msg);
    this.updatedAt = msg.timestamp;
  }

  getHistory() {
    return [...this.messages];
  }

  getUnsavedMessages() {
    return this.messages.slice(this.lastSavedIndex);
  }

  markSaved() {
    this.lastSavedIndex = this.messages.length;
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), ".yana", "sessions");
  }

  async getOrCreate(key: string) {
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const loaded = await this.load(key);
    const session = loaded ?? new Session(key);
    this.sessions.set(key, session);
    return session;
  }

  private async load(key: string) {
    const filePath = this.getSessionPath(key);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
      const messages: SessionMessage[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.role) {
            messages.push({
              role: String(parsed.role),
              content: parsed.content ?? null,
              timestamp: String(parsed.timestamp ?? new Date().toISOString()),
            });
          }
        } catch {
          continue;
        }
      }

      if (messages.length === 0) return null;
      return new Session(key, messages);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  async save(session: Session) {
    const filePath = this.getSessionPath(session.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const toSave = session.getUnsavedMessages();
    if (toSave.length === 0) return;

    const payload = toSave.map((msg) => JSON.stringify(msg)).join("\n") + "\n";
    await fs.appendFile(filePath, payload, "utf8");
    session.markSaved();
  }

  private getSessionPath(key: string) {
    return path.join(this.baseDir, `${key}.jsonl`);
  }
}
