"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMe } from "../../lib/api/users";
import {
  archiveCategory,
  createCategory,
  restoreCategory,
  updateCategory,
} from "../../lib/api/categories";
import type { CategoryActionState } from "./action-state";
import { runCategoryMutation } from "./action-helpers";
import { categoryIdSchema, createCategoryFormSchema, updateCategoryFormSchema } from "./schemas";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function optionalText(value: string) {
  return value.trim() || null;
}

function revalidateCategories() {
  revalidatePath("/categories");
  revalidatePath("/movements");
  revalidatePath("/dashboard");
}

export async function createCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  await getMe();
  const parsed = createCategoryFormSchema.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    parentId: text(formData, "parentId") || null,
    emoji: text(formData, "emoji") || null,
    color: text(formData, "color") || null,
  });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric", fieldErrors: fieldErrors(parsed.error) };
  const mutationError = await runCategoryMutation(() => createCategory({
    name: parsed.data.name,
    parentId: parsed.data.parentId,
    description: optionalText(parsed.data.description),
    emoji: parsed.data.emoji,
    color: parsed.data.color,
  }));
  if (mutationError) return mutationError;
  revalidateCategories();
  return { status: "success" };
}

export async function updateCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  await getMe();
  const parsed = updateCategoryFormSchema.safeParse({
    categoryId: text(formData, "categoryId"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    emoji: text(formData, "emoji") || null,
    color: text(formData, "color") || null,
  });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric", fieldErrors: fieldErrors(parsed.error) };
  const mutationError = await runCategoryMutation(() => updateCategory(parsed.data.categoryId, {
    name: parsed.data.name,
    description: optionalText(parsed.data.description),
    emoji: parsed.data.emoji,
    color: parsed.data.color,
  }));
  if (mutationError) return mutationError;
  revalidateCategories();
  return { status: "success" };
}

export async function archiveCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  await getMe();
  const parsed = categoryIdSchema.safeParse({ categoryId: text(formData, "categoryId") });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric" };
  const mutationError = await runCategoryMutation(() => archiveCategory(parsed.data.categoryId));
  if (mutationError) return mutationError;
  revalidateCategories();
  return { status: "success" };
}

export async function restoreCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  await getMe();
  const parsed = categoryIdSchema.safeParse({ categoryId: text(formData, "categoryId") });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric" };
  const mutationError = await runCategoryMutation(() => restoreCategory(parsed.data.categoryId));
  if (mutationError) return mutationError;
  revalidateCategories();
  return { status: "success" };
}
