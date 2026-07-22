<script setup lang="ts">
import { format, addDays, startOfWeek, endOfWeek, subWeeks, addWeeks } from "date-fns";

import type { TandoorMealPlan, TandoorMealType, TandoorRecipe } from "../../server/integrations/tandoor/types";

const { getStableDate } = useStableDate();
const { success: showSuccess, error: showError } = useAlertToast();

const currentDate = ref(getStableDate());
const mealPlans = ref<TandoorMealPlan[]>([]);
const mealTypes = ref<TandoorMealType[]>([]);
const isLoading = ref(true);
const isAddModalOpen = ref(false);
const selectedDate = ref<string>("");
const searchQuery = ref("");
const searchResults = ref<TandoorRecipe[]>([]);
const isSearching = ref(false);
const selectedRecipe = ref<TandoorRecipe | null>(null);
const servings = ref(1);
const note = ref("");
const isSaving = ref(false);

const isRecipeDetailOpen = ref(false);
const recipeDetail = ref<Record<string, unknown> | null>(null);
const recipeDetailLoading = ref(false);

const tandoorIntegration = ref<{ id: string; apiKey: string; baseUrl: string } | null>(null);

const weekStart = computed(() => startOfWeek(currentDate.value, { weekStartsOn: 1 }));
const weekEnd = computed(() => endOfWeek(currentDate.value, { weekStartsOn: 1 }));

const weekDays = computed(() => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart.value, i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayMeals = mealPlans.value.filter(
      (plan) => plan.from_date && plan.from_date.startsWith(dateStr),
    );
    days.push({
      date,
      dateStr,
      dayName: format(date, "EEE"),
      dayNumber: format(date, "d"),
      monthName: format(date, "MMM"),
      isToday: format(date, "yyyy-MM-dd") === format(getStableDate(), "yyyy-MM-dd"),
      meals: dayMeals,
    });
  }
  return days;
});

const weekTitle = computed(() => {
  return `${format(weekStart.value, "d MMM")} – ${format(weekEnd.value, "d MMM yyyy")}`;
});

async function loadIntegration() {
  try {
    const integrations = await $fetch<{ id: string; type: string; service: string; apiKey: string; baseUrl: string }[]>("/api/integrations");
    const tandoor = integrations.find(
      (i) => i.service === "tandoor" && i.enabled && (i.type === "shopping" || i.type === "meal"),
    );
    if (tandoor) {
      tandoorIntegration.value = tandoor;
      return true;
    }
    return false;
  }
  catch {
    return false;
  }
}

async function loadMealPlans() {
  if (!tandoorIntegration.value) return;

  isLoading.value = true;
  try {
    const from = format(weekStart.value, "yyyy-MM-dd");
    const to = format(weekEnd.value, "yyyy-MM-dd");
    const result = await $fetch<TandoorMealPlan[]>("/api/meal-plans", {
      query: {
        integrationId: tandoorIntegration.value.id,
        from,
        to,
      },
    });
    mealPlans.value = result || [];
  }
  catch (error) {
    console.error("Failed to load meal plans:", error);
    showError("Failed to load meal plans");
  }
  finally {
    isLoading.value = false;
  }
}

async function loadMealTypes() {
  if (!tandoorIntegration.value) return;

  try {
    const result = await $fetch<TandoorMealType[]>("/api/meal-plans/meal-types", {
      query: { integrationId: tandoorIntegration.value.id },
    });
    mealTypes.value = result || [];
  }
  catch (error) {
    console.error("Failed to load meal types:", error);
  }
}

async function searchRecipesHandler() {
  if (!tandoorIntegration.value) return;
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }

  isSearching.value = true;
  try {
    const result = await $fetch<TandoorRecipe[]>("/api/meal-plans/recipes", {
      query: {
        integrationId: tandoorIntegration.value.id,
        query: searchQuery.value,
      },
    });
    searchResults.value = result || [];
  }
  catch (error) {
    console.error("Failed to search recipes:", error);
  }
  finally {
    isSearching.value = false;
  }
}

