"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import type { Category } from "../../../lib/api/categories";
import { getCategoryVisual } from "../category-visual";
import { updateCategoryAction } from "../actions";
import { initialCategoryActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";
import { EmojiPicker } from "./emoji-picker";
import { ColorPicker } from "./color-picker";

export function EditCategoryDialog({ category, parent, open, onOpenChange, onSuccess }: { category: Category | null; parent?: Category; open: boolean; onOpenChange: (open: boolean) => void; onSuccess?: () => void }) {
  const t = useTranslations("categories");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateCategoryAction, initialCategoryActionState);
  const visual = category ? getCategoryVisual(category, parent) : { emoji: "🏷️", color: "#378ADD" };
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? visual.emoji);
  const [color, setColor] = useState(category?.color ?? visual.color ?? "#378ADD");
  const [inherit, setInherit] = useState(Boolean(category?.parentId && category.emoji === null && category.color === null));
  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);
  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{category.parentId && parent ? t("insideParent", { name: parent.name }) : t("createDescription")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input name="categoryId" type="hidden" value={category.id} />
          <div className="space-y-2"><Label htmlFor="edit-category-name">{t("name")}</Label><Input id="edit-category-name" maxLength={60} name="name" onChange={(event) => setName(event.target.value)} required value={name} /></div>
          <div className="space-y-2"><Label htmlFor="edit-category-description">{t("description")}</Label><Textarea id="edit-category-description" maxLength={300} name="description" onChange={(event) => setDescription(event.target.value)} value={description} /></div>
          {category.parentId && parent ? (
            <label className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm" htmlFor="edit-inherit-category-appearance">
              <input checked={inherit} className="size-4 accent-primary" id="edit-inherit-category-appearance" onChange={(event) => { const checked = event.target.checked; setInherit(checked); if (!checked) { setEmoji(visual.emoji); setColor(visual.color ?? "#378ADD"); } }} type="checkbox" />
              {t("inheritAppearance", { name: parent.name })}
            </label>
          ) : null}
          <div className={inherit ? "space-y-5 opacity-55" : "space-y-5"}>
            <div className="space-y-2"><Label>{t("emoji")}</Label><EmojiPicker disabled={inherit} onChange={setEmoji} value={emoji} /></div>
            <div className="space-y-2"><Label>{t("color")}</Label><ColorPicker disabled={inherit} onChange={setColor} value={color} /></div>
          </div>
          {state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose>
            <Button disabled={pending} type="submit">{pending ? t("saving") : commonT("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
