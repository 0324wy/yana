import { Tool } from "./base";

export class WebSearchTool extends Tool {
  name = "web_search";
  description = "Search the web using Brave Search.";
  parameters = {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      count: {
        type: "number",
        description: "Number of results to return (default 5)",
      },
      offset: {
        type: "number",
        description: "Result offset for pagination (default 0)",
      },
    },
    required: ["query"],
  };

  constructor(private apiKey?: string) {
    super();
  }

  async execute(params: Record<string, unknown>) {
    const query = String(params.query ?? "").trim();
    if (!query) throw new Error("Missing required parameter: query");
    if (!this.apiKey) {
      return "web_search not configured: missing webSearch.apiKey";
    }

    const count = Number(params.count ?? 5);
    const offset = Number(params.offset ?? 0);
    const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(10, count)) : 5;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(safeCount));
    url.searchParams.set("offset", String(safeOffset));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`web_search failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as any;
    const results = (data?.web?.results ?? []).map((item: any) => ({
      title: item.title,
      url: item.url,
      description: item.description,
    }));

    return JSON.stringify({ query, count: safeCount, offset: safeOffset, results });
  }
}

export class WebFetchTool extends Tool {
  name = "web_fetch";
  description = "Fetch a web page and return its text.";
  parameters = {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      maxChars: {
        type: "number",
        description: "Maximum characters to return (default 20000)",
      },
    },
    required: ["url"],
  };

  async execute(params: Record<string, unknown>) {
    const url = String(params.url ?? "").trim();
    if (!url) throw new Error("Missing required parameter: url");

    const maxChars = Number(params.maxChars ?? 20000);
    const limit = Number.isFinite(maxChars) ? Math.max(1000, maxChars) : 20000;

    const res = await fetch(url, { headers: { Accept: "text/html, text/plain" } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`web_fetch failed: ${res.status} ${text}`);
    }

    const text = await res.text();
    return text.slice(0, limit);
  }
}
