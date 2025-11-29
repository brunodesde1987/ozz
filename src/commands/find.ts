import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { api } from '../core/api';
import { loadCategories } from '../config/loader';
import type { Transaction, Category } from '../core/schemas';

/**
 * Format money in cents to R$ format with color
 */
function formatMoney(cents: number, withColor = true): string {
  const reais = Math.abs(cents / 100);
  const formatted = reais.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = cents < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;

  if (!withColor) return money;
  return cents < 0 ? chalk.red(money) : chalk.green(money);
}

/**
 * Truncate long strings
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

/**
 * Get category name by ID
 */
function getCategoryName(categoryId: number, categoriesMap: Map<number, string>): string {
  const name = categoriesMap.get(categoryId);
  return name || `Unknown (${categoryId})`;
}

/**
 * Build category map from config
 */
function buildCategoryMap(): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const categories = loadCategories();
    for (const [name, id] of Object.entries(categories.essencial)) {
      map.set(id as number, name);
    }
    for (const [name, id] of Object.entries(categories.estilo_de_vida)) {
      map.set(id as number, name);
    }
  } catch {
    // Ignore if categories not available
  }
  return map;
}

/**
 * Find by ID - show single transaction details
 */
async function findById(id: number): Promise<void> {
  const spinner = ora(`Fetching transaction #${id}...`).start();

  try {
    const tx = await api.getTransaction(id);
    spinner.stop();

    const categoryMap = buildCategoryMap();
    const categoryName = getCategoryName(tx.category_id, categoryMap);

    console.log();
    console.log(chalk.bold(`Transaction #${tx.id}`));
    console.log(`├── Description: ${chalk.cyan(tx.description)}`);
    console.log(`├── Date: ${tx.date}`);
    console.log(`├── Amount: ${formatMoney(tx.amount_cents)}`);
    console.log(`├── Category: ${categoryName} ${chalk.gray(`(${tx.category_id})`)}`);
    console.log(`├── Account: ${chalk.gray(`(${tx.account_id})`)}`);
    console.log(`├── Created: ${tx.created_at}`);
    console.log(`└── Updated: ${tx.updated_at}`);
    console.log();

  } catch (error) {
    spinner.fail(`Failed to fetch transaction #${id}`);
    throw error;
  }
}

/**
 * Search by description pattern
 */
async function findByDescription(
  pattern: string,
  transactions: Transaction[]
): Promise<Transaction[]> {
  const regex = new RegExp(pattern, 'i');
  return transactions.filter(tx => regex.test(tx.description));
}

/**
 * Find uncategorized transactions
 */
async function findUncategorized(transactions: Transaction[]): Promise<Transaction[]> {
  return transactions.filter(tx => !tx.category_id || tx.category_id === 0);
}

/**
 * Group duplicate candidates by amount, date, description similarity
 */
