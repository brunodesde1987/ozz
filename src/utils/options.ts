import { z } from 'zod';

// Invoice option: "cardId/invoiceId"
export const InvoiceOptionSchema = z.string().transform((val, ctx) => {
  const parts = val.split('/');
  if (parts.length !== 2) {
    ctx.addIssue({ code: 'custom', message: 'Invoice must be in format cardId/invoiceId' });
    return z.NEVER;
  }
  const cardId = parseInt(parts[0], 10);
  const invoiceId = parseInt(parts[1], 10);
  if (isNaN(cardId) || isNaN(invoiceId)) {
    ctx.addIssue({ code: 'custom', message: 'Card ID and Invoice ID must be numbers' });
    return z.NEVER;
  }
  return { cardId, invoiceId };
});

// Month option: "YYYY-MM"
export const MonthOptionSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format');

export type InvoiceOption = z.infer<typeof InvoiceOptionSchema>;

// Schema for update command options
export const UpdateOptionsSchema = z.object({
  invoice: z.string().optional(),
  start: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  account: z.string().optional(),
  apply: z.boolean().optional(),
  force: z.boolean().optional(),
  renameOnly: z.boolean().optional(),
  tagsOnly: z.boolean().optional(),
  debug: z.boolean().optional(),
}).refine(
  data => data.invoice || (data.start && data.end),
  { message: 'Either --invoice or both --start and --end are required' }
).refine(
  data => !(data.invoice && (data.start || data.end)),
  { message: '--invoice and --start/--end are mutually exclusive' }
).refine(
  data => !data.start || data.end,
  { message: '--start requires --end' }
).refine(
  data => !data.account || (data.start && data.end),
  { message: '--account is only valid with --start/--end' }
);
