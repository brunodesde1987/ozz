#!/usr/bin/env bun
import { program } from 'commander';
import chalk from 'chalk';
import { updateCommand } from '../src/commands/update';
import { listCommand } from '../src/commands/list';
import { findCommand } from '../src/commands/find';
import { exportCommand } from '../src/commands/export';
import { configCommand } from '../src/commands/config';

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

// Add commands
program.addCommand(updateCommand);
program.addCommand(listCommand);
program.addCommand(findCommand);
program.addCommand(exportCommand);
program.addCommand(configCommand);

program
  .option('--dry-run', 'Preview only (default for destructive)')
  .option('--json', 'Machine-readable output')
  .option('--debug', 'Verbose logging');

program.parse();
