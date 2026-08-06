"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import type { Category } from "../../../lib/api/categories";
import { getCategoryVisual } from "../category-visual";
import type { CategoryGroup } from "../category-groups";
import { CategoryRowActions } from "./category-row-actions";

export function CategoryCard({ group, allCategories, archived, onAddChild, onEdit, onArchive, onRowRestore }: {
  group: CategoryGroup;
  allCategories: Category[];
  archived: boolean;
  onAddChild: (category: Category) => void;
  onEdit: (category: Category) => void;
  onArchive: (category: Category) => void;
  onRowRestore: () => void;
}) {
  const t = useTranslations("categories");
  const parent = group.root.parentId ? allCategories.find((category) => category.id === group.root.parentId) : undefined;
  const rootVisual = getCategoryVisual(group.root, parent);
  const children = group.children;
  const rootStyle = rootVisual.color ? { backgroundColor: `${rootVisual.color}1A`, borderColor: `${rootVisual.color}40` } : undefined;
  const childById = new Map(allCategories.map((category) => [category.id, category]));

  return (
    <Card className="border" style={rootStyle}>
      <CardHeader className="gap-4 pb-1">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background/70 text-2xl" style={rootVisual.color ? { borderColor: `${rootVisual.color}55` } : undefined}>{rootVisual.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-medium">{group.root.name}</h2>
              <Badge>{group.root.isSystem ? t("systemBadge") : group.root.parentId ? t("subcategoryBadge") : t("mineBadge")}</Badge>
            </div>
            <p className="mt-1 line-clamp-2 min-h-5 text-sm text-muted-foreground">{group.root.description || t("noDescription")}</p>
          </div>
          <CategoryRowActions
            archived={archived}
            category={group.root}
            onAddChild={!archived && group.root.parentId === null ? () => onAddChild(group.root) : undefined}
            onArchive={!archived && !group.root.isSystem ? () => onArchive(group.root) : undefined}
            onEdit={!archived && !group.root.isSystem ? () => onEdit(group.root) : undefined}
            onSuccess={onRowRestore}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        {children.length > 0 ? (
          <div className="divide-y rounded-lg border bg-background/45">
            {children.map((child) => {
              const visual = getCategoryVisual(child, group.root);
              const childStyle = visual.color ? { backgroundColor: `${visual.color}0D` } : undefined;
              const childParent = child.parentId ? childById.get(child.parentId) : undefined;
              return (
                <div className="flex items-center gap-3 px-3 py-2.5" key={child.id} style={childStyle}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-lg" style={visual.color ? { backgroundColor: `${visual.color}1A` } : undefined}>{visual.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{child.name}</p>
                    {child.description ? <p className="truncate text-xs text-muted-foreground">{child.description}</p> : null}
                  </div>
                  <Badge className="hidden sm:inline-flex">{child.isSystem ? t("systemBadge") : t("subcategoryBadge")}</Badge>
                  <CategoryRowActions
                    archived={archived}
                    category={child}
                    parentArchived={archived && childParent?.archived}
                    onArchive={!archived && !child.isSystem ? () => onArchive(child) : undefined}
                    onEdit={!archived && !child.isSystem ? () => onEdit(child) : undefined}
                    onSuccess={onRowRestore}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        {!archived && group.root.parentId === null ? (
          <Button className="w-full justify-start" onClick={() => onAddChild(group.root)} type="button" variant="ghost"><Plus />{t("createSubcategory")}</Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
