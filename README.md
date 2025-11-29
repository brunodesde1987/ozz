# OZZ - Organizze CLI

### Overview
CLI tool to manage Organizze transactions: categorize, rename, tag, export.

### Installation
```bash
# Clone and install
git clone https://github.com/brunodesde1987/ozz.git
cd ozz
bun install

# Setup credentials
cp .env.example .env
# Edit .env with your Organizze email and API token

# Global install
bun link
```

### Commands

#### `ozz update`
Categorize and rename transactions.
```bash
ozz update --invoice 2171204/310              # credit card invoice
ozz update --start 2025-01 --end 2025-03      # date range
ozz update --invoice 2171204/310 --apply      # actually apply changes
ozz update --invoice 2171204/310 --force      # override manual edits
ozz update --invoice 2171204/310 --rename-only
```

#### `ozz list`
List resources.
```bash
ozz list categories    # grouped by budget type
ozz list accounts      # bank accounts
ozz list cards         # credit cards
ozz list invoices --card 2171204
```

#### `ozz find`
Search transactions.
```bash
ozz find --id 3090466957
ozz find --desc "UBER" --start 2025-01 --end 2025-01
ozz find --uncategorized --start 2025-01 --end 2025-01
ozz find --duplicates --invoice 2171204/310
```

#### `ozz export`
Export to CSV.
```bash
ozz export csv --invoice 2171204/310 -o ~/Downloads/
ozz export csv --start 2025-01 --end 2025-03
```

#### `ozz config`
Manage configuration.
```bash
ozz config validate    # check all YAML files
ozz config show        # display config summary
```

### Configuration Files

Located in `config/`:

| File | Description | Git |
|------|-------------|-----|
| categories.yaml | Category definitions by budget type | ✓ |
| rules.yaml | Auto-categorization patterns | ✗ |
| rules.example.yaml | Sample rules | ✓ |
| rename.yaml | Merchant name normalization | ✗ |
| rename.example.yaml | Sample renames | ✓ |
| tags.yaml | Category to tags mapping | ✓ |
| pix.yaml | Manual PIX overrides (optional) | ✗ |

### Project Structure

```
ozz/
├── bin/
│   └── ozz.ts              # CLI entry point
├── src/
│   ├── commands/
│   │   ├── update.ts       # categorize/rename transactions
│   │   ├── list.ts         # list resources
│   │   ├── find.ts         # search transactions
│   │   ├── export.ts       # CSV export
│   │   └── config.ts       # config management
│   ├── core/
│   │   ├── api.ts          # Organizze API client
│   │   ├── processor.ts    # categorization logic
│   │   └── schemas.ts      # Zod schemas for API
│   ├── config/
│   │   └── loader.ts       # YAML config loader
│   └── utils/
│       ├── format.ts       # formatting helpers (Intl API)
│       ├── date.ts         # date utilities
│       ├── options.ts      # Zod schemas for CLI options
│       └── logger.ts       # JSON logging
├── config/                 # YAML configuration files
├── logs/                   # command logs (gitignored)
└── package.json
```

### Tech Stack

- **Runtime**: Bun
- **CLI**: Commander
- **Validation**: Zod
- **Output**: chalk, ora, cli-table3
- **Config**: Native Bun YAML imports

### Key Features

- **Smart Skip Logic**: Detects manual edits via timestamp comparison
- **Installment Inheritance**: Copies category from previous installment
- **Auto-batching**: Splits large date ranges into monthly API calls
- **Rate Limiting**: 200ms delay + exponential backoff on 429
- **Dry-run Default**: Safe by default, use --apply to commit changes
- **JSON Logging**: Every command creates a timestamped log file

### Testing

```bash
bun test
```

20 tests covering:
- formatDuration, formatMoney, truncate
- Invoice option parsing
- Update options validation

### Development

```bash
bun run bin/ozz.ts --help    # run locally
bun test                      # run tests
bun build bin/ozz.ts --target bun --outdir dist  # build
```

### License

MIT
