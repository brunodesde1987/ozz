import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { api } from '../core/api';
import type { Transaction, Tag } from '../core/schemas';
import { formatMoney, buildCategoryMap } from '../utils/format';
import { InvoiceOptionSchema } from '../utils/options';

/**
 * Escape CSV field value
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format tags for CSV
 */
function formatTags(tags: Tag[] | string | undefined): string {
  if (!tags) return '';
  if (typeof tags === 'string') return tags;
  return tags.map(t => t.name).join(', ');
}

/**
 * Format month for export
 */
function formatMonth(date: string, raw: boolean): string {
  // date is YYYY-MM-DD
  const [year, month] = date.split('-');
  if (raw) {
    return `${year}-${month}`;
  }
  // Format as "Oct 2024"
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNum = parseInt(month, 10) - 1;
  return `${monthNames[monthNum]} ${year}`;
}

/**
 * Generate CSV content from transactions
 */
async function generateCSV(
  transactions: Transaction[],
  categoryMap: Map<number, string>,
  invoiceMonths?: Map<number, string>,
  raw?: boolean
): Promise<string> {
  // Fetch accounts and cards for name lookup
  const spinner = ora('Fetching accounts and cards...').start();
  const [accounts, cards] = await Promise.all([
    api.getAccounts(),
    api.getCreditCards(),
  ]);
  spinner.succeed();

  // Build lookup maps
  const accountMap = new Map<number, string>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc.name);
  }

  const cardMap = new Map<number, string>();
  for (const card of cards) {
    cardMap.set(card.id, card.name);
  }

  // Build CSV
  const lines: string[] = [];

  // Header
  lines.push('date,description,amount,category_name,card,invoice,notes');

  // Rows
  for (const tx of transactions) {
    const categoryName = categoryMap.get(tx.category_id) || 'uncategorized';

    // Determine card name (for credit card transactions)
    let card = '';
    if (tx.credit_card_id) {
      card = cardMap.get(tx.credit_card_id) || `Card #${tx.credit_card_id}`;
    }

    // Format invoice column: ID with month in parens, or just ID in raw mode
    let invoice = '';
    if (tx.credit_card_invoice_id) {
      if (invoiceMonths) {
        const month = invoiceMonths.get(tx.credit_card_invoice_id);
        if (month) {
          invoice = raw ? String(tx.credit_card_invoice_id) : `${tx.credit_card_invoice_id} (${month})`;
        } else {
          invoice = String(tx.credit_card_invoice_id);
        }
      } else {
        invoice = String(tx.credit_card_invoice_id);
      }
    }

    const row = [
      tx.date,
      escapeCSV(tx.description),
      escapeCSV(formatMoney(tx.amount_cents)),
      escapeCSV(categoryName),
      escapeCSV(card),
      escapeCSV(invoice),
      escapeCSV(tx.notes || ''),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Parse invoice range/list (e.g., "306-311" or "306,307,308")
 */
function parseInvoiceList(input: string): number[] {
  const invoices: number[] = [];

  // Handle comma-separated list
  if (input.includes(',')) {
    const parts = input.split(',').map(p => p.trim());
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid invoice ID: ${part}`);
      }
      invoices.push(num);
    }
  }
  // Handle range
  else if (input.includes('-')) {
    const parts = input.split('-');
    if (parts.length !== 2) {
      throw new Error('Invoice range must be in format: start-end');
    }
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    if (isNaN(start) || isNaN(end)) {
      throw new Error('Invoice range must contain valid numbers');
    }
    if (start > end) {
      throw new Error('Invoice range start must be <= end');
    }
    for (let i = start; i <= end; i++) {
      invoices.push(i);
    }
  }
  // Single invoice
  else {
    const num = parseInt(input, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid invoice ID: ${input}`);
    }
    invoices.push(num);
  }

  return invoices;
}

