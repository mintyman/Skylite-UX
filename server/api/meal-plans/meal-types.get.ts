import { PrismaClient } from "@prisma/client";
import { consola } from "consola";
import { createError, defineEventHandler, getQuery } from "h3";

const prisma = new PrismaClient();

async function getTandoorConfig(integrationId: string) {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, service: "tandoor", enabled: true },
  });
  if (!integration || !integration.baseUrl) {
    throw createError({ statusCode: 404, statusMessage: "Tandoor integration not found" });
  }
  const baseUrl = integration.baseUrl.endsWith("/") ? integration.baseUrl.slice(0, -1) : integration.baseUrl;
  return { baseUrl, apiKey: integration.apiKey };
}

async function tandoorFetch<T>(baseUrl: string, apiKey: string, path: string): Promise<T> {
  const url = `${baseUrl}/api/${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", Host: "localhost" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    consola.error("Tandoor API error:", response.status, errorText);
    throw createError({ statusCode: response.status, statusMessage: `Tandoor API: ${errorText}` });
  }
  return response.json() as Promise<T>;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const integrationId = query.integrationId as string;

  if (!integrationId) {
    throw createError({ statusCode: 400, statusMessage: "integrationId is required" });
  }

  try {
    const { baseUrl, apiKey } = await getTandoorConfig(integrationId);
    const response = await tandoorFetch<{ results: Array<{ id: number; name: string; order: number }> }>(baseUrl, apiKey, "meal-type/");
    return response.results || [];
  }
  catch (error) {
    consola.error("Meal Plans: Error fetching meal types:", error);
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createError({ statusCode: 500, statusMessage: "Failed to fetch meal types" });
  }
});
