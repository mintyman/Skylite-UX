import { consola } from "consola";
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event);
  const { integrationId, ...updateData } = body;

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
    const result = await service.updateMealPlan(Number(id), updateData);
    return result;
  }
  catch (error) {
    consola.error(`Meal Plans: Error updating meal plan ${id}:`, error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to update meal plan",
    });
  }
});
