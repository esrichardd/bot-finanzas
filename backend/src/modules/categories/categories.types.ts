import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected hex color like #1D9E75");

export const createCategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().uuid().nullish(),
  description: z.string().trim().max(300).nullish(),
  color: hexColor.nullish(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;

// Update parcial: cualquier subconjunto, pero al menos un campo.
export const updateCategoryInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).nullable(),
    color: hexColor.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type UpdateCategoryInput = z.infer<typeof updateCategoryInput>;

export const categoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  isSystem: z.boolean(),
  archived: z.boolean(),
});
export const categoryListResponse = z.array(categoryResponse);
