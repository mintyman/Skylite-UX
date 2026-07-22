import { consola } from "consola";
import { createError, defineEventHandler, getQuery } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const integrationId = query.integrationId as string;
  const from = query.from as string;
  const to = query.to as string;

  if (!integrationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "integrationId is required",
    });
  }

  if (!from || !to) {
    throw createError({
      statusCode: 400,
      statusMessage: "from and to date parameters are required (YYYY-MM-DD)",
    });
  }

  try {
    const service = new TandoorService(integrationId);
    const mealPlan = await service.getMealPlan(from, to);
    return mealPlan;
  }
  catch (error) {
    consola.error("Meal Plans: Error fetching meal plans:", error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to fetch meal plans",
    });
  }
});
