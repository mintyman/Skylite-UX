import { consola } from "consola";
import { createError, defineEventHandler, getQuery } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const integrationId = query.integrationId as string;
  const searchQuery = (query.query as string) || "";

  if (!integrationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "integrationId is required",
    });
  }

  try {
    const service = new TandoorService(integrationId);
    const recipes = await service.searchRecipes(searchQuery);
    return recipes;
  }
  catch (error) {
    consola.error("Meal Plans: Error searching recipes:", error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to search recipes",
    });
  }
});
