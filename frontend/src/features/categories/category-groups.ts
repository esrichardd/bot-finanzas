import type { Category } from "../../lib/api/categories";

export interface CategoryGroup {
  root: Category;
  children: Category[];
}

export function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const category of categories) {
    if (category.parentId === null) groups.set(category.id, { root: category, children: [] });
  }
  for (const category of categories) {
    if (category.parentId === null) continue;
    const group = groups.get(category.parentId);
    if (group) group.children.push(category);
    else groups.set(category.id, { root: category, children: [] });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, children: [...group.children].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.root.name.localeCompare(b.root.name));
}
