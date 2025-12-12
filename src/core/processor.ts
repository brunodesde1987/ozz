import type { Transaction, Invoice } from './schemas';
import type { Categories, Rule, Tags } from '../config/loader';
import { loadAllConfig } from '../config/loader';
import { buildCategoryMap } from '../utils/format';
import { api } from './api';

export interface ProcessResult {
  transaction: Transaction;
  action: 'update' | 'rename' | 'skip' | 'conflict';
  changes?: {
    category_id?: number;
    description?: string;
    notes?: string;
    tags?: string[];
  };
  reason?: string;
}

/**
 * Match transaction description against rules.yaml patterns
 * First match wins
 */
export function matchCategory(description: string, rules: Rule[]): string | null {
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule.pattern, 'i'); // Case-insensitive
      if (regex.test(description)) {
        return rule.category;
      }
    } catch (error) {
      // Skip invalid regex patterns
      console.warn(`Invalid pattern in rule: ${rule.pattern}`, error);
    }
  }
  return null;
}

/**
 * Match transaction description against rename.yaml patterns
 * Patterns use glob-like syntax: "UBER*" matches "UBER TRIP 123"
 */
export function matchRename(description: string, renameMap: Record<string, string>): string | null {
  for (const [pattern, newName] of Object.entries(renameMap)) {
    // Convert glob to regex: * -> .*, ? -> .
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*')                  // * -> .*
      .replace(/\?/g, '.');                  // ? -> .

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(description)) {
        return newName;
      }
    } catch (error) {
      console.warn(`Invalid rename pattern: ${pattern}`, error);
    }
  }
  return null;
}

/**
 * Find previous installment to inherit category
 * If transaction.installment > 1, find same description with installment - 1
 */
export async function resolveInstallment(
  transaction: Transaction,
  allTransactions: Transaction[]
): Promise<number | null> {
  // Only applies to installment payments
  if (transaction.installment <= 1) {
    return null;
  }

  // Look for previous installment
  const targetInstallment = transaction.installment - 1;

  // Extract base description pattern (remove installment numbers)
  // e.g., "Netflix 2/12" -> "Netflix"
  const baseDescription = transaction.description
    .replace(/\s*\d+\/\d+\s*$/, '') // Remove "X/Y" at end
    .trim();

  // Find matching transaction with previous installment
  const previousInstallment = allTransactions.find(txn => {
    if (txn.installment !== targetInstallment) return false;
    if (txn.total_installments !== transaction.total_installments) return false;

    // Check if base descriptions match
    const txnBaseDescription = txn.description
      .replace(/\s*\d+\/\d+\s*$/, '')
      .trim();

    return txnBaseDescription === baseDescription;
  });

  return previousInstallment?.category_id ?? null;
}

// Cache for invoice data during batch processing
let invoiceCache: Map<number, Invoice[]> | null = null;

/**
 * Get cached invoices for a card, fetching if needed
 * Only fetches last 12 invoices (covers max installment period)
 */
async function getCachedInvoices(cardId: number, currentInvoiceId: number): Promise<Invoice[]> {
  if (!invoiceCache) {
    invoiceCache = new Map();
  }

  if (!invoiceCache.has(cardId)) {
    // Fetch invoice list (without transactions)
    const invoiceList = await api.getInvoices(cardId);

    // Sort by date descending, find current invoice index
    const sorted = invoiceList.sort((a, b) => b.date.localeCompare(a.date));
    const currentIdx = sorted.findIndex(inv => inv.id === currentInvoiceId);

    // Get up to 12 invoices starting from current (inclusive)
    const relevantInvoices = currentIdx >= 0
      ? sorted.slice(currentIdx, currentIdx + 12)
      : sorted.slice(0, 12);

    // Fetch full invoice data with transactions
    const fullInvoices: Invoice[] = [];
    for (const inv of relevantInvoices) {
      const full = await api.getInvoice(cardId, inv.id);
      fullInvoices.push(full);
    }

    invoiceCache.set(cardId, fullInvoices);
  }

  return invoiceCache.get(cardId)!;
}

/**
 * Clear invoice cache (call at start of batch processing)
 */
export function clearInvoiceCache(): void {
  invoiceCache = null;
}

/**
 * Find most consistent category across all prior installments
 * Searches previous invoices for the same purchase
 */
