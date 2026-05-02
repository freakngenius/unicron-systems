type Level = "debug" | "info" | "warn" | "error";

interface LogContext {
  pattern?: string;
  run_id?: string;
  [k: string]: unknown;
}

function write(level: Level, msg: string, ctx?: LogContext) {
  const line = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(ctx ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
  scoped: (base: LogContext) => ({
    debug: (m: string, c?: LogContext) => write("debug", m, { ...base, ...c }),
    info: (m: string, c?: LogContext) => write("info", m, { ...base, ...c }),
    warn: (m: string, c?: LogContext) => write("warn", m, { ...base, ...c }),
    error: (m: string, c?: LogContext) => write("error", m, { ...base, ...c }),
  }),
};
