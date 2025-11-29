import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { api } from '../core/api';
import { processBatch, type ProcessResult } from '../core/processor';
import type { Transaction } from '../core/schemas';

/**
 * Format duration in ms to human-readable string
 * e.g., 1234ms -> "1s", 65000ms -> "1m05s"
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m${secs.toString().padStart(2, '0')}s`;
}

/**
 * Format money in cents to R$ format
 * e.g., 4590 -> "R$ 45,90"
 */
function formatMoney(cents: number): string {
  const reais = Math.abs(cents / 100);
  const formatted = reais.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`;
}

/**
 * Format month from YYYY-MM to "Jan 2025"
 */
function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthName = date.toLocaleString('en-US', { month: 'short' });
  return `${monthName} ${year}`;
}

/**
 * Parse invoice option: "cardId/invoiceId" -> {cardId, invoiceId}
 */
function parseInvoiceOption(invoice: string): { cardId: number; invoiceId: number } {
  const parts = invoice.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid invoice format. Expected: cardId/invoiceId (e.g., 2171204/310)');
  }

  const cardId = parseInt(parts[0]);
  const invoiceId = parseInt(parts[1]);

  if (isNaN(cardId) || isNaN(invoiceId)) {
    throw new Error('Invalid invoice format. Card ID and Invoice ID must be numbers');
  }

  return { cardId, invoiceId };
}

/**
 * Validate options
 */
function validateOptions(options: any): void {
  const hasInvoice = Boolean(options.invoice);
  const hasStart = Boolean(options.start);
  const hasEnd = Boolean(options.end);

  // --invoice OR --start/--end (mutually exclusive)
  if (hasInvoice && (hasStart || hasEnd)) {
    throw new Error('Cannot use --invoice with --start/--end. Choose one approach.');
  }

  // --start requires --end
  if (hasStart && !hasEnd) {
    throw new Error('--start requires --end');
  }

  if (hasEnd && !hasStart) {
    throw new Error('--end requires --start');
  }

  // --account only valid with --start/--end
  if (options.account && !hasStart) {
    throw new Error('--account only valid with --start/--end');
  }

  // Must have either invoice or date range
  if (!hasInvoice && !hasStart) {
    throw new Error('Must specify either --invoice or --start/--end');
  }
}

/**
 * Display pre-execution summary
 */
function displayPreExecutionSummary(
  options: any,
  cardName?: string,
  accountName?: string
): void {
  console.log(); // blank line

  if (options.invoice) {
    const { cardId, invoiceId } = parseInvoiceOption(options.invoice);
    const cardDisplay = cardName ? `${cardName} (${cardId})` : cardId.toString();
    console.log(chalk.blue(`📋 Updating invoice ${invoiceId} for card ${cardDisplay}`));
  } else if (options.start && options.end) {
    const startFormatted = formatMonth(options.start);
    const endFormatted = formatMonth(options.end);
    const period = options.start === options.end
      ? startFormatted
      : `${startFormatted} to ${endFormatted}`;
    console.log(chalk.blue(`📋 Updating transactions from ${period}`));

    if (accountName) {
      console.log(chalk.blue(`   → Account: ${accountName}`));
    }
  }

  // Operation mode
  let operations = [];
  if (options.tagsOnly) {
    operations.push('applying tags');
  } else if (options.renameOnly) {
    operations.push('renaming merchants');
  } else {
    operations.push('categorizing transactions and renaming merchants');
  }

  console.log(chalk.blue(`   → ${operations[0].charAt(0).toUpperCase()}${operations[0].slice(1)}`));

  // Dry-run vs apply mode
  if (options.apply) {
    console.log(chalk.yellow(`   → ⚠️  APPLYING CHANGES (not a dry-run)`));
  } else {
    console.log(chalk.blue(`   → Dry-run mode (use --apply to save changes)`));
  }

  console.log(); // blank line
}

/**
 * Display results table (only for --debug mode or when requested)
 */
function displayResultsTable(results: ProcessResult[]): void {
  const table = new Table({
    head: ['Description', 'Amount', 'Category', 'Action'],
    colWidths: [30, 15, 25, 10],
  });

  for (const result of results) {
    const desc = result.transaction.description.slice(0, 28);
    const amount = formatMoney(result.transaction.amount_cents);

    let category = '-';
    if (result.changes?.category_id) {
      category = result.changes.category_id.toString();
    }

    let action = '';
    switch (result.action) {
      case 'update':
        action = '✅';
        break;
      case 'rename':
        action = '🔄';
        break;
      case 'conflict':
        action = '⚠️';
        break;
      case 'skip':
        action = '⏭️';
        break;
    }

    table.push([desc, amount, category, action]);
  }

  console.log(table.toString());
}

/**
 * Display post-execution summary
 */
function displayPostExecutionSummary(
  results: ProcessResult[],
  durationMs: number,
  isDryRun: boolean
): void {
  const categorized = results.filter(r => r.action === 'update' && r.changes?.category_id).length;
  const renamed = results.filter(r => r.changes?.description).length;
  const conflicts = results.filter(r => r.action === 'conflict').length;
  const skipped = results.filter(r => r.action === 'skip').length;

  const duration = formatDuration(durationMs);

  console.log(); // blank line
  console.log(chalk.green(`✅ Complete in ${duration}`));

  const parts = [];
  if (categorized > 0) parts.push(`${categorized} categorized`);
  if (renamed > 0) parts.push(`${renamed} renamed`);
  if (conflicts > 0) parts.push(`${conflicts} conflicts`);
  if (skipped > 0) parts.push(`${skipped} skipped`);

  const suffix = isDryRun ? ' [dry-run]' : '';
  console.log(chalk.green(`   ${parts.join(', ')}${suffix}`));
  console.log(); // blank line
}

export const updateCommand = new Command('update')
  .description('Categorize and rename transactions')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('--account <id>', 'Account ID')
  .option('--apply', 'Actually apply changes (default: dry-run)')
  .option('--force', 'Override manual edits')
  .option('--rename-only', 'Only rename, skip categorization')
  .option('--tags-only', 'Only apply tags')
  .action(async (options) => {
    try {
      // 1. Validate options
      validateOptions(options);

      // 2. Fetch metadata for display (card name or account name)
      let cardName: string | undefined;
      let accountName: string | undefined;

      if (options.invoice) {
        const { cardId } = parseInvoiceOption(options.invoice);
        try {
          const cards = await api.getCreditCards();
          const card = cards.find(c => c.id === cardId);
          cardName = card?.name;
        } catch {
          // Ignore errors fetching card name
        }
      }

      if (options.account) {
        try {
          const accounts = await api.getAccounts();
          const account = accounts.find(a => a.id === parseInt(options.account));
          accountName = account?.name;
        } catch {
          // Ignore errors fetching account name
        }
      }

      // 3. Display pre-execution summary
      displayPreExecutionSummary(options, cardName, accountName);

      // 4. Fetch transactions with loading spinner
      const startTime = Date.now();
      const spinner = ora('Fetching transactions...').start();

      // Update spinner text with elapsed time every second
      const timer = setInterval(() => {
        const elapsed = formatDuration(Date.now() - startTime);
        spinner.text = `Fetching transactions... ${elapsed}`;
      }, 1000);

      let transactions: Transaction[] = [];

      try {
        if (options.invoice) {
          const { cardId, invoiceId } = parseInvoiceOption(options.invoice);
          const invoice = await api.getInvoice(cardId, invoiceId);
          transactions = invoice.transactions;
        } else if (options.start && options.end) {
          const startDate = `${options.start}-01`;
          const endDate = `${options.end}-01`;
          const accountId = options.account ? parseInt(options.account) : undefined;

          // Use batched fetching for date ranges to avoid 500-transaction limit
          transactions = await api.getTransactionsBatched(startDate, endDate, accountId);
        }

        clearInterval(timer);
        const fetchDuration = formatDuration(Date.now() - startTime);
        spinner.succeed(`Fetched ${transactions.length} transactions in ${fetchDuration}`);
      } catch (error) {
        clearInterval(timer);
        spinner.fail('Failed to fetch transactions');
        throw error;
      }

      // 5. Process transactions
      const processingSpinner = ora('Processing transactions...').start();
      const processStartTime = Date.now();

      const results = await processBatch(transactions, {
        apply: options.apply || false,
        force: options.force || false,
        renameOnly: options.renameOnly || false,
        tagsOnly: options.tagsOnly || false,
      });

      processingSpinner.succeed(`Processed ${results.length} transactions`);

      // 6. Apply changes if --apply is set
      if (options.apply) {
        const applySpinner = ora('Applying changes...').start();
        let applied = 0;

        for (const result of results) {
          if (result.changes && (result.action === 'update' || result.action === 'rename')) {
            try {
              await api.updateTransaction(result.transaction.id, result.changes);
              applied++;
            } catch (error) {
              console.error(
                chalk.red(`Failed to update transaction ${result.transaction.id}: ${error}`)
              );
            }
          }
        }

        applySpinner.succeed(`Applied ${applied} changes`);
      }

      // 7. Display post-execution summary
      const totalDuration = Date.now() - startTime;
      displayPostExecutionSummary(results, totalDuration, !options.apply);

    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red(`\n❌ Unknown error occurred\n`));
      }
      process.exit(1);
    }
  });