export const exportCommand = new Command('export')
  .description('Export transactions to CSV')
  .argument('<format>', 'Export format: csv')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice (single, legacy format)')
  .option('--card <id>', 'Credit card ID (for use with --invoices)')
  .option('--invoices <range|list>', 'Invoice IDs or range (e.g., 306-311 or 306,307,308)')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('--raw', 'Use raw month format (YYYY-MM instead of Mon YYYY)')
  .option('-o, --output <path>', 'Output directory', '.')
  .action(async (format, options) => {
    try {
      // Validate format
      if (format !== 'csv') {
        throw new Error(`Unsupported format "${format}". Only "csv" is supported.`);
      }

      // Validate options
      const hasSingleInvoice = !!options.invoice;
      const hasMultiInvoices = !!options.invoices;
      const hasCard = !!options.card;
      const hasDateRange = !!options.start || !!options.end;

      if (hasSingleInvoice && (hasMultiInvoices || hasCard || hasDateRange)) {
        throw new Error('--invoice cannot be used with --card, --invoices, or --start/--end');
      }

      if (hasMultiInvoices && !hasCard) {
        throw new Error('--invoices requires --card');
      }

      if (hasCard && !hasMultiInvoices) {
        throw new Error('--card requires --invoices');
      }

      if (hasDateRange && (hasSingleInvoice || hasMultiInvoices)) {
        throw new Error('Cannot use invoice options with --start/--end');
      }

      if (!hasSingleInvoice && !hasMultiInvoices && !hasDateRange) {
        throw new Error('Either --invoice, (--card --invoices), or --start/--end is required');
      }

      if (options.start && !options.end) {
        throw new Error('--start requires --end');
      }

      if (options.end && !options.start) {
        throw new Error('--end requires --start');
      }

      // Load category map
      const categoryMap = buildCategoryMap();

      let transactions: Transaction[];
      let filename: string;

      if (hasSingleInvoice) {
        // Legacy: Fetch single invoice
        const result = InvoiceOptionSchema.safeParse(options.invoice);
        if (!result.success) {
          throw new Error('Invalid --invoice format. Use: cardId/invoiceId');
        }
        const { cardId, invoiceId } = result.data;

        const spinner = ora(`Fetching invoice ${cardId}/${invoiceId}...`).start();
        const invoice = await api.getInvoice(cardId, invoiceId);
        spinner.succeed(`Fetched ${invoice.transactions?.length || 0} transactions`);

        transactions = invoice.transactions || [];
        filename = `ozz_export_invoice_${invoiceId}.csv`;

        // Summary
        console.log();
        console.log(chalk.bold('Export summary:'));
        console.log(`  Source: Invoice ${cardId}/${invoiceId}`);
        console.log(`  Transactions: ${transactions.length}`);
        console.log(`  Format: CSV`);
        console.log();

      } else if (hasMultiInvoices) {
        // Multi-invoice export
        const cardId = parseInt(options.card, 10);
        if (isNaN(cardId)) {
          throw new Error('Invalid card ID');
        }

        const invoiceIds = parseInvoiceList(options.invoices);
        if (invoiceIds.length === 0) {
          throw new Error('No valid invoice IDs provided');
        }

        const spinner = ora(`Fetching ${invoiceIds.length} invoice(s)...`).start();
        const allTransactions: Transaction[] = [];
        const invoiceMonths = new Map<number, string>();

        for (const invoiceId of invoiceIds) {
          const invoice = await api.getInvoice(cardId, invoiceId);
          allTransactions.push(...(invoice.transactions || []));
          // Map invoice ID to formatted month
          const monthStr = formatMonth(invoice.date, options.raw);
          invoiceMonths.set(invoiceId, monthStr);
        }

        spinner.succeed(`Fetched ${allTransactions.length} transactions from ${invoiceIds.length} invoice(s)`);

        transactions = allTransactions;
        const rangeStr = invoiceIds.length > 3
          ? `${invoiceIds[0]}-${invoiceIds[invoiceIds.length - 1]}`
          : invoiceIds.join(',');
        filename = `ozz_export_invoices_${rangeStr}.csv`;

        // Summary
        console.log();
        console.log(chalk.bold('Export summary:'));
        console.log(`  Source: Card ${cardId}, Invoices ${rangeStr}`);
        console.log(`  Transactions: ${transactions.length}`);
        console.log(`  Format: CSV`);
        console.log();

        // Store for later use
        (options as any).invoiceMonths = invoiceMonths;

      } else {
        // Fetch by date range
        const startMonth = options.start;
        const endMonth = options.end;

        const spinner = ora(`Fetching transactions ${startMonth} to ${endMonth}...`).start();
        transactions = await api.getTransactionsBatched(startMonth, endMonth);
        spinner.succeed(`Fetched ${transactions.length} transactions`);

        filename = `ozz_export_${startMonth}_${endMonth}.csv`;

        // Summary
        console.log();
        console.log(chalk.bold('Export summary:'));
        console.log(`  Period: ${startMonth} to ${endMonth}`);
        console.log(`  Transactions: ${transactions.length}`);
        console.log(`  Format: CSV`);
        console.log();
      }

      // Check if no transactions
      if (transactions.length === 0) {
        console.log(chalk.yellow('No transactions to export'));
        return;
      }

      // Generate CSV
      const invoiceMonths = (options as any).invoiceMonths;
      const csv = await generateCSV(transactions, categoryMap, invoiceMonths, options.raw);

      // Write file
      const outputPath = `${options.output}/${filename}`;
      await Bun.write(outputPath, csv);

      console.log(chalk.green(`✓ Exported to: ${outputPath}`));
      console.log();

    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red(`\n❌ Unknown error occurred\n`));
      }
      process.exit(1);
    }
  });