function openAddModal(dateStr: string) {
  selectedDate.value = dateStr;
  selectedRecipe.value = null;
  searchQuery.value = "";
  searchResults.value = [];
  servings.value = 1;
  note.value = "";
  isAddModalOpen.value = true;
}

function selectRecipe(recipe: TandoorRecipe) {
  selectedRecipe.value = recipe;
  servings.value = recipe.servings || 1;
  searchResults.value = [];
  searchQuery.value = recipe.name;
}

async function saveMealPlan() {
  if (!tandoorIntegration.value || !selectedRecipe.value || !selectedDate.value) return;

  const defaultMealType = mealTypes.value[0];
  if (!defaultMealType) {
    showError("No meal types available in Tandoor");
    return;
  }

  isSaving.value = true;
  try {
    await $fetch("/api/meal-plans", {
      method: "POST",
      body: {
        integrationId: tandoorIntegration.value.id,
        recipe: { id: selectedRecipe.value.id },
        meal_type: { id: defaultMealType.id },
        from_date: `${selectedDate.value}T18:00:00`,
        to_date: `${selectedDate.value}T18:00:00`,
        servings: servings.value,
        note: note.value,
        shopping: false,
      },
    });

    showSuccess("Meal plan added");
    isAddModalOpen.value = false;
    await loadMealPlans();
  }
  catch (error) {
    console.error("Failed to save meal plan:", error);
    showError("Failed to save meal plan");
  }
  finally {
    isSaving.value = false;
  }
}

async function deleteMealPlan(mealPlanId: number) {
  if (!tandoorIntegration.value) return;

  try {
    await $fetch(`/api/meal-plans/${mealPlanId}`, {
      method: "DELETE",
      query: { integrationId: tandoorIntegration.value.id },
    });

    showSuccess("Meal plan removed");
    await loadMealPlans();
  }
  catch (error) {
    console.error("Failed to delete meal plan:", error);
    showError("Failed to delete meal plan");
  }
}

async function openRecipeDetail(recipeId: number) {
  if (!tandoorIntegration.value) return;
  recipeDetailLoading.value = true;
  recipeDetail.value = null;
  isRecipeDetailOpen.value = true;
  try {
    const result = await $fetch<Record<string, unknown>>(`/api/meal-plans/recipes/${recipeId}`, {
      query: { integrationId: tandoorIntegration.value.id },
    });
    recipeDetail.value = result;
  }
  catch (error) {
    console.error("Failed to load recipe:", error);
    showError("Failed to load recipe details");
    isRecipeDetailOpen.value = false;
  }
  finally {
    recipeDetailLoading.value = false;
  }
}

