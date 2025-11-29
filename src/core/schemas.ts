import { z } from 'zod';

// Tag schema
export const TagSchema = z.object({
  name: z.string(),
});

// Transaction from API
export const TransactionSchema = z.object({
  id: z.number(),
  description: z.string(),
  date: z.string(), // YYYY-MM-DD
  paid: z.boolean(),
  amount_cents: z.number(),
  total_installments: z.number(),
  installment: z.number(),
  recurring: z.boolean(),
  account_id: z.number(),
  category_id: z.number(),
  contact_id: z.number().nullable(),
  notes: z.string(),
  attachments_count: z.number(),
  credit_card_id: z.number().nullable(),
  credit_card_invoice_id: z.number().nullable(),
  paid_credit_card_id: z.number().nullable(),
  paid_credit_card_invoice_id: z.number().nullable(),
  oposite_transaction_id: z.number().nullable(),
  oposite_account_id: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tags: z.array(TagSchema),
  attachments: z.array(z.any()),
  recurrence_id: z.number().nullable(),
  account_type: z.enum(['CreditCard', 'Account']).optional(),
});

export const CategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  parent_id: z.number().nullable(),
  group_id: z.string(),
  fixed: z.boolean(),
  essential: z.boolean(),
  default: z.boolean(),
  uuid: z.string(),
  kind: z.enum(['expenses', 'revenues', 'earnings', 'none']),
  archived: z.boolean(),
});

export const AccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  archived: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  default: z.boolean(),
  type: z.enum(['checking', 'savings', 'other']),
});

export const CreditCardSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  archived: z.boolean(),
  limit_cents: z.number(),
  closing_day: z.number(),
  due_day: z.number(),
  card_network: z.string().nullable().optional(),
  kind: z.string().optional(),
  default: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const InvoiceSchema = z.object({
  id: z.number(),
  date: z.string(),
  starting_date: z.string(),
  closing_date: z.string(),
  amount_cents: z.number(),
  payment_amount_cents: z.number(),
  balance_cents: z.number(),
  previous_balance_cents: z.number(),
  credit_card_id: z.number(),
  transactions: z.array(TransactionSchema),
  payments: z.array(z.any()).optional(),
});

// Export types
export type Tag = z.infer<typeof TagSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Account = z.infer<typeof AccountSchema>;
export type CreditCard = z.infer<typeof CreditCardSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
