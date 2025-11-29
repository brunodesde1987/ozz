import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { validateConfig, loadAllConfig, loadCategories, loadRules, loadRename, loadTags, loadPix } from '../config/loader';

export const configCommand = new Command('config')
  .description('Manage configuration')
  .argument('<action>', 'Action: validate, show')
  .action(async (action) => {
    try {
      if (action === 'validate') {
        await handleValidate();
      } else if (action === 'show') {
        await handleShow();
      } else {
        console.error(chalk.red(`Unknown action: ${action}`));
        console.error(chalk.dim('Supported actions: validate, show'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('\n✗ Configuration error'));
      if (error instanceof Error) {
        console.error(chalk.dim(`  → ${error.message}`));
      }
      process.exit(1);
    }
  });

async function handleValidate() {
  console.log(chalk.dim('Validating configuration...\n'));

  const results: Array<{ name: string; status: 'ok' | 'error' | 'warning'; count: number; message?: string }> = [];

  // Validate categories
  try {
    const categories = loadCategories();
    const count = Object.values(categories).reduce((sum, group) => sum + Object.keys(group).length, 0);
    results.push({ name: 'categories.yaml', status: 'ok', count });
  } catch (error) {
    results.push({
      name: 'categories.yaml',
      status: 'error',
      count: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Validate rules
  try {
    const rules = loadRules();
    results.push({ name: 'rules.yaml', status: 'ok', count: rules.length });
  } catch (error) {
    results.push({
      name: 'rules.yaml',
      status: 'error',
      count: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Validate rename
  try {
    const rename = loadRename();
    results.push({ name: 'rename.yaml', status: 'ok', count: Object.keys(rename).length });
  } catch (error) {
    results.push({
      name: 'rename.yaml',
      status: 'error',
      count: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Validate tags
  try {
    const tags = loadTags();
    results.push({ name: 'tags.yaml', status: 'ok', count: Object.keys(tags).length });
  } catch (error) {
    results.push({
      name: 'tags.yaml',
      status: 'error',
      count: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Validate pix (optional)
  try {
    const pix = await loadPix();
    const count = Object.keys(pix).length;
    if (count === 0) {
      results.push({ name: 'pix.yaml', status: 'warning', count: 0, message: 'not found (optional)' });
    } else {
      results.push({ name: 'pix.yaml', status: 'ok', count });
    }
  } catch {
    results.push({ name: 'pix.yaml', status: 'warning', count: 0, message: 'not found (optional)' });
  }

  // Display results
  const hasErrors = results.some((r) => r.status === 'error');

  for (const result of results) {
    const icon = result.status === 'ok' ? chalk.green('✓') : result.status === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
    const countText = result.count > 0 ? chalk.dim(` - ${result.count} ${getCountLabel(result.name, result.count)}`) : '';
    const message = result.message ? chalk.dim(` (${result.message})`) : '';
    console.log(`${icon} ${result.name}${countText}${message}`);

    if (result.status === 'error') {
      console.log(chalk.red(`  → ${result.message}`));
    }
  }

  console.log();

  if (hasErrors) {
    console.log(chalk.red('Configuration has errors. Please fix before running commands.'));
    process.exit(1);
  } else {
    console.log(chalk.green('All configurations valid!'));
  }
}

async function handleShow() {
  console.log();
  console.log(chalk.cyan.bold('Configuration Summary'));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━\n'));

  try {
    const config = await loadAllConfig();

    // Categories section
    const essentialCount = Object.keys(config.categories.essencial).length;
    const lifestyleCount = Object.keys(config.categories.estilo_de_vida).length;
    const totalCategories = essentialCount + lifestyleCount;

    console.log(chalk.bold(`Categories (${totalCategories})`));
    console.log(`├── Essencial: ${essentialCount} categories`);
    console.log(`└── Estilo de Vida: ${lifestyleCount} categories\n`);

    // Rules section with top categories by rule count
    const rulesByCategory: Record<string, number> = {};
    for (const rule of config.rules) {
      rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
    }

    const topCategories = Object.entries(rulesByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);

    console.log(chalk.bold(`Rules (${config.rules.length})`));
    for (let i = 0; i < topCategories.length; i++) {
      const [category, count] = topCategories[i];
      const isLast = i === topCategories.length - 1;
      const prefix = isLast ? '└──' : '├──';
      console.log(`${prefix} ${category}: ${count} ${count === 1 ? 'pattern' : 'patterns'}`);
    }
    console.log();

    // Rename section
    console.log(chalk.bold(`Rename (${Object.keys(config.rename).length} mappings)`));

    // Tags section
    console.log(chalk.bold(`Tags (${Object.keys(config.tags).length} category mappings)`));

    // Pix section
    const pixCount = Object.keys(config.pix).length;
    console.log(chalk.bold(`Pix (${pixCount} overrides)`));

    console.log();

    // Config path
    const configPath = path.resolve(__dirname, '../../config');
    console.log(chalk.dim(`Config path: ${configPath}`));
  } catch (error) {
    throw error;
  }
}

function getCountLabel(filename: string, count: number): string {
  if (filename === 'categories.yaml') return count === 1 ? 'category' : 'categories';
  if (filename === 'rules.yaml') return count === 1 ? 'rule' : 'rules';
  if (filename === 'rename.yaml') return count === 1 ? 'mapping' : 'mappings';
  if (filename === 'tags.yaml') return count === 1 ? 'mapping' : 'mappings';
  if (filename === 'pix.yaml') return count === 1 ? 'override' : 'overrides';
  return 'items';
}
