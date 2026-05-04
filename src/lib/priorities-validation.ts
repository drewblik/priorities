import { z } from 'zod';

export const ICON_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#64748b', // slate
] as const;

export const ICON_STYLES = ['classic', 'rounded', 'serif', 'script'] as const;
export const PRIORITY_STATUSES = ['active', 'paused', 'archived'] as const;
export const CADENCE_VALUES = ['quarterly', 'weekly', 'daily'] as const;

export const IconSchema = z.object({
  color: z.enum(ICON_COLORS),
  style: z.enum(ICON_STYLES),
});

const baseFields = {
  name: z.string().trim().min(1, 'name required').max(120),
  icon: IconSchema,
  smartGoal: z.union([z.string().trim().max(2000), z.null()]).optional(),
  quarterlyStrategy: z.union([z.string().trim().max(2000), z.null()]).optional(),
  weeklyStrategy: z.union([z.string().trim().max(2000), z.null()]).optional(),
  dailyStrategy: z.union([z.string().trim().max(2000), z.null()]).optional(),
  minMinutesPerWeek: z.number().int().min(0).max(10_000),
  maxMinutesPerWeek: z.number().int().min(0).max(10_000),
  checkInCadence: z.array(z.enum(CADENCE_VALUES)).min(1).max(3),
};

export const CreatePrioritySchema = z
  .object(baseFields)
  .refine((v) => v.minMinutesPerWeek <= v.maxMinutesPerWeek, {
    message: 'minMinutesPerWeek must be ≤ maxMinutesPerWeek',
    path: ['maxMinutesPerWeek'],
  });

export const UpdatePrioritySchema = z
  .object({
    name: baseFields.name.optional(),
    icon: baseFields.icon.optional(),
    smartGoal: baseFields.smartGoal,
    quarterlyStrategy: baseFields.quarterlyStrategy,
    weeklyStrategy: baseFields.weeklyStrategy,
    dailyStrategy: baseFields.dailyStrategy,
    minMinutesPerWeek: baseFields.minMinutesPerWeek.optional(),
    maxMinutesPerWeek: baseFields.maxMinutesPerWeek.optional(),
    checkInCadence: baseFields.checkInCadence.optional(),
    status: z.enum(PRIORITY_STATUSES).optional(),
  })
  .refine(
    (v) => {
      const min = v.minMinutesPerWeek;
      const max = v.maxMinutesPerWeek;
      return min === undefined || max === undefined || min <= max;
    },
    {
      message: 'minMinutesPerWeek must be ≤ maxMinutesPerWeek',
      path: ['maxMinutesPerWeek'],
    },
  );

export const ReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export type CreatePriorityBody = z.infer<typeof CreatePrioritySchema>;
export type UpdatePriorityBody = z.infer<typeof UpdatePrioritySchema>;

/**
 * Parse a form-encoded request body into the shape the priority schemas accept.
 * The form sends `iconColor` + `iconStyle` flat (no nesting), and `checkInCadence`
 * as repeated fields. Numbers come in as strings.
 */
export function formDataToPriorityPayload(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const setStr = (k: string, transform: (v: string) => unknown = (v) => v) => {
    const v = form.get(k);
    if (typeof v === 'string' && v !== '') out[k] = transform(v);
  };
  const setNullableStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string') out[k] = v === '' ? null : v;
  };

  setStr('name');
  setNullableStr('smartGoal');
  setNullableStr('quarterlyStrategy');
  setNullableStr('weeklyStrategy');
  setNullableStr('dailyStrategy');
  setStr('minMinutesPerWeek', (v) => Number.parseInt(v, 10));
  setStr('maxMinutesPerWeek', (v) => Number.parseInt(v, 10));
  setStr('status');

  const iconColor = form.get('iconColor');
  const iconStyle = form.get('iconStyle');
  if (typeof iconColor === 'string' && typeof iconStyle === 'string' && iconColor && iconStyle) {
    out.icon = { color: iconColor, style: iconStyle };
  }

  const cadence = form.getAll('checkInCadence').filter((v): v is string => typeof v === 'string' && v !== '');
  if (cadence.length > 0) out.checkInCadence = cadence;

  return out;
}

export function isFormPost(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}
