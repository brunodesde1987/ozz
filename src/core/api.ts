import { z } from 'zod';
import {
  TransactionSchema,
  CategorySchema,
  AccountSchema,
  CreditCardSchema,
  InvoiceSchema,
} from './schemas';
import type { Transaction, Category, Account, CreditCard, Invoice, Tag } from './schemas';
import { getMonthRanges } from '../utils/date';

const BASE_URL = 'https://api.organizze.com.br/rest/v2';

class OrganizzeAPI {
  private auth: string;
  private email: string;
  private lastRequest = 0;
  private minDelay = 200; // ms between requests

  constructor() {
    const email = process.env.ORGANIZZE_EMAIL;
    const token = process.env.ORGANIZZE_TOKEN;
    if (!email || !token) {
      throw new Error('Missing ORGANIZZE_EMAIL or ORGANIZZE_TOKEN environment variables');
    }
    this.email = email;
    this.auth = Buffer.from(`${email}:${token}`).toString('base64');
  }

  private async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await Bun.sleep(this.minDelay - elapsed);
    }
    this.lastRequest = Date.now();
  }

  private async fetch<T>(path: string, schema: z.ZodSchema<T>, options?: RequestInit): Promise<T> {
    await this.rateLimit();

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': `ozz-cli/0.1.0 (${this.email})`,
        ...options?.headers,
      },
    });

    if (res.status === 429) {
      // Rate limited - exponential backoff
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
      await Bun.sleep(retryAfter * 1000);
      return this.fetch(path, schema, options);
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    return schema.parse(data);
  }

  /**
   * GET transactions by date range
   * Note: API returns max 500 transactions per request
   * For large ranges, results may be truncated
   */
  async getTransactions(startDate: string, endDate: string, accountId?: number): Promise<Transaction[]> {
    let path = `/transactions?start_date=${startDate}&end_date=${endDate}`;
    if (accountId) {
      path += `&account_id=${accountId}`;
    }

    const transactions = await this.fetch(path, z.array(TransactionSchema));

    // Warn if we hit the 500 limit
    if (transactions.length === 500) {
      console.warn(`⚠️  Query returned 500 transactions - may be truncated. Consider narrowing date range.`);
    }

    return transactions;
  }

  /**
   * GET transactions by date range with auto-batching by month
   * Use this to avoid 500-transaction limit for large date ranges
   */
  async getTransactionsBatched(start: string, end: string, accountId?: number): Promise<Transaction[]> {
    // Convert YYYY-MM to YYYY-MM-DD if needed
    const startDate = start.length === 7 ? `${start}-01` : start;
    const endDate = end.length === 7 ? `${end}-01` : end;

    const months = getMonthRanges(startDate, endDate);
    const results: Transaction[] = [];

    for (const { start: s, end: e } of months) {
      let path = `/transactions?start_date=${s}&end_date=${e}`;
      if (accountId) {
        path += `&account_id=${accountId}`;
      }

      const batch = await this.fetch(path, z.array(TransactionSchema));
      if (batch.length === 500) {
        console.warn(`⚠️  Month ${s.slice(0, 7)} returned 500 results - may be truncated`);
      }
      results.push(...batch);
    }

    return results;
  }

  /**
   * GET single transaction by ID
   */
  async getTransaction(id: number): Promise<Transaction> {
    return this.fetch(`/transactions/${id}`, TransactionSchema);
  }

  /**
   * GET invoice with all transactions
   */
  async getInvoice(creditCardId: number, invoiceId: number): Promise<Invoice> {
    return this.fetch(
      `/credit_cards/${creditCardId}/invoices/${invoiceId}`,
      InvoiceSchema
    );
  }

  /**
   * UPDATE transaction
   */
  async updateTransaction(
    id: number,
    updates: {
      description?: string;
      category_id?: number;
      tags?: Tag[];
      notes?: string;
      amount_cents?: number;
      date?: string;
      paid?: boolean;
    }
  ): Promise<Transaction> {
    return this.fetch(`/transactions/${id}`, TransactionSchema, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * GET all categories
   */
  async getCategories(): Promise<Category[]> {
    return this.fetch('/categories', z.array(CategorySchema));
  }

  /**
   * GET single category by ID
   */
  async getCategory(id: number): Promise<Category> {
    return this.fetch(`/categories/${id}`, CategorySchema);
  }

  /**
   * GET all accounts
   */
  async getAccounts(): Promise<Account[]> {
    return this.fetch('/accounts', z.array(AccountSchema));
  }

  /**
   * GET all credit cards
   */
  async getCreditCards(): Promise<CreditCard[]> {
    return this.fetch('/credit_cards', z.array(CreditCardSchema));
  }

  /**
   * GET all invoices for a credit card
   */
  async getInvoices(cardId: number): Promise<Invoice[]> {
    return this.fetch(`/credit_cards/${cardId}/invoices`, z.array(InvoiceSchema));
  }

  /**
   * Helper: Add delay between operations
   */
  async delay(ms: number): Promise<void> {
    await Bun.sleep(ms);
  }
}

// Singleton export
export const api = new OrganizzeAPI();
