"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import type { Category } from "../../../lib/api/categories";
import { createCategoryAction } from "../actions";
import { initialCategoryActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";
import { EmojiPicker } from "./emoji-picker";
import { ColorPicker } from "./color-picker";

export function CreateCategoryDialog({ open, onOpenChange, parent, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; parent: Category | null; onSuccess?: () => void }) {
  const t = useTranslations("categories");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(createCategoryAction, initialCategoryActionState);
  const [emoji, setEmoji] = useState("🏷️");
  const [color, setColor] = useState("#378ADD");
  const [inherit, setInherit] = useState(Boolean(parent));
  const effectiveEmoji = parent?.emoji ?? "🏷️";
  const effectiveColor = parent?.color ?? "#378ADD";
  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parent ? t("createSubcategoryTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{parent ? t("insideParent", { name: parent.name }) : t("createDescription")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input name="parentId" type="hidden" value={parent?.id ?? ""} />
          <div className="space-y-2"><Label htmlFor="category-name">{t("name")}</Label><Input id="category-name" maxLength={60} name="name" required /></div>
          <div className="space-y-2"><Label htmlFor="category-description">{t("description")}</Label><Textarea id="category-description" maxLength={300} name="description" /></div>
          {parent ? (
            <label className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm" htmlFor="inherit-category-appearance">
              <input checked={inherit} className="size-4 accent-primary" id="inherit-category-appearance" onChange={(event) => { const checked = event.target.checked; setInherit(checked); if (!checked) { setEmoji(effectiveEmoji); setColor(effectiveColor); } }} type="checkbox" />
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
            <Button disabled={pending} type="submit"><Plus />{pending ? t("saving") : t("create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
