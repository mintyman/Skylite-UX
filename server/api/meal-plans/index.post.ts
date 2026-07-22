import { consola } from "consola";
import { createError, defineEventHandler, readBody } from "h3";

import { TandoorService } from "../../integrations/tandoor/client";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { integrationId, ...mealPlanData } = body;

  if (!integrationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "integrationId is required",
    });
  }

  if (!mealPlanData.recipe || !mealPlanData.meal_type || !mealPlanData.from_date || !mealPlanData.to_date) {
    throw createError({
      statusCode: 400,
      statusMessage: "recipe, meal_type, from_date, and to_date are required",
    });
  }

  try {
    const service = new TandoorService(integrationId);
    const result = await service.createMealPlan(mealPlanData);
    return result;
  }
  catch (error) {
    consola.error("Meal Plans: Error creating meal plan:", error);
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Failed to create meal plan",
    });
  }
});
