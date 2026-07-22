import { consola } from "consola";
import { createError, defineEventHandler, getRouterParam, getQuery } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const query = getQuery(event);
  const integrationId = query.integrationId as string;

  if (!integrationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "integrationId is required",
    });
  }

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Meal plan id is required",
    });
  }

  try {
    const service = new TandoorService(integrationId);
    await service.deleteMealPlan(Number(id));
    return { success: true };
  }
  catch (error) {
    consola.error(`Meal Plans: Error deleting meal plan ${id}:`, error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to delete meal plan",
    });
  }
});
