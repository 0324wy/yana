import pino from "pino";

export function createLogger() {
  const level = process.env.YANA_LOG_LEVEL || "info";
  const transport =
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true },
        }
      : undefined;

  return pino({ level, transport });
}
