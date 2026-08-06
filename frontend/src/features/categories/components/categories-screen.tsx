"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import type { Category } from "../../../lib/api/categories";
import type { CategoryGroup } from "../category-groups";
import { groupCategories } from "../category-groups";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import { CategoriesGrid } from "./categories-grid";
import { CategoriesToolbar, type CategoryTab, type OwnershipFilter } from "./categories-toolbar";
import { CreateCategoryDialog } from "./create-category-dialog";
import { EditCategoryDialog } from "./edit-category-dialog";

function normalize(value: string, locale: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale).trim();
}

function matches(category: Category, query: string, locale: string) {
  return !query || normalize(`${category.name} ${category.description ?? ""}`, locale).includes(query);
}

function filterGroups(groups: CategoryGroup[], search: string, ownership: OwnershipFilter, locale: string, allCategories: Category[]) {
  const query = normalize(search, locale);
  return groups.flatMap((group) => {
    const rootAllowed = ownership === "all" || (ownership === "system" ? group.root.isSystem : !group.root.isSystem);
    const childCandidates = group.children.filter((child) => ownership === "all" || (ownership === "system" ? child.isSystem : !child.isSystem));
    const rootMatches = matches(group.root, query, locale);
    const matchingChildren = childCandidates.filter((child) => matches(child, query, locale));
    if (!query && rootAllowed) return [{ ...group, children: childCandidates }];
    if (rootMatches && rootAllowed) return [{ ...group, children: childCandidates }];
    if (matchingChildren.length > 0) {
      const contextualRoot = rootAllowed ? group.root : allCategories.find((category) => category.id === group.root.id) ?? group.root;
      return [{ root: contextualRoot, children: matchingChildren }];
    }
    return [];
  });
}

export function CategoriesScreen({ data, title, subtitle }: { data: { active: Category[]; archived: Category[] }; title: string; subtitle: string }) {
  const t = useTranslations("categories");
  const locale = useLocale();
  const [tab, setTab] = useState<CategoryTab>("active");
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<OwnershipFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<Category | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const [dialog, setDialog] = useState<"edit" | "archive" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const source = tab === "active" ? data.active : data.archived;
  const allCategories = useMemo(() => [...data.active, ...data.archived], [data.active, data.archived]);
  const groups = useMemo(() => filterGroups(groupCategories(source), search, tab === "archived" ? "all" : ownership, locale, allCategories), [allCategories, locale, ownership, search, source, tab]);
  const hasNoCategories = source.length === 0;

  function clearFilters() {
    setSearch("");
    setOwnership("all");
  }
  function openCreate(parent: Category | null = null) {
    setFeedback(null);
    setCreateParent(parent);
    setCreateOpen(true);
  }
  function openDialog(kind: "edit" | "archive", category: Category) {
    setFeedback(null);
    setSelected(category);
    setDialog(kind);
  }
  function parentFor(category: Category | null) {
    return category?.parentId ? allCategories.find((item) => item.id === category.parentId) : undefined;
  }
  const selectedGroup = selected?.parentId ? undefined : selected ? groupCategories(allCategories).find((group) => group.root.id === selected.id) : undefined;

  return (
    <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2"><p className="text-sm text-muted-foreground">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">{title}</h1><p className="max-w-xl text-muted-foreground">{subtitle}</p></div>
        <Button className="w-full sm:w-auto" onClick={() => openCreate()} size="lg"><span aria-hidden>＋</span>{t("create")}</Button>
      </div>
      {feedback ? <p aria-live="polite" className="text-sm text-primary" role="status">{t(feedback as never)}</p> : null}
      <CategoriesToolbar onClear={clearFilters} onOwnershipChange={setOwnership} onSearchChange={setSearch} onTabChange={(nextTab) => { setTab(nextTab); setFeedback(null); }} ownership={ownership} search={search} tab={tab} />
      {hasNoCategories ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <h2 className="font-serif text-2xl">{tab === "active" ? t("emptyActiveTitle") : t("emptyArchivedTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">{tab === "active" ? t("emptyActiveDescription") : t("emptyArchivedDescription")}</p>
          {tab === "active" ? <Button className="mt-6" onClick={() => openCreate()}><span aria-hidden>＋</span>{t("create")}</Button> : null}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center"><h2 className="font-serif text-2xl">{t("noResultsTitle")}</h2><p className="mt-2 text-muted-foreground">{t("noResultsDescription")}</p><Button className="mt-5" onClick={clearFilters} type="button" variant="outline">{t("clearFilters")}</Button></div>
      ) : (
        <CategoriesGrid
          archived={tab === "archived"}
          categories={allCategories}
          groups={groups}
          onAddChild={openCreate}
          onArchive={(category) => openDialog("archive", category)}
          onEdit={(category) => openDialog("edit", category)}
          onRowRestore={() => setFeedback("restoreSuccess")}
        />
      )}
      <CreateCategoryDialog key={`${createParent?.id ?? "root"}-${createOpen ? "open" : "closed"}`} onOpenChange={setCreateOpen} onSuccess={() => { setFeedback("createSuccess"); setCreateParent(null); }} open={createOpen} parent={createParent} />
      <EditCategoryDialog category={selected} key={selected?.id ?? "none"} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => setFeedback("updateSuccess")} open={dialog === "edit"} parent={parentFor(selected)} />
      <ArchiveCategoryDialog category={selected} childCount={selectedGroup?.children.length ?? 0} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => setFeedback("archiveSuccess")} open={dialog === "archive"} />
    </section>
  );
}
