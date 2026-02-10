const { defaultConfig } = require("../../dist/config");
const { ProviderFactory } = require("../../dist/providers/factory");

describe("ProviderFactory", () => {
  test("selects provider from agents.defaults.provider", () => {
    const config = defaultConfig();
    config.agents.defaults.provider = "openrouter";
    config.providers.openrouter = {
      apiKey: "or-key",
      apiBase: "https://openrouter.ai/api/v1",
    };

    const { name } = ProviderFactory.create(config, {});
    expect(name).toBe("openrouter");
  });

  test("falls back to API key detection when provider is not set", () => {
    const config = defaultConfig();
    config.providers.openai = { apiKey: "oa-key" };

    const { name } = ProviderFactory.create(config, {});
    expect(name).toBe("openai");
  });

  test("throws clear error when no provider is configured", () => {
    const config = defaultConfig();

    expect(() => ProviderFactory.create(config, {})).toThrow(
      "No provider configured",
    );
  });
});
