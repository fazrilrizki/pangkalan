import { z } from 'zod';

const isValidRegex = (source: string) => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};

export const cliSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  icon: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#8b93a7'),
  statusMode: z.enum(['hooks', 'heuristic']).default('heuristic'),
  waitingPatterns: z.array(z.string().refine(isValidRegex, 'invalid regex')).default([]),
  enabled: z.boolean().default(true),
});
export type CliConfig = z.infer<typeof cliSchema>;

export const shellSchema = z.object({
  file: z.string().min(1),
  args: z.array(z.string()).default([]),
});
export type ShellConfig = z.infer<typeof shellSchema>;

/** Entries are validated one by one so a broken entry does not take the others down. */
export const cliFileSchema = z.object({
  shell: shellSchema.optional(),
  clis: z.array(z.unknown()),
});

/** What the API exposes about a CLI. */
export type CliInfo = Omit<CliConfig, 'waitingPatterns'>;
