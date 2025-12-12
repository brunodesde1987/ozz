import chalk from 'chalk';

interface LogEntry {
  timestamp: string;
  command: string;
  args: Record<string, unknown>;
  results?: Record<string, unknown>;
  transactions?: Array<{
    id: number;
    description: string;
    action: string;
    old_category?: string | number | null;
    new_category?: string | number;
  }>;
  skipped?: Array<{
    id: number;
    description: string;
    reason?: string;
    category?: string | number | null;
  }>;
  error?: string;
}

class Logger {
  private command: string = '';
  private args: Record<string, unknown> = {};
  private logDir: string;

  constructor() {
    // Log dir relative to project root
    this.logDir = new URL('../../logs', import.meta.url).pathname;
  }

  // Set command context
  setCommand(command: string, args: Record<string, unknown>) {
    this.command = command;
    this.args = args;
  }

  // Console output methods
  info(message: string) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string) {
    console.log(chalk.green('✓'), message);
  }

  warn(message: string) {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string) {
    console.log(chalk.red('✗'), message);
  }

  debug(message: string) {
    if (process.env.DEBUG || (globalThis as { debugMode?: boolean }).debugMode) {
      console.log(chalk.gray('⚙'), message);
    }
  }

  // Write log file
  async writeLog(results: Record<string, unknown>, transactions?: LogEntry['transactions'], skipped?: LogEntry['skipped']) {
    const timestamp = new Date().toISOString();
    const filename = this.generateFilename();

    const entry: LogEntry = {
      timestamp,
      command: this.command,
      args: this.args,
      results,
      transactions,
      skipped,
    };

    // Ensure logs dir exists
    await Bun.write(`${this.logDir}/.gitkeep`, '');
    await Bun.write(`${this.logDir}/${filename}`, JSON.stringify(entry, null, 2));

    return `${this.logDir}/${filename}`;
  }

  private generateFilename(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '-');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `${date}_${time}_${this.command}.json`;
  }
}

export const logger = new Logger();
