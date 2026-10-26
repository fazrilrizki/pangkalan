import { z } from 'zod';

export interface Project {
  id: string;
  name: string;
  path: string;
  favorite: boolean;
  createdAt: string;
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
  })
  .refine((v) => v.name !== undefined || v.favorite !== undefined, 'nothing to update');
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
