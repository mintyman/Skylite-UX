export type TandoorShoppingList = {
  id: number;
  title: string;
  created_by: number;
  created_at: string;
  note: string;
  entries: TandoorShoppingListEntry[];
};

export type TandoorShoppingListEntry = {
  id: number;
  list_recipe: number | null;
  food: {
    id: number;
    name: string;
    plural_name: string;
  };
  unit: {
    id: number;
    name: string;
    plural_name: string;
  } | null;
  amount: number;
  order: number;
  checked: boolean;
};

export type TandoorFood = {
  id: number;
  name: string;
};

export type TandoorUnit = {
  id: number;
  name: string;
  plural_name: string;
};

export type TandoorMealPlan = {
  id: number;
  title: string;
  recipe: {
    id: number;
    name: string;
    description: string;
    image: string | null;
    keywords: { id: number; label: string }[];
    working_time: number;
    waiting_time: number;
    servings: number;
    servings_text: string;
    rating: number | null;
    created_by: {
      id: number;
      username: string;
      display_name: string;
    };
  } | null;
  servings: number;
  note: string;
  from_date: string;
  to_date: string;
  meal_type: {
    id: number;
    name: string;
    order: number;
    time: string | null;
    color: string | null;
  };
  created_by: number;
  shared: number[];
  recipe_name: string;
  meal_type_name: string;
  shopping: boolean;
};

export type TandoorMealType = {
  id: number;
  name: string;
  order: number;
  time: string | null;
  color: string | null;
  default: boolean;
  created_by: number;
};

export type TandoorRecipe = {
  id: number;
  name: string;
  description: string;
  image: string | null;
  keywords: { id: number; label: string }[];
  working_time: number;
  waiting_time: number;
  servings: number;
  servings_text: string;
  rating: number | null;
  created_by: {
    id: number;
    username: string;
    display_name: string;
  };
  created_at: string;
  updated_at: string;
};
