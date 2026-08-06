import { apiFetch } from "./client";

export type CategoryStatus = "active" | "archived";

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  color: string | null;
  emoji: string | null;
  isSystem: boolean;
  archived: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  parentId?: string | null;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
}

export function listCategories(status: CategoryStatus): Promise<Category[]> {
  return apiFetch<Category[]>(`/api/categories?status=${status}`);
}

export function createCategory(input: CreateCategoryPayload): Promise<Category> {
  return apiFetch<Category>("/api/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(categoryId: string, input: UpdateCategoryPayload): Promise<Category> {
  return apiFetch<Category>(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveCategory(categoryId: string): Promise<void> {
  return apiFetch<void>(`/api/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
}

export function restoreCategory(categoryId: string): Promise<Category> {
  return apiFetch<Category>(`/api/categories/${encodeURIComponent(categoryId)}/restore`, { method: "POST" });
}
