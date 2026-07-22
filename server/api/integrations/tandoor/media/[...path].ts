import { PrismaClient } from "@prisma/client";
import { createError, defineEventHandler, getQuery, getRouterParam } from "h3";

const prisma = new PrismaClient();

export default defineEventHandler(async (event) => {
  const pathParts = event.context.params?.path;
  const query = getQuery(event);
  const integrationId = query.integrationId as string;

  if (!integrationId) {
    throw createError({ statusCode: 400, statusMessage: "integrationId is required" });
  }

  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, service: "tandoor", enabled: true },
  });
  if (!integration || !integration.baseUrl) {
    throw createError({ statusCode: 404, statusMessage: "Tandoor integration not found" });
  }

  const baseUrl = integration.baseUrl.endsWith("/") ? integration.baseUrl.slice(0, -1) : integration.baseUrl;
  const path = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;
  const url = `${baseUrl}/${path}`;

  const headers: Record<string, string> = { Host: "localhost" };
  if (integration.apiKey) headers.Authorization = `Bearer ${integration.apiKey}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw createError({ statusCode: response.status, statusMessage: "Failed to fetch media" });
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = await response.arrayBuffer();

  event.node.res.setHeader("Content-Type", contentType);
  event.node.res.setHeader("Cache-Control", "public, max-age=86400");
  return Buffer.from(buffer);
});
