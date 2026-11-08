import { removeMcpClientAction } from "@/app/api/mcp/actions";
import { saveMcpClientAction } from "@/app/api/mcp/actions";
import {
  MCPRemoteConfigZodSchema,
  MCPStdioConfigZodSchema,
} from "app-types/mcp";
import { getSession } from "auth/server";
import { validateMcpServerConfig } from "lib/ai/mcp/validate-mcp-server-config";
import { canManageMCPServer } from "lib/auth/permissions";
import { pgMcpRepository } from "lib/db/pg/repositories/mcp-repository.pg";
import { mcpOAuthRepository } from "lib/db/repository";
import logger from "lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const UpdateMcpServerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9-]+$/),
  config: z.union([MCPRemoteConfigZodSchema, MCPStdioConfigZodSchema]),
});

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const server = await pgMcpRepository.selectById(id);
    if (!server) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 },
      );
    }
    if (!(await canManageMCPServer(server.userId, server.visibility))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = UpdateMcpServerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid MCP server configuration" },
        { status: 400 },
      );
    }

    try {
      validateMcpServerConfig(parsed.data.config);
    } catch {
      return NextResponse.json(
        { error: "Invalid MCP server configuration" },
        { status: 400 },
      );
    }

    const servers = await pgMcpRepository.selectAllForUser(server.userId);
    if (
      servers.some(
        (candidate) =>
          candidate.id !== id &&
          candidate.userId === server.userId &&
          candidate.name === parsed.data.name,
      )
    ) {
      return NextResponse.json(
        { error: "An MCP server with this name already exists" },
        { status: 409 },
      );
    }

    const oldUrl = "url" in server.config ? server.config.url : undefined;
    const newUrl =
      "url" in parsed.data.config ? parsed.data.config.url : undefined;
    if (oldUrl && oldUrl !== newUrl) {
      // OAuth tokens and in-flight PKCE state belong to the original endpoint.
      // Remove them before reconnecting with a changed URL so credentials are
      // never sent to a different MCP host.
      await mcpOAuthRepository.deleteAllByMcpServerId(id);
    }

    const result = await saveMcpClientAction({
      id,
      ...parsed.data,
      userId: server.userId,
      visibility: server.visibility,
    });
    return NextResponse.json({ success: true, id: result.client.getInfo().id });
  } catch (error) {
    logger.error("Failed to update MCP server:", error);
    return NextResponse.json(
      { error: "Failed to update MCP server" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const mcpServer = await pgMcpRepository.selectById(params.id);
    if (!mcpServer) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 },
      );
    }
    const canManage = await canManageMCPServer(
      mcpServer.userId,
      mcpServer.visibility,
    );
    if (!canManage) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await removeMcpClientAction(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete MCP server:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete MCP server",
      },
      {
        status:
          error instanceof Error && error.message.includes("permission")
            ? 403
            : 500,
      },
    );
  }
}
