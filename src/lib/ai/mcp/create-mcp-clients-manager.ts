import { ToolCallOptions, jsonSchema } from "ai";
import {
  type MCPServerConfig,
  type McpServerInsert,
  type McpServerSelect,
  type VercelAIMcpTool,
  VercelAIMcpToolTag,
} from "app-types/mcp";
import { colorize } from "consola/utils";
import { createMcpServerConfigFingerprint } from "lib/ai/tools/hitl/mcp-tool-approval";
import { normalizeToolInputSchema } from "lib/ai/tools/sanitize-tool-schemas";
import { McpServerTable } from "lib/db/pg/schema.pg";
import {
  Locker,
  errorToString,
  generateUUID,
  safeJSONParse,
  toAny,
} from "lib/utils";
import globalLogger from "logger";
import { safe } from "ts-safe";
import { type MCPClient, createMCPClient } from "./create-mcp-client";
import { createMCPToolId } from "./mcp-tool-id";
import { createMemoryMCPConfigStorage } from "./memory-mcp-config-storage";

/**
 * Interface for storage of MCP server configurations.
 * Implementations should handle persistent storage of server configs.
 *
 * IMPORTANT: When implementing this interface, be aware that:
 * - Storage can be modified externally (e.g., file edited manually)
 * - Concurrent modifications may occur from multiple processes
 * - Implementations should either handle these scenarios or document limitations
 */
export interface MCPConfigStorage {
  init(manager: MCPClientsManager): Promise<void>;
  loadAll(): Promise<McpServerSelect[]>;
  save(server: McpServerInsert): Promise<McpServerSelect>;
  delete(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
  get(id: string): Promise<McpServerSelect | null>;
}

export class MCPClientsManager {
  protected clients = new Map<
    string,
    {
      client: MCPClient;
      name: string;
    }
  >();
  private clientConfigs = new Map<string, MCPServerConfig>();
  private initializedLock = new Locker();
  private initialized = false;
  private logger = globalLogger.withDefaults({
    message: colorize("dim", `[${generateUUID().slice(0, 4)}] MCP Manager: `),
  });

  // Optional storage for persistent configurations
  constructor(
    private storage: MCPConfigStorage = createMemoryMCPConfigStorage(),
    private autoDisconnectSeconds: number = 60 * 30, // 30 minutes
  ) {
    process.on("SIGINT", this.cleanup.bind(this));
    process.on("SIGTERM", this.cleanup.bind(this));
  }

  private async waitInitialized() {
    if (this.initialized) {
      return;
    }
    if (this.initializedLock.isLocked) {
      await this.initializedLock.wait();
      return;
    }
    await this.init();
  }

  async init() {
    this.logger.info("Initializing MCP clients manager");
    if (this.initializedLock.isLocked) {
      this.logger.info(
        "MCP clients manager already initialized, waiting for lock",
      );
      return this.initializedLock.wait();
    }
    if (this.initialized) {
      this.logger.info("MCP clients manager already initialized");
      return;
    }
    return safe(() => this.initializedLock.lock())
      .ifOk(async () => {
        if (this.storage) {
          await this.storage.init(this);
          const configs = await this.storage.loadAll();
          await Promise.all(
            configs.map(({ id, name, config }) =>
              this.addClient(id, name, config).catch(() => {
                `ignore error`;
              }),
            ),
          );
        }
      })
      .watch(() => {
        this.initializedLock.unlock();
        this.initialized = true;
      })
      .unwrap();
  }

