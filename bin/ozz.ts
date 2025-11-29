#!/usr/bin/env bun
import { program } from 'commander';
import chalk from 'chalk';

const banner = `
   ██████╗ ███████╗███████╗
  ██╔═══██╗╚══███╔╝╚══███╔╝
  ██║   ██║  ███╔╝   ███╔╝
  ██║   ██║ ███╔╝   ███╔╝
  ╚██████╔╝███████╗███████╗
   ╚═════╝ ╚══════╝╚══════╝
        Organizze CLI
`;

program
  .name('ozz')
  .description('CLI to manage Organizze transactions')
  .version('0.1.0')
  .hook('preAction', () => {
    console.log(chalk.green(banner));
  });

program
  .command('update')
  .description('Categorize and rename transactions')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('--account <id>', 'Account ID')
  .option('--apply', 'Actually apply changes (default: dry-run)')
  .option('--force', 'Override manual edits')
  .option('--rename-only', 'Only rename, skip categorization')
  .option('--tags-only', 'Only apply tags')
  .action((options) => {
    console.log('Update command - not implemented yet', options);
  });

program
  .command('list <type>')
  .description('List categories, accounts, cards, or invoices')
  .option('--card <id>', 'Card ID (for invoices)')
  .action((type, options) => {
    console.log(`List ${type} - not implemented yet`, options);
  });

program
  .command('find')
  .description('Find transactions')
  .option('--desc <pattern>', 'Search by description')
  .option('--id <id>', 'Find by ID')
  .option('--uncategorized', 'Find uncategorized')
  .option('--duplicates', 'Find duplicates')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .action((options) => {
    console.log('Find command - not implemented yet', options);
  });

program
  .command('export <format>')
  .description('Export transactions (csv)')
  .option('--invoice <cardId/invoiceId>', 'Credit card invoice')
  .option('--start <YYYY-MM>', 'Start month')
  .option('--end <YYYY-MM>', 'End month')
  .option('-o, --output <path>', 'Output directory')
  .action((format, options) => {
    console.log(`Export ${format} - not implemented yet`, options);
  });

program
  .command('config <action>')
  .description('Manage config (validate, show)')
  .action((action) => {
    console.log(`Config ${action} - not implemented yet`);
  });

program
  .option('--dry-run', 'Preview only (default for destructive)')
  .option('--json', 'Machine-readable output')
  .option('--debug', 'Verbose logging');

program.parse();
