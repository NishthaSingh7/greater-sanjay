import { z } from 'zod';

export const clickActionSchema = z.object({
  type: z.literal('click'),
  x: z.number(),
  y: z.number(),
  button: z.enum(['left', 'right']).optional(),
  /** 2 = double-click (use for opening/playing items in apps like Spotify) */
  clicks: z.number().int().min(1).max(3).optional(),
});

export const moveActionSchema = z.object({
  type: z.literal('move'),
  x: z.number(),
  y: z.number(),
});

export const typeActionSchema = z.object({
  type: z.literal('type'),
  text: z.string(),
});

export const keyActionSchema = z.object({
  type: z.literal('key'),
  keys: z.array(z.string()).min(1),
});

export const waitActionSchema = z.object({
  type: z.literal('wait'),
  ms: z.number().min(0).max(10000),
});

export const doneActionSchema = z.object({
  type: z.literal('done'),
  reason: z.string(),
});

export const actionSchema = z.discriminatedUnion('type', [
  clickActionSchema,
  moveActionSchema,
  typeActionSchema,
  keyActionSchema,
  waitActionSchema,
  doneActionSchema,
]);

export type AgentAction = z.infer<typeof actionSchema>;
export type ClickAction = z.infer<typeof clickActionSchema>;
export type MoveAction = z.infer<typeof moveActionSchema>;
export type TypeAction = z.infer<typeof typeActionSchema>;
export type KeyAction = z.infer<typeof keyActionSchema>;
export type WaitAction = z.infer<typeof waitActionSchema>;
export type DoneAction = z.infer<typeof doneActionSchema>;

export function parseAction(raw: unknown): AgentAction {
  return actionSchema.parse(raw);
}

export function tryParseAction(raw: unknown): AgentAction | null {
  const result = actionSchema.safeParse(raw);
  return result.success ? result.data : null;
}