  /**
   * Returns all tools from all clients as a flat object
   */
  async tools(): Promise<Record<string, VercelAIMcpTool>> {
    await this.waitInitialized();
    const clients = Array.from(this.clients.entries());

    // Connect lazily and refresh tool info; avoid blocking on a single failing server
    await Promise.allSettled(
      clients.map(async ([_id, { client }]) => {
        try {
          await client.connect();
          await client.updateToolInfo();
        } catch (error) {
          this.logger.warn("Failed to refresh MCP tools for a server", error);
        }
      }),
    );

    return clients.reduce(
      (acc, [id, client]) => {
        if (!client.client?.toolInfo?.length) return acc;
        const clientName = client.name;
        return {
          ...acc,
          ...client.client.toolInfo.reduce(
            (bcc, tool) => {
              return {
                ...bcc,
                [createMCPToolId(clientName, tool.name)]:
                  VercelAIMcpToolTag.create({
                    description: tool.description,
                    inputSchema: jsonSchema(
                      normalizeToolInputSchema(
                        toAny({
                          ...tool.inputSchema,
                          properties: tool.inputSchema?.properties ?? {},
                          additionalProperties: false,
                        }),
                      ),
                    ),
                    _originToolName: tool.name,
                    _mcpServerName: clientName,
                    _mcpServerId: id,
                    _approvalConfigFingerprint: this.clientConfigs.get(id)
                      ? createMcpServerConfigFingerprint(
                          this.clientConfigs.get(id),
                        )
                      : undefined,
                    _readOnlyHint: tool.annotations?.readOnlyHint === true,
                    // This method publishes definitions for inspection and
                    // approval-bound wrappers. Keep the raw definition inert:
                    // dispatch must go through executeApprovedMcpTool, or a
                    // separately authorized read-only subsystem.
                    execute: async (_params, options: ToolCallOptions) => {
                      options?.abortSignal?.throwIfAborted();
                      return {
                        isError: true,
                        error: {
                          name: "ApprovalRequired",
                          message:
                            "MCP calls must be dispatched through an approved execution path.",
                        },
                        content: [],
                      };
                    },
                  }),
              };
            },
            {} as Record<string, VercelAIMcpTool>,
          ),
        };
      },
      {} as Record<string, VercelAIMcpTool>,
    );
  }
  /**
   * Creates and adds a new client instance to memory only (no storage persistence)
   */
  async addClient(
    id: string,
    name: string,
    serverConfig: MCPServerConfig,
    options: { connectImmediately?: boolean } = {},
  ) {
    if (this.clients.has(id)) {
      const prevClient = this.clients.get(id)!;
      void prevClient.client.disconnect();
    }
    const client = createMCPClient(id, name, serverConfig, {
      autoDisconnectSeconds: this.autoDisconnectSeconds,
    });
    this.clientConfigs.set(id, structuredClone(serverConfig));
    this.clients.set(id, { client, name });
    if (options.connectImmediately === false) {
      return client;
    }
    return client.connect();
  }

  /**
   * Persists a new client configuration to storage and adds the client instance to memory
   */
  async persistClient(server: typeof McpServerTable.$inferInsert) {
    let id = server.name;
    if (this.storage) {
      const entity = await this.storage.save(server);
      id = entity.id;
    }
    await this.addClient(id, server.name, server.config).catch((err) => {
      if (!server.id) {
        void this.removeClient(id);
      }
      throw err;
    });

    return this.clients.get(id)!;
  }

  /**
   * Removes a client by name, disposing resources and removing from storage
   */
  async removeClient(id: string) {
    if (this.storage) {
      if (await this.storage.has(id)) {
        await this.storage.delete(id);
      }
    }
    this.disconnectClient(id);
  }

  async disconnectClient(id: string) {
    const client = this.clients.get(id);
    this.clients.delete(id);
    this.clientConfigs.delete(id);
    if (client) {
      void client.client.disconnect();
    }
  }

  /**
   * Refreshes an existing client with a new configuration or its existing config
   */
  async refreshClient(id: string) {
    await this.waitInitialized();
    const server = await this.storage.get(id);
    if (!server) {
      throw new Error(`Client ${id} not found`);
    }
    this.logger.info(`Refreshing client ${server.name}`);
    await this.addClient(id, server.name, server.config);
    return this.clients.get(id)!;
  }

