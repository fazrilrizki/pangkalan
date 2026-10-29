import { z } from 'zod';

export interface Project {
  id: string;
  name: string;
  path: string;
  favorite: boolean;
  createdAt: string;
  /** URL the preview pane opens, set by hand; null means use the detected dev server. */
  previewUrl: string | null;
}

export const createProjectSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    favorite: z.boolean().optional(),
    previewUrl: z
      .url({ protocol: /^https?$/ })
      .max(2048)
      .nullable()
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
