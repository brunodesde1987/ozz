import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { api } from '../core/api';
import { loadCategories } from '../config/loader';
import type { Transaction, Account, CreditCard, Tag } from '../core/schemas';

/**
 * Format money in cents to R$ format for CSV
 */
function formatMoney(cents: number): string {
  const reais = cents / 100;
  const formatted = reais.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

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
 * Parse invoice option: cardId/invoiceId
 */
function parseInvoiceOption(invoiceStr: string): { cardId: number; invoiceId: number } {
  const parts = invoiceStr.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid --invoice format. Use: cardId/invoiceId');
  }

  const cardId = parseInt(parts[0]);
  const invoiceId = parseInt(parts[1]);

  if (isNaN(cardId) || isNaN(invoiceId)) {
    throw new Error('Card ID and Invoice ID must be numbers');
  }

  return { cardId, invoiceId };
}

/**
 * Build category map: id -> name
 */
function buildCategoryMap(): Map<number, string> {
  const categories = loadCategories();
  const map = new Map<number, string>();

  for (const [name, id] of Object.entries(categories.essencial)) {
    map.set(id, name);
  }
  for (const [name, id] of Object.entries(categories.estilo_de_vida)) {
    map.set(id, name);
  }

  return map;
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
 * Generate CSV content from transactions
 */
async function generateCSV(
  transactions: Transaction[],
  categoryMap: Map<number, string>
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
  lines.push('id,date,description,amount,category_name,account_or_card,paid,notes,tags');

  // Rows
  for (const tx of transactions) {
    const categoryName = categoryMap.get(tx.category_id) || 'uncategorized';

    // Determine account or card name
    let accountOrCard = '';
    if (tx.credit_card_id) {
      accountOrCard = cardMap.get(tx.credit_card_id) || `Card #${tx.credit_card_id}`;
    } else {
      accountOrCard = accountMap.get(tx.account_id) || `Account #${tx.account_id}`;
    }

    const row = [
      tx.id,
      tx.date,
      escapeCSV(tx.description),
      escapeCSV(formatMoney(tx.amount_cents)),
      escapeCSV(categoryName),
      escapeCSV(accountOrCard),
      tx.paid ? 'yes' : 'no',
      escapeCSV(tx.notes || ''),
      escapeCSV(formatTags(tx.tags)),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export const exportCommand = new Command('export')
  .description('Export transactions to CSV')
  .argument('<format>', 'Export format: csv')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('-o, --output <path>', 'Output directory', '.')
  .action(async (format, options) => {
    try {
      // Validate format
      if (format !== 'csv') {
        throw new Error(`Unsupported format "${format}". Only "csv" is supported.`);
      }

      // Validate options
      const hasInvoice = !!options.invoice;
      const hasDateRange = !!options.start || !!options.end;

      if (!hasInvoice && !hasDateRange) {
        throw new Error('Either --invoice or --start/--end is required');
      }

      if (hasInvoice && hasDateRange) {
        throw new Error('Cannot use both --invoice and --start/--end');
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

      if (hasInvoice) {
        // Fetch invoice
        const { cardId, invoiceId } = parseInvoiceOption(options.invoice);

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
      const csv = await generateCSV(transactions, categoryMap);

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