function findDuplicates(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();

  // Group by amount first
  const byAmount = new Map<number, Transaction[]>();
  for (const tx of transactions) {
    const existing = byAmount.get(tx.amount_cents) || [];
    existing.push(tx);
    byAmount.set(tx.amount_cents, existing);
  }

  // For each amount group, find transactions on same/adjacent dates with similar descriptions
  for (const [amount, txs] of byAmount.entries()) {
    if (txs.length < 2) continue;

    // Sort by date
    const sorted = txs.slice().sort((a, b) => a.date.localeCompare(b.date));

    // Group by similar date and description
    const clusters: Transaction[][] = [];
    for (const tx of sorted) {
      let addedToCluster = false;

      for (const cluster of clusters) {
        const first = cluster[0];
        const dateDiff = Math.abs(
          new Date(tx.date).getTime() - new Date(first.date).getTime()
        );
        const daysDiff = dateDiff / (1000 * 60 * 60 * 24);

        // Same day or adjacent day + similar description
        const similarDesc = similarity(tx.description, first.description) > 0.8;
        if (daysDiff <= 1 && similarDesc) {
          cluster.push(tx);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push([tx]);
      }
    }

    // Add clusters with 2+ transactions
    let groupNum = 0;
    for (const cluster of clusters) {
      if (cluster.length >= 2) {
        groups.set(`${amount}-${groupNum++}`, cluster);
      }
    }
  }

  return groups;
}

/**
 * String similarity (simple normalized Levenshtein)
 */
function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

/**
 * Levenshtein distance
 */
function editDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Display transactions in table
 */
function displayTable(transactions: Transaction[], categoryMap: Map<number, string>): void {
  const table = new Table({
    head: ['Date', 'Description', 'Amount', 'Category'],
    colWidths: [12, 30, 15, 20],
  });

  for (const tx of transactions) {
    const categoryName = getCategoryName(tx.category_id, categoryMap);
    table.push([
      tx.date,
      truncate(tx.description, 27),
      formatMoney(tx.amount_cents),
      truncate(categoryName, 17),
    ]);
  }

  console.log();
  console.log(table.toString());
  console.log();
}

/**
 * Display duplicate groups
 */
function displayDuplicates(groups: Map<string, Transaction[]>): void {
  let groupNum = 1;
  console.log();

  for (const [, txs] of groups) {
    const amount = formatMoney(txs[0].amount_cents, false);
    console.log(chalk.bold(`Group ${groupNum}: ${amount}`));

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const prefix = i === txs.length - 1 ? '└──' : '├──';
      console.log(`${prefix} ${tx.date} ${truncate(tx.description, 40)} ${chalk.gray(`(#${tx.id})`)}`);
    }

    console.log();
    groupNum++;
  }
}

export const findCommand = new Command('find')
  .description('Find transactions')
  .option('--desc <pattern>', 'Search by description (regex)')
  .option('--id <id>', 'Find by transaction ID')
  .option('--uncategorized', 'Find uncategorized transactions')
  .option('--duplicates', 'Find duplicate transactions')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .action(async (options) => {
    try {
      // Validation: --id is standalone
      if (options.id) {
        if (options.desc || options.uncategorized || options.duplicates ||
            options.start || options.end || options.invoice) {
          throw new Error('--id cannot be combined with other search options');
        }

        const id = parseInt(options.id);
        if (isNaN(id)) {
          throw new Error('Transaction ID must be a number');
        }

        await findById(id);
        return;
      }

      // Validation: search modes require date range or invoice
      const hasSearchMode = options.desc || options.uncategorized || options.duplicates;
      const hasDateRange = options.start && options.end;
      const hasInvoice = options.invoice;

      if (hasSearchMode && !hasDateRange && !hasInvoice) {
        throw new Error('Search requires either --invoice OR --start/--end');
      }

      // Validation: --start requires --end
      if (options.start && !options.end) {
        throw new Error('--start requires --end');
      }

      if (options.end && !options.start) {
        throw new Error('--end requires --start');
      }

      // Fetch transactions
      let transactions: Transaction[] = [];

      if (hasInvoice) {
        const parts = options.invoice.split('/');
        if (parts.length !== 2) {
          throw new Error('Invoice format must be: cardId/invoiceId');
        }

        const cardId = parseInt(parts[0]);
        const invoiceId = parseInt(parts[1]);

        if (isNaN(cardId) || isNaN(invoiceId)) {
          throw new Error('Card ID and Invoice ID must be numbers');
        }

        const spinner = ora(`Fetching invoice ${options.invoice}...`).start();
        const invoice = await api.getInvoice(cardId, invoiceId);
        spinner.succeed(`Fetched ${invoice.transactions?.length || 0} transactions`);
        transactions = invoice.transactions || [];
      } else if (hasDateRange) {
        const spinner = ora(`Fetching transactions from ${options.start} to ${options.end}...`).start();
        transactions = await api.getTransactionsBatched(options.start, options.end);
        spinner.succeed(`Fetched ${transactions.length} transactions`);
      }

      // Apply search filters
      let results = transactions;
      const categoryMap = buildCategoryMap();

      if (options.desc) {
        results = await findByDescription(options.desc, results);
        console.log(chalk.bold(`\nFound ${results.length} transactions matching "${options.desc}"\n`));
        displayTable(results, categoryMap);
      } else if (options.uncategorized) {
        results = await findUncategorized(results);
        console.log(chalk.bold(`\nFound ${results.length} uncategorized transactions\n`));
        displayTable(results, categoryMap);
      } else if (options.duplicates) {
        const groups = findDuplicates(results);
        console.log(chalk.bold(`\nFound ${groups.size} potential duplicate groups\n`));
        displayDuplicates(groups);
      } else {
        // No search mode - just list all
        console.log(chalk.bold(`\nShowing ${results.length} transactions\n`));
        displayTable(results, categoryMap);
      }

    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red(`\n❌ Unknown error occurred\n`));
      }
      process.exit(1);
    }
  });
