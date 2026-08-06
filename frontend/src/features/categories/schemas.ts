import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const emojiSchema = z.string().trim().min(1).max(32);
const optionalText = z.string().trim().max(300);

export const createCategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: optionalText,
  parentId: z.string().uuid().nullable(),
  emoji: emojiSchema.nullable(),
  color: colorSchema.nullable(),
});

export const updateCategoryFormSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  description: optionalText,
  emoji: emojiSchema.nullable(),
  color: colorSchema.nullable(),
});

export const categoryIdSchema = z.object({ categoryId: z.string().uuid() });