  /**
   * Synchronizes one server's cached client with storage before building a
   * user-visible tool definition. Returns the fingerprint of the config the
   * active client was created with, or undefined if it cannot be verified.
   * This is intentionally opt-in so ordinary MCP operations do not poll DB.
   */
  async refreshClientIfConfigChanged(id: string): Promise<string | undefined> {
    await this.waitInitialized();
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const stored = await this.storage.get(id);
        if (!stored || stored.enabled === false) return undefined;

        const storedFingerprint = createMcpServerConfigFingerprint(
          stored.config,
        );
        const active = this.clients.get(id);
        const activeConfig = this.clientConfigs.get(id);
        const activeFingerprint = activeConfig
          ? createMcpServerConfigFingerprint(activeConfig)
          : undefined;

        if (
          !active ||
          active.name !== stored.name ||
          activeFingerprint !== storedFingerprint
        ) {
          await this.refreshClient(id);
          continue;
        }

        // Re-read storage after comparing the active client to close changes
        // made by another application instance during this check.
        const latest = await this.storage.get(id);
        const latestFingerprint = latest
          ? createMcpServerConfigFingerprint(latest.config)
          : undefined;
        const current = this.clients.get(id);
        const currentConfig = this.clientConfigs.get(id);
        const currentFingerprint = currentConfig
          ? createMcpServerConfigFingerprint(currentConfig)
          : undefined;
        if (
          latest &&
          latest.enabled !== false &&
          current &&
          current.name === latest.name &&
          currentFingerprint === latestFingerprint
        ) {
          return currentFingerprint;
        }
      }
    } catch (error) {
      this.logger.warn(
        "Could not synchronize MCP client before tool listing",
        error,
      );
    }
    return undefined;
  }

  async cleanup() {
    const clients = Array.from(this.clients.values());
    this.clients.clear();
    this.clientConfigs.clear();
    await Promise.allSettled(clients.map(({ client }) => client.disconnect()));
  }

  async getClients() {
    await this.waitInitialized();
    return Array.from(this.clients.entries()).map(([id, { client }]) => ({
      id,
      client: client,
    }));
  }
  async getClient(id: string) {
    await this.waitInitialized();
    const client = this.clients.get(id);
    if (!client) {
      await this.refreshClient(id);
    }

    return this.clients.get(id);
  }
  async toolCallByServerName(
    serverName: string,
    toolName: string,
    input: unknown,
  ) {
    const clients = await this.getClients();
    const client = clients.find((c) => c.client.getInfo().name === serverName);
    if (!client) {
      if (this.storage) {
        const servers = await this.storage.loadAll();
        const server = servers.find((s) => s.name === serverName);
        if (server) {
          return this.toolCall(server.id, toolName, input);
        }
      }
      throw new Error(`Client ${serverName} not found`);
    }
    return this.toolCall(client.id, toolName, input);
  }
  async toolCall(
    id: string,
    toolName: string,
    input: unknown,
    expectedConfigFingerprint?: string,
    expectedServerName?: string,
  ) {
    try {
      let clientEntry = await this.getClient(id);
      if (!clientEntry) {
        return {
          isError: true,
          error: {
            message: `Client ${id} not found`,
            name: "ERROR",
          },
          content: [],
        };
      }

      if (expectedConfigFingerprint) {
        if (!expectedServerName) {
          throw new Error(
            "Approved MCP calls require the reviewed server name",
          );
        }
        const stored = await this.storage.get(id);
        if (
          !stored ||
          stored.enabled === false ||
          stored.name !== expectedServerName ||
          createMcpServerConfigFingerprint(stored.config) !==
            expectedConfigFingerprint
        ) {
          throw new Error("MCP server changed or was disabled after approval");
        }
        const activeConfig = this.clientConfigs.get(id);
        if (
          !activeConfig ||
          createMcpServerConfigFingerprint(activeConfig) !==
            expectedConfigFingerprint
        ) {
          await this.refreshClient(id);
          clientEntry = this.clients.get(id);
        }
        const latest = await this.storage.get(id);
        if (
          !clientEntry ||
          !latest ||
          latest.enabled === false ||
          latest.name !== expectedServerName ||
          createMcpServerConfigFingerprint(latest.config) !==
            expectedConfigFingerprint ||
          !this.clientConfigs.get(id) ||
          createMcpServerConfigFingerprint(this.clientConfigs.get(id)!) !==
            expectedConfigFingerprint
        ) {
          throw new Error("MCP server configuration changed after approval");
        }

        // Recheck mutable server identity and enabled state as close to the
        // network dispatch as possible. The first checks may have refreshed a
        // client while an administrator changed or disabled this row.
        const dispatchTarget = await this.storage.get(id);
        if (
          !dispatchTarget ||
          dispatchTarget.enabled === false ||
          dispatchTarget.name !== expectedServerName ||
          createMcpServerConfigFingerprint(dispatchTarget.config) !==
            expectedConfigFingerprint ||
          !this.clientConfigs.get(id) ||
          createMcpServerConfigFingerprint(this.clientConfigs.get(id)!) !==
            expectedConfigFingerprint
        ) {
          throw new Error("MCP server changed or was disabled before dispatch");
        }
      }

      const result = await clientEntry.client.callTool(toolName, input);

      // Parse JSON text content if present
      if (result?.content && Array.isArray(result.content)) {
        return {
          ...result,
          content: result.content.map((c: any) => {
            if (c?.type === "text" && c?.text) {
              const parsed = safeJSONParse(c.text);
              return {
                type: "text",
                text: parsed.success ? parsed.value : c.text,
              };
            }
            return c;
          }),
        };
      }

      return result;
    } catch (err: any) {
      return {
        isError: true,
        error: {
          message: errorToString(err),
          name: err?.name || "ERROR",
        },
        content: [],
      };
    }
  }
}

export function createMCPClientsManager(
  storage?: MCPConfigStorage,
  autoDisconnectSeconds: number = 60 * 30, // 30 minutes
): MCPClientsManager {
  return new MCPClientsManager(storage, autoDisconnectSeconds);
}
