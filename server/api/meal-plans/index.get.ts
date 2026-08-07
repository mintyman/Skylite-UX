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

async function tandoorFetch<T>(baseUrl: string, apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl}/api/${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", Host: "localhost" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
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
  const from = query.from as string;
  const to = query.to as string;

  if (!integrationId) {
    throw createError({ statusCode: 400, statusMessage: "integrationId is required" });
  }
  if (!from || !to) {
    throw createError({ statusCode: 400, statusMessage: "from and to dates are required" });
  }

  try {
    const { baseUrl, apiKey } = await getTandoorConfig(integrationId);
    const response = await tandoorFetch<{ results: Array<{
      id: number;
      recipe: { id: number; name: string; image: string; description: string };
      meal_type: { id: number; name: string };
      from_date: string;
      to_date: string;
      servings: string;
      note: string;
      shopping: boolean;
    }>; count: number }>(baseUrl, apiKey, `meal-plan/?from=${from}&to=${to}`);
    return response.results || [];
  }
  catch (error) {
    consola.error("Meal Plans: Error fetching:", error);
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createError({ statusCode: 500, statusMessage: "Failed to fetch meal plans" });
  }
});
