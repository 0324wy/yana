const {
  normalizeContent,
  safeParseArguments,
} = require("../../dist/providers/normalize");

describe("normalize helpers", () => {
  test("normalizes string content directly", () => {
    expect(normalizeContent("hello")).toBe("hello");
  });

  test("normalizes content parts arrays", () => {
    const value = [{ type: "text", text: "hi " }, { type: "text", text: "there" }];
    expect(normalizeContent(value)).toBe("hi there");
  });

  test("normalizes objects using text/content fields", () => {
    expect(normalizeContent({ text: "abc" })).toBe("abc");
    expect(normalizeContent({ content: "def" })).toBe("def");
  });

  test("falls back to JSON for unknown object content", () => {
    expect(normalizeContent({ a: 1 })).toBe("{\"a\":1}");
  });

  test("parses valid tool arguments and handles invalid JSON", () => {
    expect(safeParseArguments("{\"x\":1}")).toEqual({ x: 1 });
    expect(safeParseArguments("not-json")).toEqual({});
  });
});
