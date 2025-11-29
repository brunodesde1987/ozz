import { z } from "zod";
import categoriesYaml from "../../config/categories.yaml";
import rulesYaml from "../../config/rules.yaml";
import renameYaml from "../../config/rename.yaml";
import tagsYaml from "../../config/tags.yaml";

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

// Helper to validate and format errors
function parseWithValidation<T>(data: unknown, schema: z.ZodType<T>, filename: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Validation failed for ${filename}:\n${issues}`);
    }
    throw new Error(`Failed to parse ${filename}: ${error}`);
  }
}

// Helper to load optional YAML files with try/catch
async function loadPixAsync(): Promise<Pix> {
  try {
    const pix = await import("../../config/pix.yaml");
    return parseWithValidation(pix.default, PixSchema, "pix.yaml");
  } catch {
    return {};
  }
}

// Individual loaders
export function loadCategories(): Categories {
  return parseWithValidation(categoriesYaml, CategoriesSchema, "categories.yaml");
}

export function loadRules(): Rules {
  return parseWithValidation(rulesYaml, RulesSchema, "rules.yaml");
}

export function loadRename(): Rename {
  return parseWithValidation(renameYaml, RenameSchema, "rename.yaml");
}

export function loadTags(): Tags {
  return parseWithValidation(tagsYaml, TagsSchema, "tags.yaml");
}

export async function loadPix(): Promise<Pix> {
  return loadPixAsync();
}

// Load all configs
export async function loadAllConfig(): Promise<AllConfig> {
  return {
    categories: loadCategories(),
    rules: loadRules(),
    rename: loadRename(),
    tags: loadTags(),
    pix: await loadPix(),
  };
}

// Validate all configs without returning data
export async function validateConfig(): Promise<boolean> {
  const errors: string[] = [];

  const syncConfigs = [
    { name: "categories.yaml", loader: loadCategories },
    { name: "rules.yaml", loader: loadRules },
    { name: "rename.yaml", loader: loadRename },
    { name: "tags.yaml", loader: loadTags },
  ];

  for (const config of syncConfigs) {
    try {
      config.loader();
    } catch (error) {
      errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await loadPix();
  } catch (error) {
    errors.push(`pix.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.join("\n")}`);
  }

  return true;
}
