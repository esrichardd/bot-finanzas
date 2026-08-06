import type { Category } from "../../lib/api/categories";

export interface CategoryVisual {
  emoji: string;
  color: string | null;
}

export function getCategoryVisual(category: Category, parent?: Category): CategoryVisual {
  return {
    emoji: category.emoji ?? parent?.emoji ?? "🏷️",
    color: category.color ?? parent?.color ?? null,
  };
}
