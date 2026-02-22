# Arbitrum Skill Generator

A CLI tool that generates [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) from official Arbitrum documentation, smart contract source code, and MCP tools documentation. The generated skill package gives Claude deep, searchable knowledge about the entire Arbitrum ecosystem.

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Data Sources](#data-sources)
- [Project Architecture](#project-architecture)
- [Output Structure](#output-structure)
- [Configuration Reference](#configuration-reference)
- [Adding a New Contract Repository](#adding-a-new-contract-repository)

## How It Works

The generator pulls data from three independent sources, processes them into a unified Markdown-based skill package, and writes everything under a single output directory:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Data Sources                                  │
├──────────────────┬──────────────────────┬───────────────────────────────┤
│  Arbitrum Docs   │  Smart Contract Repos │  Arbitrum MCP Tools (GitBook)         │
│  (GitHub clone)  │  (GitHub clone x3)    │  (HTTP fetch)                │
└────────┬─────────┴──────────┬───────────┴──────────────┬────────────────┘
         │                    │                          │
         ▼                    ▼                          ▼
   ┌───────────┐      ┌──────────────┐          ┌──────────────┐
   │ parser.ts │      │source-parser │          │skill-generator│
   │           │      │    .ts       │          │  (fetch)      │
   └─────┬─────┘      └──────┬───────┘          └──────┬───────┘
         │ ParsedDoc[]       │ ParsedDoc[]              │ string
         └───────────────────┼──────────────────────────┘
                             ▼
                  ┌─────────────────────┐
                  │ skill-generator.ts  │
                  │ - SKILL.md          │
                  │ - Category tree     │
                  │ - Doc files         │
                  └─────────┬───────────┘
                            ▼
                  output/arbitrum-skills/
```

**Pipeline steps:**

1. **Parse Docs** — Clones `arbitrum-docs` (or uses a local path), finds all `.md`/`.mdx` files, strips JSX/MDX syntax, extracts frontmatter and titles, categorizes by directory structure.
2. **Parse Contracts** — Clones 3 smart contract repos (shallow, depth=1), scans configured directories for `.rs`, `.sol`, `.toml`, `.adoc`, `.md` files. Source code is wrapped in fenced code blocks; AsciiDoc is converted to Markdown.
3. **Fetch Arbitrum MCP Tools** — Downloads the full MCP tools documentation from GitBook as plain text.
4. **Generate Skill** — Builds a category tree from all parsed documents, generates `SKILL.md` with a structured index and instructions, writes individual doc files preserving the original hierarchy.

## Installation

```bash
git clone https://github.com/utkucy/arbitrum-skills-generator.git
cd arbitrum-skills-generator
npm install
```

Requirements: Node.js 18+, Git.

## Usage

```bash
# Full pipeline — auto-clones arbitrum-docs, contracts, fetches MCP tools
npm run generate

# Use a local docs path instead of auto-cloning
npm run generate -- ./arbitrum-docs/docs

# Skip smart contract repos (faster, docs-only)
npm run generate -- --ignore-contracts

# Skip MCP tools documentation
npm run generate -- --ignore-mcp

# Custom output directory and skill name
npm run generate -- --output ./my-output --name my-arb-skill

# Custom repos directory
npm run generate -- --contracts-dir ./my-repos

# Combine options
npm run generate -- ./local-docs --ignore-contracts --ignore-mcp -o ./out
```

### CLI Options

| Option               | Short | Default           | Description                                                             |
| -------------------- | ----- | ----------------- | ----------------------------------------------------------------------- |
| `[docs-path]`        | —     | _(auto-clone)_    | Path to docs folder. If omitted, `arbitrum-docs` is cloned to `.repos/` |
| `--output`           | `-o`  | `./output`        | Output directory for generated skill                                    |
| `--name`             | `-n`  | `arbitrum-skills` | Skill folder name                                                       |
| `--ignore-mcp`       | —     | `false`           | Skip fetching MCP tools documentation                                   |
| `--ignore-contracts` | —     | `false`           | Skip cloning and parsing smart contract repos                           |
| `--contracts-dir`    | —     | `./.repos`        | Directory where repos are cloned/cached                                 |
| `--help`             | `-h`  | —                 | Show help message                                                       |

### Installing the Generated Skill

```bash
# Global — available in all projects
cp -r output/arbitrum-skills ~/.claude/skills/

# Project-specific — only available in this project
cp -r output/arbitrum-skills .claude/skills/
```

Claude Code will automatically detect the skill from `SKILL.md` and use it when answering Arbitrum-related questions.

## Data Sources

### 1. Arbitrum Documentation

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| **Repository** | [OffchainLabs/arbitrum-docs](https://github.com/OffchainLabs/arbitrum-docs) |
| **Cloned to**  | `.repos/arbitrum-docs/`                                                     |
| **Used path**  | `docs/` subdirectory                                                        |
| **File types** | `.md`, `.mdx`                                                               |
| **Processing** | Frontmatter extraction, JSX/MDX cleanup, title extraction                   |

The docs parser ignores these directories: `node_modules`, `.git`, `partials`, `i18n`, `src`, `components` — and these files: `CONTRIBUTE.md`, `README.md`, `CONTRIBUTING.md`.

Documents shorter than 50 characters are filtered out.

**Parsed categories** (determined by top-level directory):

| Category                   | Content                                                  |
| -------------------------- | -------------------------------------------------------- |
| `stylus`                   | Stylus WASM smart contract development                   |
| `sdk`                      | Arbitrum SDK — bridgers, entities, cross-chain messaging |
| `run-arbitrum-node`        | Running full nodes, validators, sequencers               |
| `build-decentralized-apps` | dApp development — oracles, precompiles, token bridging  |
| `how-arbitrum-works`       | Technical deep-dives — BOLD, AnyTrust, gas, sequencing   |
| `launch-arbitrum-chain`    | Launching Arbitrum Orbit chains                          |
| `get-started`              | Getting started guides                                   |
| `for-devs`                 | Developer tools and frameworks                           |
| `node-running`             | Node infrastructure and operations                       |
| `arbitrum-bridge`          | Token bridging between Ethereum and Arbitrum             |
| `intro`                    | Arbitrum ecosystem introduction                          |
| `learn-more`               | Additional learning resources                            |
| `notices`                  | Important notices and announcements                      |

### 2. Smart Contract Repositories

Three repositories are cloned (shallow, `--depth 1`) and their source code is parsed:

#### OpenZeppelin Rust Contracts for Stylus

|                |                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------- |
| **Repository** | [OpenZeppelin/rust-contracts-stylus](https://github.com/OpenZeppelin/rust-contracts-stylus) |
| **Cloned to**  | `.repos/openzeppelin-stylus/`                                                               |

| Scan Path                 | Extensions     | Type   |
| ------------------------- | -------------- | ------ |
| `contracts/src`           | `.rs`          | source |
| `examples`                | `.rs`, `.toml` | source |
| `docs/modules/ROOT/pages` | `.adoc`        | doc    |

#### Stylus SDK for Rust

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| **Repository** | [OffchainLabs/stylus-sdk-rs](https://github.com/OffchainLabs/stylus-sdk-rs) |
| **Cloned to**  | `.repos/stylus-sdk/`                                                        |

| Scan Path         | Extensions     | Type   |
| ----------------- | -------------- | ------ |
| `stylus-sdk/src`  | `.rs`          | source |
| `stylus-core/src` | `.rs`          | source |
| `stylus-proc/src` | `.rs`          | source |
| `stylus-test/src` | `.rs`          | source |
| `examples`        | `.rs`, `.toml` | source |

#### Nitro Contracts (Solidity)

|                |                                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Repository** | [OffchainLabs/nitro-contracts](https://github.com/OffchainLabs/nitro-contracts) |
| **Cloned to**  | `.repos/nitro-contracts/`                                                       |

| Scan Path | Extensions | Type   |
| --------- | ---------- | ------ |
| `src`     | `.sol`     | source |
| `docs`    | `.md`      | doc    |

**Caching behavior:** After the first clone, the `.git` directory is removed to save space. On subsequent runs, the cached directory is reused without re-cloning. If a `.git` directory is detected (incomplete cleanup), the repo is re-cloned.

Source files shorter than 10 characters are filtered out.

### 3. Arbitrum MCP Tools Documentation

|                |                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Source**     | [arbitrum-ai-hub.gitbook.io](https://arbitrum-ai-hub.gitbook.io/docs/llms-full.txt) |
| **Method**     | HTTP GET (plain text)                                                                                        |
| **Written to** | `arbitrum-mcp-tools/index.md`                                                                                |

The full MCP tools documentation is fetched as a single text file from GitBook's LLM-optimized endpoint and written as-is into the skill output.

## Project Architecture

```
src/
├── index.ts             CLI entry point — arg parsing, orchestration, progress display
├── types.ts             TypeScript interfaces (ParsedDoc, RepoConfig, GeneratorConfig, etc.)
├── repo-config.ts       Repository configurations (URLs, scan paths, descriptions)
├── parser.ts            Documentation parser (Markdown/MDX → ParsedDoc)
├── source-parser.ts     Contract repo parser (clone, scan, parse → ParsedDoc)
└── skill-generator.ts   Skill file generator (tree building, SKILL.md, file writing)
```

### Core Types (`types.ts`)

```typescript
// A parsed document — the universal unit flowing through the pipeline
interface ParsedDoc {
  filePath: string; // Absolute path to source file
  relativePath: string; // Output path relative to skill dir
  title: string; // Document/file title
  content: string; // Processed Markdown content
  category: string; // Top-level category (e.g. "stylus")
  subcategories: string[]; // Nested path (e.g. ["concepts", "gas"])
  frontmatter: Record<string, unknown>; // Metadata from frontmatter or file info
}

// Configuration for a contract repository to clone and parse
interface RepoConfig {
  name: string; // Directory name (e.g. "stylus-sdk")
  repoUrl: string; // Git clone URL
  displayName: string; // Human-readable name
  description: string; // What the repo contains
  scanPaths: ScanPath[]; // Which directories and file types to scan
}

// Specifies a directory to scan within a repo
interface ScanPath {
  dir: string; // Relative to repo root
  extensions: string[]; // File extensions to include
  language: "rust" | "solidity" | "markdown" | string;
  type: "source" | "doc"; // Source code vs documentation
}
```

### Module Responsibilities

**`parser.ts`** — Handles Arbitrum documentation files:

- Recursive directory scan for `.md`/`.mdx`
- YAML frontmatter parsing (key-value extraction)
- Title extraction (frontmatter → H1 heading → filename fallback)
- MDX/JSX cleanup (removes imports, exports, JSX components, HTML comments)
- Path-based category assignment

**`source-parser.ts`** — Handles smart contract repositories:

- Git clone with `--depth 1` and 2-minute timeout
- Recursive file scanning per configured `ScanPath`
- Language detection by file extension (`.rs` → rust, `.sol` → solidity, etc.)
- Title extraction from code (`pub struct Foo`, `contract Bar`, etc.)
- AsciiDoc → Markdown conversion (headings, code blocks, links, admonitions)
- Source code wrapping in fenced code blocks

**`skill-generator.ts`** — Produces the final skill output:

- Builds hierarchical category tree from `ParsedDoc[]`
- Generates `SKILL.md` with structured index, instructions, and navigation
- Fetches MCP tools documentation from GitBook
- Writes all individual doc files to output directory
- Adds category descriptions and cross-references

**`index.ts`** — CLI orchestration:

- Argument parsing and validation
- Auto-clone of `arbitrum-docs` when no path provided
- Step-by-step progress display with colored output
- Error handling and summary reporting

## Output Structure

```
output/arbitrum-skills/
├── SKILL.md                              # Main skill file with index and instructions
├── stylus/                               # Stylus WASM development
│   ├── overview.md
│   ├── quickstart.md
│   ├── concepts/
│   ├── how-tos/
│   └── reference/
├── sdk/                                  # Arbitrum SDK
├── run-arbitrum-node/                    # Node operations
│   ├── arbos-releases/
│   ├── sequencer/
│   └── nitro/
├── build-decentralized-apps/             # dApp development
│   ├── token-bridging/
│   ├── oracles/
│   └── precompiles/
├── how-arbitrum-works/                   # Technical architecture
├── launch-arbitrum-chain/                # Orbit chains
├── smart-contracts/                      # Contract source code
│   ├── openzeppelin-stylus/
│   │   ├── contracts/src/               # Rust implementations
│   │   ├── examples/                    # Usage examples
│   │   └── docs/                        # AsciiDoc → Markdown
│   ├── stylus-sdk/
│   │   ├── stylus-sdk/src/              # Core SDK
│   │   ├── stylus-proc/src/             # Proc macros
│   │   └── stylus-test/src/             # Test framework
│   └── nitro-contracts/
│       ├── src/                         # Solidity contracts
│       └── docs/                        # Contract docs
├── arbitrum-mcp-tools/
│   └── index.md                         # MCP tools documentation
└── ...                                  # Other doc categories
```

### What's Inside `SKILL.md`

The main skill file includes:

1. **YAML frontmatter** — skill name and description
2. **Critical instructions** — tells Claude to search files rather than answer from memory
3. **Response guidelines** — formatting rules for answers
4. **Documentation index** — hierarchical listing of all docs with descriptions and file links
5. **Smart contracts section** — per-repo source code trees with links
6. **MCP tools reference** — brief tool table with link to full docs

## Configuration Reference

### Repository Configs (`repo-config.ts`)

To modify which repositories are cloned and parsed, edit the `REPO_CONFIGS` array. Each entry is a `RepoConfig` object:

```typescript
{
  name: 'my-repo',                    // Directory name under .repos/
  repoUrl: 'https://github.com/...',  // Git URL
  displayName: 'My Repository',       // Shown in logs and SKILL.md
  description: 'What this repo is',   // Used in SKILL.md
  scanPaths: [
    { dir: 'src', extensions: ['.rs'], language: 'rust', type: 'source' },
    { dir: 'docs', extensions: ['.md'], language: 'markdown', type: 'doc' },
  ],
}
```

### `DOCS_REPO_CONFIG`

Separate config for the documentation repo. Has empty `scanPaths` because docs parsing is handled by `parser.ts` (different pipeline from `source-parser.ts`).

### Category Descriptions (`skill-generator.ts`)

The `CATEGORY_DESCRIPTIONS` map in `skill-generator.ts` provides descriptions shown in `SKILL.md`. If a new category appears in the docs, add a description here for better indexing.

### Ignored Paths

| Parser                         | Ignored Directories                                                    | Ignored Files                                   |
| ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `parser.ts` (docs)             | `node_modules`, `.git`, `partials`, `i18n`, `src`, `components`        | `CONTRIBUTE.md`, `README.md`, `CONTRIBUTING.md` |
| `source-parser.ts` (contracts) | `target`, `node_modules`, `.git`, `out`, `cache`, `artifacts`, `build` | —                                               |

## Adding a New Contract Repository

1. Add a new entry to `REPO_CONFIGS` in `src/repo-config.ts`:

```typescript
{
  name: 'my-new-repo',
  repoUrl: 'https://github.com/org/repo.git',
  displayName: 'My New Repository',
  description: 'Description for SKILL.md',
  scanPaths: [
    { dir: 'src', extensions: ['.rs'], language: 'rust', type: 'source' },
  ],
}
```

2. Run `npm run generate` — the new repo will be cloned and its files included automatically.

No other files need modification. The source parser, skill generator, and SKILL.md template all work dynamically from the `REPO_CONFIGS` array.

## License

MIT
