"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog";
import type { Category } from "../../../lib/api/categories";
import { archiveCategoryAction } from "../actions";
import { initialCategoryActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";

export function ArchiveCategoryDialog({ category, childCount, open, onOpenChange, onSuccess }: { category: Category | null; childCount: number; open: boolean; onOpenChange: (open: boolean) => void; onSuccess?: () => void }) {
  const t = useTranslations("categories");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(archiveCategoryAction, initialCategoryActionState);
  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);
  if (!category) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("archiveDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="font-medium">{category.name}</p>
        {category.parentId === null && childCount > 0 ? <p className="text-sm text-muted-foreground">{t("archiveWithChildren", { count: childCount })}</p> : null}
        {state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
        <form action={formAction}>
          <input name="categoryId" type="hidden" value={category.id} />
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button type="button" variant="outline" />}>{commonT("cancel")}</AlertDialogCancel>
            <Button disabled={pending} type="submit" variant="destructive">{pending ? t("saving") : t("archive")}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
