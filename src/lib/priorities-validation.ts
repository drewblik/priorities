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
  pinnedSummary: z.union([z.string().trim().max(5000), z.null()]).optional(),
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
    pinnedSummary: baseFields.pinnedSummary,
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

// =============================================================================
// M6: priority_memory + priority_files validation
// =============================================================================

export const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((s) => s.toLowerCase());

const TagsField = z.array(TagSchema).max(10).default([]);
const BodyField = z.string().trim().min(1).max(10_000);

export const CreateMemorySchema = z.object({
  body: BodyField,
  tags: TagsField,
});

export const UpdateMemorySchema = z
  .object({
    body: BodyField.optional(),
    tags: TagsField.optional(),
  })
  .refine((v) => v.body !== undefined || v.tags !== undefined, {
    message: 'at least one field required',
  });

/**
 * Parse a form-encoded request body for memory create/update.
 * Tags come in as a comma-separated string in the form field `tags`.
 */
export function formDataToMemoryPayload(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const body = form.get('body');
  if (typeof body === 'string') out.body = body;
  const tags = form.get('tags');
  if (typeof tags === 'string') {
    out.tags = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  return out;
}

// =============================================================================
// M6: file upload constraints
// =============================================================================

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
] as const;

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export type CreatePriorityBody = z.infer<typeof CreatePrioritySchema>;
export type UpdatePriorityBody = z.infer<typeof UpdatePrioritySchema>;
export type CreateMemoryBody = z.infer<typeof CreateMemorySchema>;
export type UpdateMemoryBody = z.infer<typeof UpdateMemorySchema>;

// =============================================================================
// M8: tasks + events + recurrence validation
// =============================================================================

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export const TASK_STATUSES = ['open', 'done', 'skipped'] as const;
export const EVENT_COMPLETION_STATUSES = ['attended', 'missed'] as const;
export const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly'] as const;

const ISO_DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// HTML datetime-local: "YYYY-MM-DDTHH:mm" (no seconds, no TZ).
// We accept either that or full ISO datetime; routes convert to UTC Date.
const DATETIME_LOCAL = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
    'expected YYYY-MM-DDTHH:mm',
  );

const RecurrenceDaily = z.object({
  type: z.literal('daily'),
  interval: z.number().int().min(1).max(365),
  until: ISO_DATE.optional(),
});

const RecurrenceWeekly = z.object({
  type: z.literal('weekly'),
  interval: z.number().int().min(1).max(52),
  byday: z.array(z.enum(WEEKDAYS)).min(1).max(7),
  until: ISO_DATE.optional(),
});

const RecurrenceMonthly = z.object({
  type: z.literal('monthly'),
  interval: z.number().int().min(1).max(12),
  bymonthday: z.number().int().min(1).max(31),
  until: ISO_DATE.optional(),
});

export const RecurrenceSchema = z.discriminatedUnion('type', [
  RecurrenceDaily,
  RecurrenceWeekly,
  RecurrenceMonthly,
]);

const TitleField = z.string().trim().min(1).max(200);
const DescField = z.union([z.string().trim().max(2000), z.null()]).optional();

export const CreateTaskSchema = z
  .object({
    ownerPriorityId: z.string().min(1),
    title: TitleField,
    description: DescField,
    targetDate: z.union([ISO_DATE, z.null()]).optional(),
    timeBlockStart: z.union([DATETIME_LOCAL, z.null()]).optional(),
    timeBlockEnd: z.union([DATETIME_LOCAL, z.null()]).optional(),
    recurrence: z.union([RecurrenceSchema, z.null()]).optional(),
  })
  .refine(
    (v) => {
      const startSet = !!v.timeBlockStart;
      const endSet = !!v.timeBlockEnd;
      return startSet === endSet;
    },
    { message: 'time_block_start and time_block_end must both be set or both null' },
  )
  .refine((v) => !v.recurrence || !!v.targetDate, {
    message: 'recurring tasks require a target_date (start of pattern)',
    path: ['targetDate'],
  });

export const UpdateTaskSchema = z
  .object({
    title: TitleField.optional(),
    description: DescField,
    targetDate: z.union([ISO_DATE, z.null()]).optional(),
    timeBlockStart: z.union([DATETIME_LOCAL, z.null()]).optional(),
    timeBlockEnd: z.union([DATETIME_LOCAL, z.null()]).optional(),
    recurrence: z.union([RecurrenceSchema, z.null()]).optional(),
    status: z.enum(TASK_STATUSES).optional(),
  })
  .refine(
    (v) => {
      // Allow patch where only one of start/end is included by leaving the other untouched.
      // Only enforce paired-ness when both keys are explicitly present.
      if (!('timeBlockStart' in v) && !('timeBlockEnd' in v)) return true;
      if ('timeBlockStart' in v && 'timeBlockEnd' in v) {
        return !!v.timeBlockStart === !!v.timeBlockEnd;
      }
      return true;
    },
    { message: 'time_block_start and time_block_end must both be patched together' },
  );

export const CompleteTaskSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
});

export const CreateEventSchema = z.object({
  ownerPriorityId: z.string().min(1),
  title: TitleField,
  description: DescField,
  startTime: DATETIME_LOCAL,
  endTime: DATETIME_LOCAL,
  recurrence: z.union([RecurrenceSchema, z.null()]).optional(),
});

