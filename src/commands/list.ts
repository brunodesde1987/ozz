import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { api } from '../core/api';
import { loadCategories } from '../config/loader';
import type { Category, Account, CreditCard, Invoice } from '../core/schemas';
import { formatMoney } from '../utils/format';

/**
 * List categories from local config
 */
async function listCategories(): Promise<void> {
  try {
    const categories = loadCategories();

    console.log();
    console.log(chalk.bold('Essencial'));
    const essencialEntries = Object.entries(categories.essencial).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [name, id] of essencialEntries) {
      console.log(`├── ${name} ${chalk.gray(`(${id})`)}`);
    }

    console.log();
    console.log(chalk.bold('Estilo de Vida'));
    const estiloEntries = Object.entries(categories.estilo_de_vida).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [name, id] of estiloEntries) {
      console.log(`├── ${name} ${chalk.gray(`(${id})`)}`);
    }
    console.log();

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load categories: ${error.message}`);
    }
    throw error;
  }
}

/**
 * List accounts from API
 */
async function listAccounts(): Promise<void> {
  const spinner = ora('Fetching accounts...').start();

  try {
    const accounts = await api.getAccounts();
    spinner.succeed(`Fetched ${accounts.length} accounts`);

    // Sort by name
    const sorted = accounts.slice().sort((a, b) => a.name.localeCompare(b.name));

    const table = new Table({
      head: ['ID', 'Name', 'Type', 'Default', 'Status'],
      colWidths: [10, 25, 12, 10, 10],
    });

    for (const account of sorted) {
      table.push([
        account.id.toString(),
        account.name,
        account.type,
        account.default ? chalk.green('✓') : '',
        account.archived ? chalk.gray('archived') : chalk.green('active'),
      ]);
    }

    console.log();
    console.log(table.toString());
    console.log();

  } catch (error) {
    spinner.fail('Failed to fetch accounts');
    throw error;
  }
}

/**
 * List credit cards from API
 */
async function listCards(): Promise<void> {
  const spinner = ora('Fetching cards...').start();

  try {
    const cards = await api.getCreditCards();
    spinner.succeed(`Fetched ${cards.length} cards`);

    // Sort by name
    const sorted = cards.slice().sort((a, b) => a.name.localeCompare(b.name));

    const table = new Table({
      head: ['ID', 'Name', 'Closing', 'Due', 'Status'],
      colWidths: [10, 25, 10, 10, 10],
    });

    for (const card of sorted) {
      table.push([
        card.id.toString(),
        card.name,
        card.closing_day.toString(),
        card.due_day.toString(),
        card.archived ? chalk.gray('archived') : chalk.green('active'),
      ]);
    }

    console.log();
    console.log(table.toString());
    console.log();

  } catch (error) {
    spinner.fail('Failed to fetch cards');
    throw error;
  }
}

/**
 * List invoices for a credit card
 */
async function listInvoices(cardId: number): Promise<void> {
  const spinner = ora(`Fetching invoices for card ${cardId}...`).start();

  try {
    const invoices = await api.getInvoices(cardId);
    spinner.succeed(`Fetched ${invoices.length} invoices`);

    // Sort by date descending (newest first)
    const sorted = invoices.slice().sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const table = new Table({
      head: ['ID', 'Date', 'Closing', 'Amount', 'Status'],
      colWidths: [10, 12, 12, 15, 15],
    });

    for (const invoice of sorted) {
      // Determine status based on balance
      let status = '';
      if (invoice.balance_cents === 0) {
        status = chalk.green('Paid');
      } else if (invoice.balance_cents === invoice.amount_cents) {
        status = chalk.yellow('Open');
      } else {
        status = chalk.cyan('Partial');
      }

      table.push([
        invoice.id.toString(),
        invoice.date,
        invoice.closing_date,
        formatMoney(invoice.amount_cents),
        status,
      ]);
    }

    console.log();
    console.log(table.toString());
    console.log();

  } catch (error) {
    spinner.fail('Failed to fetch invoices');
    throw error;
  }
}

export const listCommand = new Command('list')
  .description('List categories, accounts, cards, or invoices')
  .argument('<type>', 'What to list: categories, accounts, cards, invoices')
  .option('--card <id>', 'Card ID (required for invoices)')
  .action(async (type, options) => {
    try {
      const validTypes = ['categories', 'accounts', 'cards', 'invoices'];

      if (!validTypes.includes(type)) {
        throw new Error(
          `Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`
        );
      }

      // Validate invoices requires --card
      if (type === 'invoices' && !options.card) {
        throw new Error('--card <id> is required for listing invoices');
      }

      // Validate --card only valid for invoices
      if (type !== 'invoices' && options.card) {
        throw new Error('--card option is only valid for invoices');
      }

      switch (type) {
        case 'categories':
          await listCategories();
          break;
        case 'accounts':
          await listAccounts();
          break;
        case 'cards':
          await listCards();
          break;
        case 'invoices':
          const cardId = parseInt(options.card);
          if (isNaN(cardId)) {
            throw new Error('Card ID must be a number');
          }
          await listInvoices(cardId);
          break;
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