export async function findInstallmentCategory(
  transaction: Transaction,
  cardId: number,
  currentInvoiceId: number
): Promise<number | null> {
  // Only applies to installment payments (2nd installment onwards)
  if (transaction.installment <= 1) {
    return null;
  }

  // Extract base description (remove "X/Y" suffix)
  const baseDescription = transaction.description
    .replace(/\s*\d+\/\d+\s*$/, '')
    .trim();

  // Get cached invoices
  const invoices = await getCachedInvoices(cardId, currentInvoiceId);

  // Collect all prior installments of this purchase
  const priorCategories: number[] = [];

  for (const invoice of invoices) {
    if (!invoice.transactions) continue;

    for (const txn of invoice.transactions) {
      // Skip if not same purchase series
      if (txn.total_installments !== transaction.total_installments) continue;
      if (txn.installment >= transaction.installment) continue;

      // Check base description match
      const txnBase = txn.description.replace(/\s*\d+\/\d+\s*$/, '').trim();
      if (txnBase !== baseDescription) continue;

      // Found a prior installment with a category
      if (txn.category_id) {
        priorCategories.push(txn.category_id);
      }
    }
  }

  if (priorCategories.length === 0) {
    return null;
  }

  // Return mode (most frequent category)
  const counts = new Map<number, number>();
  for (const cat of priorCategories) {
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  let maxCount = 0;
  let modeCategory: number | null = null;
  for (const [cat, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeCategory = cat;
    }
  }

  return modeCategory;
}

/**
 * Smart skip logic - detect manual edits
 */
export function shouldSkip(
  transaction: Transaction,
  suggestedCategoryId: number | null,
  force: boolean
): { skip: boolean; reason?: string } {
  // 1. No suggested category -> skip (no rule matched)
  if (suggestedCategoryId === null) {
    return { skip: true, reason: 'no_match' };
  }

  // 2. Already correct -> skip
  if (transaction.category_id === suggestedCategoryId) {
    return { skip: true, reason: 'already_correct' };
  }

  // 3. Manual edit detection (unless force=true)
  if (!force) {
    const createdAt = new Date(transaction.created_at);
    const updatedAt = new Date(transaction.updated_at);

    // If updated_at > created_at, user made manual changes
    if (updatedAt > createdAt) {
      return { skip: true, reason: 'manual_edit' };
    }
  }

  // 4. Don't skip - allow update
  return { skip: false };
}

/**
 * Get category ID from name using categories.yaml
 * Search in essencial and estilo_de_vida groups
 */
export function getCategoryId(categoryName: string, categories: Categories): number | null {
  // Search in essencial group
  if (categoryName in categories.essencial) {
    return categories.essencial[categoryName];
  }

  // Search in estilo_de_vida group
  if (categoryName in categories.estilo_de_vida) {
    return categories.estilo_de_vida[categoryName];
  }

  return null;
}

// Cache the category map
let categoryMapCache: Map<number, string> | null = null;

async function getCategoryMap(): Promise<Map<number, string>> {
  if (!categoryMapCache) {
    categoryMapCache = buildCategoryMap();
  }
  return categoryMapCache;
}

/**
 * Get tags for a category using reverse lookup
 * 1. Find category name from category_id
 * 2. Look up tags for that category name in tags.yaml
 */
export async function getTagsForCategory(categoryId: number | null, tags: Tags): Promise<string[]> {
  if (!categoryId) return [];

  const categoryMap = await getCategoryMap();
  const categoryName = categoryMap.get(categoryId);

  if (!categoryName) return [];
  return tags[categoryName] || [];
}

/**
 * Process a batch of transactions
 */
export async function processBatch(
  transactions: Transaction[],
  options: {
    apply: boolean;
    force: boolean;
    renameOnly: boolean;
    tagsOnly: boolean;
    cardId?: number;
    invoiceId?: number;
  }
): Promise<ProcessResult[]> {
  const config = await loadAllConfig();
  const results: ProcessResult[] = [];

  // Clear invoice cache at start of batch
  if (options.cardId && options.invoiceId) {
    clearInvoiceCache();
  }

  for (const txn of transactions) {
    const changes: ProcessResult['changes'] = {};
    let suggestedCategoryId: number | null = null;
    let categorySource: 'installment' | 'pattern' | null = null;

    // Skip category logic if renameOnly or tagsOnly
    if (!options.renameOnly && !options.tagsOnly) {
      // 1. Try installment inheritance first
      let inheritedCategoryId: number | null = null;
      if (options.cardId && options.invoiceId) {
        // Cross-invoice lookup
        inheritedCategoryId = await findInstallmentCategory(txn, options.cardId, options.invoiceId);
      } else {
        // Fallback to same-batch lookup
        inheritedCategoryId = await resolveInstallment(txn, transactions);
      }
      if (inheritedCategoryId) {
        suggestedCategoryId = inheritedCategoryId;
        categorySource = 'installment';
      }

      // 2. Then pattern matching
      if (!suggestedCategoryId) {
        const categoryName = matchCategory(txn.description, config.rules);
        if (categoryName) {
          suggestedCategoryId = getCategoryId(categoryName, config.categories);
          categorySource = 'pattern';
        }
      }

      // Check if we should skip this transaction
      const skipResult = shouldSkip(txn, suggestedCategoryId, options.force);
      if (skipResult.skip) {
        results.push({
          transaction: txn,
          action: 'skip',
          reason: skipResult.reason,
        });
        continue;
      }

      // Add category change
      if (suggestedCategoryId) {
        changes.category_id = suggestedCategoryId;
      }
    }

    // 3. Apply rename if matched (unless tagsOnly)
    if (!options.tagsOnly) {
      const newDescription = matchRename(txn.description, config.rename);
      if (newDescription && newDescription !== txn.description) {
        changes.description = newDescription;
      }
    }

    // 4. Handle tags
    if (options.tagsOnly) {
      // For tagsOnly: look up tags from current transaction's category_id
      const tags = await getTagsForCategory(txn.category_id, config.tags);
      if (tags.length > 0) {
        changes.tags = tags;
      }
    } else if (suggestedCategoryId) {
      // For normal update: add tags based on the new category
      const tags = await getTagsForCategory(suggestedCategoryId, config.tags);
      if (tags.length > 0) {
        changes.tags = tags;
      }
    }

    // Determine action
    let action: ProcessResult['action'] = 'skip';

    if (Object.keys(changes).length > 0) {
      if (changes.description && !changes.category_id) {
        action = 'rename';
      } else {
        action = 'update';
      }
    }

    results.push({
      transaction: txn,
      action,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
      reason: categorySource || undefined,
    });
  }

  return results;
}
