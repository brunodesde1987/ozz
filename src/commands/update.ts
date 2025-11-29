import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { api } from '../core/api';
import { processBatch, type ProcessResult } from '../core/processor';
import type { Transaction } from '../core/schemas';
import { logger } from '../utils/logger';
import { formatDuration, formatMoney, formatMonth } from '../utils/format';
import { InvoiceOptionSchema, UpdateOptionsSchema } from '../utils/options';

interface UpdateOptions {
  invoice?: string;
  start?: string;
  end?: string;
  account?: string;
  apply?: boolean;
  force?: boolean;
  renameOnly?: boolean;
  tagsOnly?: boolean;
  debug?: boolean;
}

/**
 * Display pre-execution summary
 */
function displayPreExecutionSummary(
  options: UpdateOptions,
  cardName?: string,
  accountName?: string
): void {
  console.log(); // blank line

  if (options.invoice) {
    const result = InvoiceOptionSchema.safeParse(options.invoice);
    if (!result.success) {
      throw new Error('Invalid invoice format. Expected: cardId/invoiceId (e.g., 2171204/310)');
    }
    const { cardId, invoiceId } = result.data;
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
  .option('--debug', 'Enable debug output')
  .action(async (options) => {
    try {
      // 1. Set logger command context
      logger.setCommand('update', options);

      // 2. Validate options
      const validationResult = UpdateOptionsSchema.safeParse(options);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => e.message).join(', ');
        throw new Error(`Invalid options: ${errors}`);
      }

      // 3. Fetch metadata for display (card name or account name)
      let cardName: string | undefined;
      let accountName: string | undefined;

      if (options.invoice) {
        const result = InvoiceOptionSchema.safeParse(options.invoice);
        if (!result.success) {
          throw new Error('Invalid invoice format. Expected: cardId/invoiceId (e.g., 2171204/310)');
        }
        const { cardId } = result.data;
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

      // 4. Display pre-execution summary
      displayPreExecutionSummary(options, cardName, accountName);

      // 5. Fetch transactions with loading spinner
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
          const result = InvoiceOptionSchema.safeParse(options.invoice);
          if (!result.success) {
            throw new Error('Invalid invoice format. Expected: cardId/invoiceId (e.g., 2171204/310)');
          }
          const { cardId, invoiceId } = result.data;
          const invoice = await api.getInvoice(cardId, invoiceId);
          transactions = invoice.transactions || [];
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

      // 6. Process transactions
      const processingSpinner = ora('Processing transactions...').start();

      const results = await processBatch(transactions, {
        apply: options.apply || false,
        force: options.force || false,
        renameOnly: options.renameOnly || false,
        tagsOnly: options.tagsOnly || false,
      });

      processingSpinner.succeed(`Processed ${results.length} transactions`);

      // Debug: show results table
      if (options.debug) {
        logger.debug('Displaying results table');
        displayResultsTable(results);
      }

      // 7. Apply changes if --apply is set
      if (options.apply) {
        const applySpinner = ora('Applying changes...').start();
        let applied = 0;

        for (const result of results) {
          if (result.changes && (result.action === 'update' || result.action === 'rename')) {
            try {
              await api.updateTransaction(result.transaction.id, result.changes);
              applied++;
              logger.debug(`Updated transaction ${result.transaction.id}`);
            } catch (error) {
              console.error(
                chalk.red(`Failed to update transaction ${result.transaction.id}: ${error}`)
              );
            }
          }
        }

        applySpinner.succeed(`Applied ${applied} changes`);
      }

      // 8. Display post-execution summary
      const totalDuration = Date.now() - startTime;
      displayPostExecutionSummary(results, totalDuration, !options.apply);

      // 9. Write log file
      const categorized = results.filter(r => r.action === 'update' && r.changes?.category_id).length;
      const renamed = results.filter(r => r.changes?.description).length;
      const conflicts = results.filter(r => r.action === 'conflict').length;
      const skipped = results.filter(r => r.action === 'skip').length;

      const logResults = {
        total: results.length,
        categorized,
        renamed,
        conflicts,
        skipped,
        durationMs: totalDuration,
        isDryRun: !options.apply,
      };

      const transactionDetails = results
        .filter(r => r.action === 'update' || r.action === 'rename' || r.action === 'conflict')
        .map(r => ({
          id: r.transaction.id,
          action: r.action,
          old_category: r.transaction.category_id,
          new_category: r.changes?.category_id?.toString(),
        }));

      const logPath = await logger.writeLog(logResults, transactionDetails);
      logger.debug(`Log written to ${logPath}`);

    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red(`\n❌ Unknown error occurred\n`));
      }
      process.exit(1);
    }
  });
