import { z } from "zod";

export const ArchiveCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export const ArchiveUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
  );

export const ArchiveItemCreateSchema = z.object({
  itemId: z.string().uuid(),
});

export type Archive = {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ArchiveWithItemCount = Archive & { itemCount: number };

export type ArchivedThread = {
  id: string;
  title: string;
  createdAt: Date;
  lastMessageAt: number | null;
};