function getRecipeSteps(recipe: Record<string, unknown>): Array<{ instruction: string; order: number; name?: string }> {
  const steps = recipe.steps as Array<{ instruction: string; order: number; name?: string }> | undefined;
  if (!steps || !Array.isArray(steps)) return [];
  return steps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function formatMinutes(mins: unknown): string {
  const n = Number(mins);
  if (!n || n <= 0) return "";
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getRecipeImageUrl(imageUrl: string): string {
  if (!imageUrl) return "";
  const path = imageUrl.replace(/^https?:\/\/[^/]+/, "");
  return `/api/integrations/tandoor/media${path}`;
}

function previousWeek() {
  currentDate.value = subWeeks(currentDate.value, 1);
}

function nextWeek() {
  currentDate.value = addWeeks(currentDate.value, 1);
}

function goToToday() {
  currentDate.value = getStableDate();
}

watch(currentDate, () => {
  loadMealPlans();
});

onMounted(async () => {
  const hasIntegration = await loadIntegration();
  if (hasIntegration) {
    await Promise.all([loadMealPlans(), loadMealTypes()]);
  }
  else {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="flex w-full flex-col rounded-lg">
    <div class="py-5 sm:px-4 sticky top-0 z-40 bg-default border-b border-default">
      <GlobalDateHeader />
    </div>

    <div class="flex flex-col gap-4 p-4">
      <div v-if="!tandoorIntegration" class="flex flex-col items-center justify-center gap-4 py-16">
        <UIcon name="i-lucide-utensils" class="size-12 text-muted" />
        <p class="text-muted text-center">
          No Tandoor integration found.<br>
          Please add a Tandoor integration in Settings → Integrations.
        </p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              @click="previousWeek"
            />
            <h2 class="text-lg font-semibold min-w-[200px] text-center">
              {{ weekTitle }}
            </h2>
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              @click="nextWeek"
            />
            <UButton
              label="Today"
              color="neutral"
              variant="outline"
              size="xs"
              @click="goToToday"
            />
          </div>
        </div>

        <div v-if="isLoading" class="flex items-center justify-center py-16">
          <ULoadingIcon />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div
            v-for="day in weekDays"
            :key="day.dateStr"
            class="flex flex-col rounded-lg border border-default bg-default overflow-hidden"
          >
            <div
              class="flex items-center justify-between px-3 py-2 border-b border-default"
              :class="day.isToday ? 'bg-primary/10' : ''"
            >
              <div class="flex flex-col">
                <span class="text-xs font-medium uppercase text-muted">{{ day.dayName }}</span>
                <span class="text-sm font-bold" :class="day.isToday ? 'text-primary' : ''">{{ day.dayNumber }} {{ day.monthName }}</span>
              </div>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="xs"
                class="opacity-50 hover:opacity-100"
                @click="openAddModal(day.dateStr)"
              />
            </div>

            <div class="flex flex-col gap-1 p-2 min-h-[80px] flex-1">
              <div
                v-for="meal in day.meals"
                :key="meal.id"
                class="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <p
                    class="text-xs font-medium truncate cursor-pointer text-primary hover:underline"
                    @click.stop="openRecipeDetail(meal.recipe?.id || 0)"
                  >
                    {{ meal.recipe_name || meal.recipe?.name || "Unknown recipe" }}
                  </p>
                  <p v-if="meal.note" class="text-[10px] text-muted truncate">
                    {{ meal.note }}
                  </p>
                  <p class="text-[10px] text-muted">
                    {{ meal.meal_type_name }}
                  </p>
                </div>
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 shrink-0"
                  @click="deleteMealPlan(meal.id)"
                />
              </div>

              <div
                v-if="day.meals.length === 0"
                class="flex items-center justify-center h-full min-h-[60px]"
              >
                <UButton
                  label="+ Add meal"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="opacity-40 hover:opacity-100"
                  @click="openAddModal(day.dateStr)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <UModal v-model:open="isAddModalOpen" title="Add Meal Plan" :ui="{ content: 'w-[450px]' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <div>
            <label class="text-sm font-medium mb-1 block">Date</label>
            <p class="text-sm text-muted">{{ selectedDate }}</p>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Search Recipe</label>
            <UInput
              v-model="searchQuery"
              placeholder="Search recipes..."
              icon="i-lucide-search"
              :loading="isSearching"
              @input="searchRecipesHandler"
            />
          </div>

          <div v-if="searchResults.length > 0" class="max-h-[200px] overflow-y-auto border border-default rounded-lg">
            <div
              v-for="recipe in searchResults"
              :key="recipe.id"
              class="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-default last:border-0"
              @click="selectRecipe(recipe)"
            >
              <div
                v-if="recipe.image"
                class="w-10 h-10 rounded overflow-hidden bg-muted shrink-0"
              >
                <img :src="recipe.image" :alt="recipe.name" class="w-full h-full object-cover">
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ recipe.name }}</p>
                <p class="text-xs text-muted truncate">{{ recipe.description }}</p>
              </div>
            </div>
          </div>

          <div v-if="selectedRecipe" class="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div class="flex items-center gap-3">
              <div
                v-if="selectedRecipe.image"
                class="w-12 h-12 rounded overflow-hidden bg-muted shrink-0"
              >
                <img :src="selectedRecipe.image" :alt="selectedRecipe.name" class="w-full h-full object-cover">
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold">{{ selectedRecipe.name }}</p>
                <p class="text-xs text-muted truncate">{{ selectedRecipe.description }}</p>
              </div>
            </div>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Servings</label>
            <UInput
              v-model.number="servings"
              type="number"
              :min="1"
              :max="20"
            />
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Notes (optional)</label>
            <UInput
              v-model="note"
              placeholder="Any notes..."
            />
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="isAddModalOpen = false"
          />
          <UButton
            label="Add Meal"
            :loading="isSaving"
            :disabled="!selectedRecipe"
            @click="saveMealPlan"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="isRecipeDetailOpen" :ui="{ content: 'w-[550px] max-h-[85vh]' }">
      <template #header>
        <div class="flex items-center justify-between w-full">
          <h3 class="text-base font-semibold leading-6">
            {{ (recipeDetail?.name as string) || "Recipe" }}
          </h3>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="-my-1"
            @click="isRecipeDetailOpen = false"
          />
        </div>
      </template>

      <template #body>
        <div v-if="recipeDetailLoading" class="flex items-center justify-center py-12">
          <ULoadingIcon />
        </div>

        <div v-else-if="recipeDetail" class="flex flex-col gap-5">
          <div v-if="recipeDetail.image" class="w-full h-48 rounded-lg overflow-hidden bg-muted">
            <img
              :src="getRecipeImageUrl(recipeDetail.image as string)"
              :alt="(recipeDetail.name as string)"
              class="w-full h-full object-cover"
            >
          </div>

          <div v-if="recipeDetail.description" class="text-sm text-muted">
            {{ recipeDetail.description }}
          </div>

          <div class="flex flex-wrap gap-3 text-xs text-muted">
            <div v-if="recipeDetail.servings" class="flex items-center gap-1">
              <UIcon name="i-lucide-users" class="size-3.5" />
              <span>{{ recipeDetail.servings }} servings</span>
            </div>
            <div v-if="(recipeDetail.working_time as number) > 0" class="flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="size-3.5" />
              <span>Prep: {{ formatMinutes(recipeDetail.working_time) }}</span>
            </div>
            <div v-if="(recipeDetail.waiting_time as number) > 0" class="flex items-center gap-1">
              <UIcon name="i-lucide-hourglass" class="size-3.5" />
              <span>Cook: {{ formatMinutes(recipeDetail.waiting_time) }}</span>
            </div>
          </div>

          <div v-if="recipeDetail.keywords && (recipeDetail.keywords as unknown[]).length > 0" class="flex flex-wrap gap-1">
            <UBadge
              v-for="kw in (recipeDetail.keywords as Array<{ label: string }>).slice(0, 10)"
              :key="kw.label"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ kw.label }}
            </UBadge>
          </div>

          <div v-if="getRecipeSteps(recipeDetail).length > 0" class="flex flex-col gap-3">
            <h4 class="text-sm font-semibold">Instructions</h4>
            <div
              v-for="(step, idx) in getRecipeSteps(recipeDetail)"
              :key="idx"
              class="flex gap-3"
            >
              <div class="flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                {{ idx + 1 }}
              </div>
              <p class="text-sm text-muted leading-relaxed whitespace-pre-line">
                {{ step.instruction }}
              </p>
            </div>
          </div>

          <div v-if="recipeDetail.source_url" class="pt-2 border-t border-default">
            <a
              :href="recipeDetail.source_url as string"
              target="_blank"
              rel="noopener"
              class="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <UIcon name="i-lucide-external-link" class="size-3" />
              View source
            </a>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
