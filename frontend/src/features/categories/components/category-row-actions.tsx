"use client";

import { Archive, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import type { Category } from "../../../lib/api/categories";
import { initialCategoryActionState } from "../action-state";
import { restoreCategoryAction } from "../actions";
import { useActionSuccess } from "./use-action-dialog";

export function CategoryRowActions({ category, archived, parentArchived, onEdit, onArchive, onAddChild, onSuccess }: {
  category: Category;
  archived: boolean;
  parentArchived?: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onAddChild?: () => void;
  onSuccess?: () => void;
}) {
  const t = useTranslations("categories");
  const [state, formAction, pending] = useActionState(restoreCategoryAction, initialCategoryActionState);
  useActionSuccess(state.status, pending, onSuccess);

  if (archived) {
    return (
      <div className="space-y-1">
        <form action={formAction}>
          <input name="categoryId" type="hidden" value={category.id} />
          <Button aria-label={t("restore")} disabled={pending || parentArchived} size="sm" type="submit" variant="outline">
            <RotateCcw />{pending ? t("saving") : t("restore")}
          </Button>
        </form>
        {parentArchived ? <p className="max-w-40 text-right text-xs text-muted-foreground">{t("parentMustBeActive")}</p> : null}
        {state.status === "error" ? <p aria-live="polite" className="text-right text-xs text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
      </div>
    );
  }

  if (category.isSystem) {
    return onAddChild ? <Button aria-label={t("createSubcategory")} onClick={onAddChild} size="icon-sm" type="button" variant="ghost"><Plus /></Button> : null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={t("actionsFor", { name: category.name })} size="icon" type="button" variant="ghost" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit ? <DropdownMenuItem onClick={onEdit}><Pencil />{t("edit")}</DropdownMenuItem> : null}
        {onAddChild ? <DropdownMenuItem onClick={onAddChild}><Plus />{t("createSubcategory")}</DropdownMenuItem> : null}
        {onArchive ? <DropdownMenuItem onClick={onArchive} variant="destructive"><Archive />{t("archive")}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
