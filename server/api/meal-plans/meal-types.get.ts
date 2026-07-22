import { consola } from "consola";
import { createError, defineEventHandler, getQuery } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const integrationId = query.integrationId as string;

  if (!integrationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "integrationId is required",
    });
  }

  try {
    const service = new TandoorService(integrationId);
    const mealTypes = await service.getMealTypes();
    return mealTypes;
  }
  catch (error) {
    consola.error("Meal Plans: Error fetching meal types:", error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to fetch meal types",
    });
  }
});
