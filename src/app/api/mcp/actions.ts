"use server";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import globalLogger from "logger";
import { z } from "zod";

import { executeApprovedMcpTool } from "lib/ai/mcp/execute-approved-mcp-tool";
import { isMaybeStdioConfig } from "lib/ai/mcp/is-mcp-config";
import { getMcpApprovalTargetFingerprint } from "lib/ai/mcp/mcp-approval-target";
import { validateMcpServerConfig } from "lib/ai/mcp/validate-mcp-server-config";
import { agentMentionsMcpTool } from "lib/ai/speech/voice-agent-mcp-access";
import { createMcpServerConfigFingerprint } from "lib/ai/tools/hitl/mcp-tool-approval";
import {
  canCreateMCP,
  canManageMCPServer,
  canShareMCPServer,
  getCurrentUser,
} from "lib/auth/permissions";
import { IS_MCP_SERVER_REMOTE_ONLY } from "lib/const";
import { McpServerTable } from "lib/db/pg/schema.pg";
import {
  agentRepository,
  mcpOAuthRepository,
  mcpRepository,
} from "lib/db/repository";
import { errorToString } from "lib/utils";

// --- Authorization Helpers ---

async function verifyMcpAccess(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Unauthorized");

  if (currentUser.role === "admin") return;

  const server = await mcpRepository.selectById(id);
  if (!server) throw new Error("MCP server not found");

  if (server.userId !== currentUser.id && server.visibility !== "public") {
    throw new Error("You don't have access to this MCP connection");
  }
}

async function verifyMcpManageAccess(id: string) {
  const mcpServer = await mcpRepository.selectById(id);
  if (!mcpServer) throw new Error("MCP server not found");

  const canManage = await canManageMCPServer(
    mcpServer.userId,
    mcpServer.visibility,
  );
  if (!canManage) {
    throw new Error("You don't have permission to manage this MCP connection");
  }
}
// -----------------------------

export async function selectMcpClientsAction() {
  // Get current user to filter MCP servers
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return [];
  }

  // Get all MCP servers the user can access (their own + shared)
  const accessibleServers = await mcpRepository.selectAllForUser(
    currentUser.id,
  );
  const accessibleIds = new Set(accessibleServers.map((s) => s.id));

  // Get all active clients and filter to only accessible ones
  const list = await mcpClientsManager.getClients();
  return list
    .filter(({ id }) => accessibleIds.has(id))
    .map(({ client, id }) => {
      const server = accessibleServers.find((s) => s.id === id);
      return {
        ...client.getInfo(),
        id,
        userId: server?.userId,
        visibility: server?.visibility,
        isOwner: server?.userId === currentUser.id,
        canManage: server
          ? server.userId === currentUser.id || currentUser.role === "admin"
          : false,
      };
    });
}

export async function selectMcpClientAction(id: string) {
  try {
    await verifyMcpAccess(id);
    const client = await mcpClientsManager.getClient(id);
    if (!client) {
      throw new Error("Client not found");
    }
    const info = client.client.getInfo();
    return {
      ...info,
      id,
      _approvalConfigFingerprint: info.config
        ? createMcpServerConfigFingerprint(info.config)
        : undefined,
    };
  } catch (error) {
    throw new Error(errorToString(error));
  }
}

