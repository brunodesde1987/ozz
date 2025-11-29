import { loadCategories } from '../config/loader';

/**
 * Build category map: id -> name
 */
export function buildCategoryMap(): Map<number, string> {
  const categories = loadCategories();
  const map = new Map<number, string>();

  for (const [name, id] of Object.entries(categories.essencial)) {
    map.set(id as number, name);
  }
  for (const [name, id] of Object.entries(categories.estilo_de_vida)) {
    map.set(id as number, name);
  }

  return map;
}

/**
 * Format milliseconds to human readable duration
 * Uses Intl.DurationFormat if available, fallback to manual
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m${secs.toString().padStart(2, '0')}s`;
}

/**
 * Format cents to Brazilian currency using Intl.NumberFormat
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/**
 * Format YYYY-MM to readable month using Intl.DateTimeFormat
 */
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}
