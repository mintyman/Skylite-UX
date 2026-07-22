import { consola } from "consola";

import type {
  TandoorFood,
  TandoorMealPlan,
  TandoorMealType,
  TandoorRecipe,
  TandoorShoppingListEntry,
  TandoorUnit,
} from "./types";

export class TandoorService {
  private integrationId: string;

  constructor(integrationId: string) {
    this.integrationId = integrationId;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const formattedEndpoint = path.startsWith("/") ? path : `/${path}`;
    const url = `/api/integrations/tandoor${formattedEndpoint}?integrationId=${this.integrationId}`;

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      consola.error("Tandoor Client: Response error:", errorText);
      throw new Error(`Tandoor API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getShoppingListEntries(): Promise<TandoorShoppingListEntry[]> {
    const response = await this.request<TandoorShoppingListEntry[]>("/shopping-list-entry/");
    return response;
  }

  async getShoppingListEntry(id: number): Promise<TandoorShoppingListEntry> {
    return await this.request<TandoorShoppingListEntry>(`/shopping-list-entry/${id}/`);
  }

  async createShoppingListEntry(data: {
    food: { name: string };
    unit?: { name: string };
    amount: string;
    list_recipe?: number;
  }): Promise<TandoorShoppingListEntry> {
    const response = await this.request<TandoorShoppingListEntry>("/shopping-list-entry/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return response;
  }

  async updateShoppingListEntry(id: number, data: {
    amount?: string;
    checked?: boolean;
    order?: number;
  }): Promise<TandoorShoppingListEntry> {
    return await this.request<TandoorShoppingListEntry>(`/shopping-list-entry/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteShoppingListEntry(id: number): Promise<void> {
    await this.request(`/shopping-list-entry/${id}/`, {
      method: "DELETE",
    });
  }

  async searchFoods(query: string): Promise<TandoorFood[]> {
    const response = await this.request<{ results: TandoorFood[] }>(`/food/?search=${encodeURIComponent(query)}`);
    return response.results;
  }

  async getUnits(): Promise<TandoorUnit[]> {
    const response = await this.request<{ results: TandoorUnit[] }>("/unit/");
    return response.results;
  }

  async getMealPlan(from: string, to: string): Promise<TandoorMealPlan[]> {
    const response = await this.request<{ results: TandoorMealPlan[]; count: number }>(
      `/meal-plan/?from=${from}&to=${to}`,
    );
    return response.results || [];
  }

  async createMealPlan(data: {
    recipe: { id: number };
    meal_type: { id: number };
    from_date: string;
    to_date: string;
    servings: number;
    note?: string;
    shopping?: boolean;
  }): Promise<TandoorMealPlan> {
    return await this.request<TandoorMealPlan>("/meal-plan/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async updateMealPlan(id: number, data: {
    recipe?: { id: number };
    meal_type?: { id: number };
    from_date?: string;
    to_date?: string;
    servings?: number;
    note?: string;
  }): Promise<TandoorMealPlan> {
    return await this.request<TandoorMealPlan>(`/meal-plan/${id}/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async deleteMealPlan(id: number): Promise<void> {
    await this.request(`/meal-plan/${id}/`, {
      method: "DELETE",
    });
  }

  async getMealTypes(): Promise<TandoorMealType[]> {
    const response = await this.request<{ results: TandoorMealType[] }>("/meal-type/");
    return response.results || [];
  }

  async searchRecipes(query: string): Promise<TandoorRecipe[]> {
    const params = query ? `?query=${encodeURIComponent(query)}&page_size=20` : "?page_size=20";
    const response = await this.request<{ results: TandoorRecipe[] }>(`/recipe/${params}`);
    return response.results || [];
  }
}