export async function saveMcpClientAction(
  server: typeof McpServerTable.$inferInsert,
) {
  if (process.env.NOT_ALLOW_ADD_MCP_SERVERS) {
    throw new Error("Not allowed to add MCP servers");
  }

  // Get current user
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("You must be logged in to create MCP connections");
  }

  if (IS_MCP_SERVER_REMOTE_ONLY && isMaybeStdioConfig(server.config)) {
    throw new Error(
      "This deployment only supports remote MCP servers. Switch to an HTTP/S MCP endpoint or self-host for stdio tools like Playwright.",
    );
  }

  validateMcpServerConfig(server.config);

  // Check if user has permission to create/edit MCP connections
  const hasPermission = await canCreateMCP();
  if (!hasPermission) {
    throw new Error("You don't have permission to create MCP connections");
  }
  // Validate name to ensure it only contains alphanumeric characters and hyphens
  const nameSchema = z.string().regex(/^[a-zA-Z0-9\-]+$/, {
    message:
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
  });

  const result = nameSchema.safeParse(server.name);
  if (!result.success) {
    throw new Error(
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
    );
  }

  // Check for duplicate names if creating a featured server
  if (server.visibility === "public") {
    // Only admins can create featured MCP servers
    const canShare = await canShareMCPServer();
    if (!canShare) {
      throw new Error("Only administrators can feature MCP servers");
    }

    // Check if a featured server with this name already exists (global check)
    const existing = await mcpRepository.existsByServerName(server.name);
    if (existing && !server.id) {
      throw new Error("A featured MCP server with this name already exists");
    }
  } else {
    // For private servers, check name uniqueness per-user only
    const existing = await mcpRepository.existsByServerName(
      server.name,
      currentUser.id,
    );
    if (existing && !server.id) {
      throw new Error("You already have an MCP server with this name");
    }
  }

  // Add userId to the server object
  const serverWithUser = {
    ...server,
    userId: currentUser.id,
    visibility: server.visibility || "private",
  };

  const hasInputPlaceholderAuthHeader =
    "url" in server.config &&
    typeof server.config.url === "string" &&
    Object.values(server.config.headers ?? {}).some((value) =>
      /\$\{input:[^}]+\}/i.test(value),
    );

  const previousServer = server.id
    ? await mcpRepository.selectById(server.id)
    : null;

  const persisted = await mcpClientsManager.persistClient(serverWithUser);
  const persistedId = persisted.client.getInfo().id;

  if (hasInputPlaceholderAuthHeader) {
    // Upstream-compatible behavior: allow saving templated auth configs.
    // These are expected to be resolved by users before successful connect.
    return persisted;
  }

  try {
    // Validate connectivity immediately so "saved" means the endpoint is usable.
    await mcpClientsManager.refreshClient(persistedId);
  } catch (error) {
    // Check if the server is now in "authorizing" state (OAuth required).
    // This is a valid state — the server is saved and the user can authorize later.
    const client = await mcpClientsManager.getClient(persistedId).catch((e) => {
      globalLogger.debug("MCP getClient failed", e);
      return null;
    });
    if (client?.client.status === "authorizing") {
      // Server requires OAuth — keep it saved; user will authorize from the dashboard.
      return persisted;
    }

    const message = errorToString(error);

    if (!server.id) {
      // Roll back newly created entries if initial connection test fails.
      await mcpClientsManager.removeClient(persistedId).catch((e) => {
        globalLogger.debug("MCP getClient failed", e);
        return null;
      });
    } else if (previousServer) {
      // Attempt to restore previous server config on failed update.
      await mcpClientsManager
        .persistClient({
          ...previousServer,
          userId: previousServer.userId,
        })
        .catch((e) => {
          globalLogger.debug("MCP getClient failed", e);
          return null;
        });
      await mcpClientsManager.refreshClient(previousServer.id).catch((e) => {
        globalLogger.debug("MCP getClient failed", e);
        return null;
      });
    }

    throw new Error(`MCP connection test failed: ${message}`);
  }

  return persisted;
}

export async function existMcpClientByServerNameAction(serverName: string) {
  const currentUser = await getCurrentUser();
  return await mcpRepository.existsByServerName(serverName, currentUser?.id);
}

export async function removeMcpClientAction(id: string) {
  await verifyMcpManageAccess(id);

  await mcpClientsManager.removeClient(id);
}

export async function refreshMcpClientAction(id: string) {
  try {
    await verifyMcpManageAccess(id);
    await mcpClientsManager.refreshClient(id);
  } catch (error) {
    throw new Error(errorToString(error));
  }
}

export async function authorizeMcpClientAction(id: string) {
  try {
    await verifyMcpManageAccess(id);
    await refreshMcpClientAction(id);
    const client = await mcpClientsManager.getClient(id);
    if (client?.client.status != "authorizing") {
      throw new Error("Not Authorizing");
    }
    return client.client.getAuthorizationUrl()?.toString();
  } catch (error) {
    throw new Error(errorToString(error));
  }
}

export async function checkTokenMcpClientAction(id: string) {
  await verifyMcpAccess(id);
  const session = await mcpOAuthRepository.getAuthenticatedSession(id);

  // for wait connect to mcp server
  await mcpClientsManager.getClient(id).catch((e) => {
    globalLogger.debug("MCP getClient failed", e);
    return null;
  });

  return !!session?.tokens;
}

