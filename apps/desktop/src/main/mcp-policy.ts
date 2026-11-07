import { z } from "zod";

export const DESKTOP_MCP_ALLOWED_TOOLS = new Set([
  "read_file",
  "read_text_file",
  "read_media_file",
  "list_directory",
  "list_dir",
  "list_allowed_directories",
  "search_files",
  "get_file_info",
  "directory_tree",
  "list_tools",
]);

const envKey = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]{0,63}$/)
  .refine(
    (key) =>
      !new Set([
        "PATH",
        "HOME",
        "USERPROFILE",
        "SYSTEMROOT",
        "COMSPEC",
        "TEMP",
        "TMP",
      ]).has(key),
    "Environment key is reserved by the desktop runtime",
  );

export const desktopStdioConfigSchema = z
  .object({
    command: z.string().trim().min(1).max(512),
    args: z.array(z.string().max(2_048)).max(32).optional(),
    env: z.record(envKey, z.string().max(4_096)).optional(),
  })
  .strict()
  .refine(
    (config) => JSON.stringify(config).length <= 16_384,
    "MCP configuration is too large",
  );

const remoteHeaderName = z
  .string()
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/)
  .refine(
    (name) =>
      ![
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
        "upgrade",
      ].includes(name.toLowerCase()),
    "Header is controlled by the desktop transport",
  );

export const desktopRemoteMcpConfigSchema = z
  .object({
    url: z.string().url().max(2_048),
    headers: z.record(remoteHeaderName, z.string().max(4_096)).optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Invalid URL" });
      return;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "Desktop remote MCP requires an HTTPS URL without credentials or fragments",
      });
    }
    if (JSON.stringify(config).length > 16_384) {
      ctx.addIssue({
        code: "custom",
        message: "MCP configuration is too large",
      });
    }
  });

export const desktopMcpConfigSchema = z.union([
  desktopStdioConfigSchema,
  desktopRemoteMcpConfigSchema,
]);

export const desktopToolCallSchema = z
  .object({
    toolName: z.string().min(1).max(100),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .refine(
    (call) => JSON.stringify(call.params).length <= 32_768,
    "Tool arguments are too large",
  );

export function isDesktopMcpToolAllowed(name: string) {
  return DESKTOP_MCP_ALLOWED_TOOLS.has(name);
}

export function buildMcpConfigFingerprint(
  config: z.infer<typeof desktopMcpConfigSchema>,
) {
  if ("url" in config) {
    return JSON.stringify({
      url: new URL(config.url).toString(),
      headers: Object.fromEntries(
        Object.entries(config.headers ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    });
  }
  const env = Object.fromEntries(
    Object.entries(config.env ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    command: config.command,
    args: config.args ?? [],
    env,
  });
}