export const UpdateEventSchema = z.object({
  title: TitleField.optional(),
  description: DescField,
  startTime: DATETIME_LOCAL.optional(),
  endTime: DATETIME_LOCAL.optional(),
  recurrence: z.union([RecurrenceSchema, z.null()]).optional(),
  completionStatus: z.union([z.enum(EVENT_COMPLETION_STATUSES), z.null()]).optional(),
});

export type Recurrence = z.infer<typeof RecurrenceSchema>;
export type CreateTaskBody = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskBody = z.infer<typeof UpdateTaskSchema>;
export type CreateEventBody = z.infer<typeof CreateEventSchema>;
export type UpdateEventBody = z.infer<typeof UpdateEventSchema>;

/**
 * Pull recurrence_* fields out of a form payload and assemble the
 * Recurrence jsonb shape. Returns null if recurrence_type is empty/none.
 */
export function formDataToRecurrence(form: FormData): Recurrence | null {
  const type = form.get('recurrence_type');
  if (typeof type !== 'string' || type === '' || type === 'none') return null;
  const interval = Number.parseInt((form.get('recurrence_interval') as string) ?? '1', 10);
  const untilRaw = form.get('recurrence_until');
  const until =
    typeof untilRaw === 'string' && untilRaw.length > 0 ? untilRaw : undefined;

  if (type === 'daily') {
    return { type: 'daily', interval, ...(until ? { until } : {}) };
  }
  if (type === 'weekly') {
    const byday = form
      .getAll('recurrence_byday')
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .filter((v): v is (typeof WEEKDAYS)[number] =>
        (WEEKDAYS as readonly string[]).includes(v),
      );
    return { type: 'weekly', interval, byday, ...(until ? { until } : {}) };
  }
  if (type === 'monthly') {
    const bymonthday = Number.parseInt((form.get('recurrence_bymonthday') as string) ?? '1', 10);
    return { type: 'monthly', interval, bymonthday, ...(until ? { until } : {}) };
  }
  return null;
}

export function formDataToTaskPayload(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const setStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string' && v !== '') out[k] = v;
  };
  const setNullableStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string') out[k] = v === '' ? null : v;
  };

  setStr('ownerPriorityId');
  setStr('title');
  setNullableStr('description');
  setNullableStr('targetDate');
  setNullableStr('timeBlockStart');
  setNullableStr('timeBlockEnd');
  setStr('status');

  const recurrence = formDataToRecurrence(form);
  // Distinguish "not in form" from "explicitly cleared" — recurrence_present hidden field.
  if (form.has('recurrence_present')) {
    out.recurrence = recurrence;
  }

  return out;
}

export function formDataToEventPayload(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const setStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string' && v !== '') out[k] = v;
  };
  const setNullableStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string') out[k] = v === '' ? null : v;
  };

  setStr('ownerPriorityId');
  setStr('title');
  setNullableStr('description');
  setStr('startTime');
  setStr('endTime');

  const cs = form.get('completionStatus');
  if (typeof cs === 'string') {
    out.completionStatus = cs === '' || cs === 'none' ? null : cs;
  }

  const recurrence = formDataToRecurrence(form);
  if (form.has('recurrence_present')) {
    out.recurrence = recurrence;
  }

  return out;
}

// =============================================================================
// M10: calendar feed validation
// =============================================================================

export const FEED_SOURCES = ['google', 'outlook', 'other'] as const;

const FeedNameField = z.string().trim().min(1).max(120);
const FeedUrlField = z.string().trim().url().max(2000);
const FeedCadenceField = z.number().int().min(5).max(1440);
// Per-feed "your address on this calendar" (M21 P1). Nullable so the edit
// form can clear it (blank field → null → filter off). The form-data
// builder maps '' → null; a non-null value must be a valid email.
const FeedCalendarEmailField = z.string().trim().email().max(254).nullable();

export const CreateCalendarFeedSchema = z.object({
  name: FeedNameField,
  source: z.enum(FEED_SOURCES),
  feedUrl: FeedUrlField,
  calendarEmail: FeedCalendarEmailField.optional(),
  syncCadenceMin: FeedCadenceField.optional(),
});

export const UpdateCalendarFeedSchema = z
  .object({
    name: FeedNameField.optional(),
    source: z.enum(FEED_SOURCES).optional(),
    feedUrl: FeedUrlField.optional(),
    calendarEmail: FeedCalendarEmailField.optional(),
    syncCadenceMin: FeedCadenceField.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.source !== undefined ||
      v.feedUrl !== undefined ||
      v.calendarEmail !== undefined ||
      v.syncCadenceMin !== undefined,
    { message: 'at least one field required' },
  );

export type CreateCalendarFeedBody = z.infer<typeof CreateCalendarFeedSchema>;
export type UpdateCalendarFeedBody = z.infer<typeof UpdateCalendarFeedSchema>;

export function formDataToCalendarFeedPayload(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const setStr = (k: string) => {
    const v = form.get(k);
    if (typeof v === 'string' && v !== '') out[k] = v;
  };
  setStr('name');
  setStr('source');
  setStr('feedUrl');
  // calendarEmail is present-but-clearable: when the field is rendered (it
  // always is on add/edit), an empty value means "no filter / clear it"
  // (null), distinct from feedUrl where blank means "keep current".
  if (form.has('calendarEmail')) {
    const raw = form.get('calendarEmail');
    out.calendarEmail =
      typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
  }
  const cadence = form.get('syncCadenceMin');
  if (typeof cadence === 'string' && cadence !== '') {
    out.syncCadenceMin = Number.parseInt(cadence, 10);
  }
  return out;
}

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
  setNullableStr('pinnedSummary');
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