export async function callMcpToolAction(
  id: string,
  toolName: string,
  input: unknown,
  approvalToken: unknown,
) {
  await verifyMcpAccess(id);
  const currentUser = await getCurrentUser();
  const server = await mcpRepository.selectById(id);
  if (!currentUser || !server) throw new Error("MCP server not found");
  return executeApprovedMcpTool({
    userId: currentUser.id,
    token: approvalToken,
    approvalPayload: {
      serverId: id,
      serverName: server.name,
      toolName,
      payload: input,
    },
    getCurrentConfigFingerprint: () =>
      getMcpApprovalTargetFingerprint({
        userId: currentUser.id,
        userRole: currentUser.role,
        approval: { serverId: id, serverName: server.name },
      }),
    execute: (expectedConfigFingerprint) =>
      mcpClientsManager.toolCall(
        id,
        toolName,
        input,
        expectedConfigFingerprint,
        server.name,
      ),
  });
}

export async function callMcpToolByServerNameAction(
  serverName: string,
  toolName: string,
  input: unknown,
  serverId: string,
  approvalToken: unknown,
) {
  await verifyMcpAccess(serverId);
  const currentUser = await getCurrentUser();
  const server = await mcpRepository.selectById(serverId);
  if (!currentUser || !server || server.name !== serverName)
    throw new Error("MCP server not found");
  return executeApprovedMcpTool({
    userId: currentUser.id,
    token: approvalToken,
    approvalPayload: {
      serverId,
      serverName: server.name,
      toolName,
      payload: input,
    },
    getCurrentConfigFingerprint: () =>
      getMcpApprovalTargetFingerprint({
        userId: currentUser.id,
        userRole: currentUser.role,
        approval: { serverId, serverName: server.name },
      }),
    execute: (expectedConfigFingerprint) =>
      mcpClientsManager.toolCall(
        serverId,
        toolName,
        input,
        expectedConfigFingerprint,
        server.name,
      ),
  });
}

export async function callApprovedMcpToolAction(
  id: string,
  serverName: string,
  toolName: string,
  input: unknown,
  approvalToken: unknown,
) {
  await verifyMcpAccess(id);
  const currentUser = await getCurrentUser();
  const server = await mcpRepository.selectById(id);
  if (!currentUser || !server || server.name !== serverName)
    throw new Error("MCP server not found");
  return executeApprovedMcpTool({
    userId: currentUser.id,
    token: approvalToken,
    approvalPayload: {
      serverId: id,
      serverName: server.name,
      toolName,
      payload: input,
    },
    getCurrentConfigFingerprint: () =>
      getMcpApprovalTargetFingerprint({
        userId: currentUser.id,
        userRole: currentUser.role,
        approval: { serverId: id, serverName: server.name },
      }),
    execute: (expectedConfigFingerprint) =>
      mcpClientsManager.toolCall(
        id,
        toolName,
        input,
        expectedConfigFingerprint,
        server.name,
      ),
  });
}

/** Dispatch a voice-delegated MCP call only while the selected agent still has access to that exact tool. */
export async function callApprovedVoiceMcpToolAction(
  agentId: string,
  id: string,
  serverName: string,
  toolName: string,
  input: unknown,
  approvalToken: unknown,
) {
  await verifyMcpAccess(id);
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("Unauthorized");
  const agent = await agentRepository.selectAgentById(agentId, currentUser.id);
  if (
    !agent ||
    !(await agentRepository.checkAccess(agentId, currentUser.id)) ||
    !agentMentionsMcpTool(agent.instructions.mentions, id, toolName)
  ) {
    throw new Error("The delegated agent can no longer use this MCP tool");
  }

  const server = await mcpRepository.selectById(id);
  if (!server || server.name !== serverName)
    throw new Error("MCP server not found");

  const approvalPayload = {
    agentId,
    serverId: id,
    serverName: server.name,
    toolName,
    payload: input,
  };
  return executeApprovedMcpTool({
    userId: currentUser.id,
    token: approvalToken,
    approvalPayload,
    getCurrentConfigFingerprint: () =>
      getMcpApprovalTargetFingerprint({
        userId: currentUser.id,
        userRole: currentUser.role,
        approval: { serverId: id, serverName: server.name },
      }),
    execute: (expectedConfigFingerprint) =>
      mcpClientsManager.toolCall(
        id,
        toolName,
        input,
        expectedConfigFingerprint,
        server.name,
      ),
  });
}

export async function shareMcpServerAction(
  id: string,
  visibility: "public" | "private",
) {
  // Only admins can feature MCP servers
  const canShare = await canShareMCPServer();
  if (!canShare) {
    throw new Error("Only administrators can feature MCP servers");
  }

  // Update the visibility of the MCP server
  await mcpRepository.updateVisibility(id, visibility);

  return { success: true };
}
