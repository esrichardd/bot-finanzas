"use client";

import type { Category } from "../../../lib/api/categories";
import type { CategoryGroup } from "../category-groups";
import { CategoryCard } from "./category-card";

export function CategoriesGrid({ groups, categories, archived, onAddChild, onEdit, onArchive, onRowRestore }: {
  groups: CategoryGroup[];
  categories: Category[];
  archived: boolean;
  onAddChild: (category: Category) => void;
  onEdit: (category: Category) => void;
  onArchive: (category: Category) => void;
  onRowRestore: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <CategoryCard allCategories={categories} archived={archived} group={group} key={group.root.id} onAddChild={onAddChild} onArchive={onArchive} onEdit={onEdit} onRowRestore={onRowRestore} />
      ))}
    </div>
  );
}
