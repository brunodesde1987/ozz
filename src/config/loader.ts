import { z } from "zod";
import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Derive config directory from this file's location
// Use import.meta.dir for Bun, fallback to calculating from __dirname for Node
let CONFIG_DIR: string;
if (typeof (import.meta as any).dir !== "undefined") {
  // Bun: import.meta.dir is the directory of the current file
  CONFIG_DIR = join((import.meta as any).dir, "..", "..", "config");
} else {
  // Node.js: import.meta.url is the file path
  const loaderDir = dirname(fileURLToPath(import.meta.url));
  CONFIG_DIR = join(loaderDir, "..", "..", "config");
}

// Zod schemas
const CategoryGroupSchema = z.record(z.string(), z.number());
const CategoriesSchema = z.object({
  essencial: CategoryGroupSchema,
  estilo_de_vida: CategoryGroupSchema,
});

const RuleSchema = z.object({
  pattern: z.string(),
  category: z.string(),
  note: z.string().optional(),
});
const RulesSchema = z.array(RuleSchema);

const RenameSchema = z.record(z.string(), z.string());

const TagsSchema = z.record(z.string(), z.array(z.string()));

const PixEntrySchema = z.object({
  description: z.string(),
  category: z.string(),
});
const PixSchema = z.record(z.string(), PixEntrySchema);

// Export types
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;
export type Categories = z.infer<typeof CategoriesSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type Rename = z.infer<typeof RenameSchema>;
export type Tags = z.infer<typeof TagsSchema>;
export type PixEntry = z.infer<typeof PixEntrySchema>;
export type Pix = z.infer<typeof PixSchema>;

export interface AllConfig {
  categories: Categories;
  rules: Rules;
  rename: Rename;
  tags: Tags;
  pix: Pix;
}

// Helper to load and parse YAML
function loadYaml<T>(filename: string, schema: z.ZodType<T>): T {
  const filepath = join(CONFIG_DIR, filename);

  if (!existsSync(filepath)) {
    throw new Error(`Config file not found: ${filepath}`);
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = parse(content);
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Validation failed for ${filename}:\n${issues}`);
    }
    throw new Error(`Failed to load ${filename}: ${error}`);
  }
}

// Helper to load optional YAML files
function loadOptionalYaml<T>(filename: string, schema: z.ZodType<T>, defaultValue: T): T {
  const filepath = join(CONFIG_DIR, filename);

  if (!existsSync(filepath)) {
    return defaultValue;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = parse(content);
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Validation failed for ${filename}:\n${issues}`);
    }
    throw new Error(`Failed to load ${filename}: ${error}`);
  }
}

// Individual loaders
export function loadCategories(): Categories {
  return loadYaml("categories.yaml", CategoriesSchema);
}

export function loadRules(): Rules {
  return loadYaml("rules.yaml", RulesSchema);
}

export function loadRename(): Rename {
  return loadYaml("rename.yaml", RenameSchema);
}

export function loadTags(): Tags {
  return loadYaml("tags.yaml", TagsSchema);
}

export function loadPix(): Pix {
  return loadOptionalYaml("pix.yaml", PixSchema, {});
}

// Load all configs
export function loadAllConfig(): AllConfig {
  return {
    categories: loadCategories(),
    rules: loadRules(),
    rename: loadRename(),
    tags: loadTags(),
    pix: loadPix(),
  };
}

// Validate all configs without returning data
export function validateConfig(): boolean {
  const errors: string[] = [];

  const configs = [
    { name: "categories.yaml", loader: loadCategories },
    { name: "rules.yaml", loader: loadRules },
    { name: "rename.yaml", loader: loadRename },
    { name: "tags.yaml", loader: loadTags },
    { name: "pix.yaml", loader: loadPix },
  ];

  for (const config of configs) {
    try {
      config.loader();
    } catch (error) {
      errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.join("\n")}`);
  }

  return true;
}
