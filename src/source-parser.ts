import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import type { ParsedDoc, RepoConfig, ScanPath } from './types.js';

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = ['target', 'node_modules', '.git', 'out', 'cache', 'artifacts', 'build'];

// Files that add no learning value to the skill knowledge base
const SKIP_FILENAMES = new Set([
  'rust-toolchain.toml',
  'Stylus.toml',
]);

// Directory paths containing test/mock files (matched against relative path from repo root)
const SKIP_DIR_PATTERNS = [
  /\/mocks\//,        // nitro-contracts/src/mocks/
  /\/test-helpers\//,  // nitro-contracts/src/test-helpers/
];

// Filename patterns for test files
const SKIP_FILE_PATTERNS = [
  /integration_test\.rs$/,  // stylus-sdk examples integration tests
  /^test_/i,                // test_ prefixed files
];

/**
 * Check if a file should be skipped based on filename and path patterns.
 * Filters out: config boilerplate, mock/test contracts, integration tests.
 */
function shouldSkipFile(relativeToRepo: string): boolean {
  const basename = path.basename(relativeToRepo);

  // Skip known boilerplate filenames
  if (SKIP_FILENAMES.has(basename)) return true;

  // Skip files in test/mock directories
  for (const pattern of SKIP_DIR_PATTERNS) {
    if (pattern.test(relativeToRepo)) return true;
  }

  // Skip test file patterns
  for (const pattern of SKIP_FILE_PATTERNS) {
    if (pattern.test(basename)) return true;
  }

  return false;
}

/**
 * Check if a Cargo.toml file is just boilerplate (no meaningful learning content).
 * Keeps Cargo.toml files that contain useful documentation or complex workspace configs.
 */
function isBoilerplateCargo(content: string): boolean {
  // If it has fewer than 30 lines, it's likely just a basic manifest
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  return lines.length < 30;
}

/**
 * Check if a mod.rs file only contains `pub mod` / `mod` re-exports with no logic.
 */
function isModReexportOnly(content: string): boolean {
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#'));

  if (lines.length === 0) return true;

  // Every non-empty, non-comment line should be a mod declaration or use statement
  return lines.every(l =>
    /^(pub\s+)?mod\s+\w+;$/.test(l) ||
    /^(pub\s+)?use\s+/.test(l) ||
    /^(pub\s+)?extern\s+crate\s+/.test(l)
  );
}

export async function cloneOrUpdateRepo(config: RepoConfig, contractsDir: string): Promise<string> {
  const repoDir = path.join(contractsDir, config.name);
  const gitDir = path.join(repoDir, '.git');

  try {
    await fs.stat(gitDir);
    // .git exists — re-clone to update
    console.log(chalk.yellow(`   Re-cloning ${chalk.cyan(config.name)}...`));
    await fs.rm(repoDir, { recursive: true, force: true });
    await fs.mkdir(contractsDir, { recursive: true });
    await execFileAsync('git', ['clone', '--depth', '1', config.repoUrl, repoDir], { timeout: 120000 });
    await fs.rm(gitDir, { recursive: true, force: true });
  } catch {
    try {
      // Check if directory exists without .git (already cleaned)
      await fs.stat(repoDir);
      console.log(chalk.dim(`   Using cached ${chalk.cyan(config.name)}`));
    } catch {
      // Fresh clone
      console.log(chalk.yellow(`   Cloning ${chalk.cyan(config.name)}...`));
      await fs.mkdir(contractsDir, { recursive: true });
      await execFileAsync('git', ['clone', '--depth', '1', config.repoUrl, repoDir], { timeout: 120000 });
      await fs.rm(gitDir, { recursive: true, force: true });
    }
  }

  return repoDir;
}

export async function findSourceFiles(baseDir: string, scanPath: ScanPath): Promise<string[]> {
  const fullDir = path.join(baseDir, scanPath.dir);
  const files: string[] = [];

  async function scanDir(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
          await scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (scanPath.extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDir(fullDir);
  return files.sort();
}

export function getLanguageForFile(filePath: string, defaultLang: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.rs': 'rust',
    '.sol': 'solidity',
    '.toml': 'toml',
    '.json': 'json',
    '.md': 'markdown',
    '.adoc': 'asciidoc',
  };
  return langMap[ext] || defaultLang;
}

export function extractTitleFromSource(filePath: string, content: string, language: string): string {
  if (language === 'rust') {
    // Look for pub struct/trait/enum/mod
    const rustMatch = content.match(/pub\s+(?:struct|trait|enum|mod)\s+(\w+)/);
    if (rustMatch) {
      return rustMatch[1];
    }
  } else if (language === 'solidity') {
    // Look for contract/interface/library
    const solMatch = content.match(/(?:contract|interface|library)\s+(\w+)/);
    if (solMatch) {
      return solMatch[1];
    }
  }

  // Fallback: use filename
  const basename = path.basename(filePath, path.extname(filePath));
  return basename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function convertAdocToMarkdown(content: string): string {
  let md = content;

  // Convert AsciiDoc headings (= Title) to Markdown (# Title)
  md = md.replace(/^=====\s+(.+)$/gm, '##### $1');
  md = md.replace(/^====\s+(.+)$/gm, '#### $1');
  md = md.replace(/^===\s+(.+)$/gm, '### $1');
  md = md.replace(/^==\s+(.+)$/gm, '## $1');
  md = md.replace(/^=\s+(.+)$/gm, '# $1');

  // Convert code blocks: [source,lang] ---- ... ---- to ```lang ... ```
  md = md.replace(/\[source,\s*(\w+)\]\s*\n----\n([\s\S]*?)----/g, '```$1\n$2```');

  // Convert plain ---- code blocks
  md = md.replace(/----\n([\s\S]*?)----/g, '```\n$1```');

  // Convert bold: *text* to **text** (only single asterisks not already doubled)
  // Be careful not to convert list items
  md = md.replace(/(?<!\*)\*([^\s*][^*]*[^\s*])\*(?!\*)/g, '**$1**');

  // Convert italic: _text_ to *text*
  md = md.replace(/(?<![a-zA-Z0-9])_([^\s_][^_]*[^\s_])_(?![a-zA-Z0-9])/g, '*$1*');

  // Convert links: link:url[text] to [text](url)
  md = md.replace(/link:([^\[]+)\[([^\]]*)\]/g, '[$2]($1)');

  // Convert xref: xref:file.adoc[text] to [text](file.md)
  md = md.replace(/xref:([^\[]+)\.adoc\[([^\]]*)\]/g, '[$2]($1.md)');

  // Convert images: image::url[alt] to ![alt](url)
  md = md.replace(/image::([^\[]+)\[([^\]]*)\]/g, '![$2]($1)');

  // Convert admonitions
  md = md.replace(/^NOTE:\s*(.+)$/gm, '> **Note:** $1');
  md = md.replace(/^TIP:\s*(.+)$/gm, '> **Tip:** $1');
  md = md.replace(/^IMPORTANT:\s*(.+)$/gm, '> **Important:** $1');
  md = md.replace(/^WARNING:\s*(.+)$/gm, '> **Warning:** $1');
  md = md.replace(/^CAUTION:\s*(.+)$/gm, '> **Caution:** $1');

  // Convert include directives to comments (can't resolve)
  md = md.replace(/^include::(.+)\[.*\]$/gm, '<!-- include: $1 -->');

  // Convert attributes
  md = md.replace(/^:([a-zA-Z-]+):\s*(.*)$/gm, '<!-- :$1: $2 -->');

  // Clean up excessive whitespace
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

function extractTitleFromAdoc(content: string): string | null {
  const match = content.match(/^=\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractTitleFromMd(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function parseSourceFile(
  filePath: string,
  repoDir: string,
  config: RepoConfig,
  scanPath: ScanPath
): ParsedDoc {
  const fileContent = '';
  const relativeToRepo = path.relative(repoDir, filePath);
  const ext = path.extname(filePath).toLowerCase();
  const lang = getLanguageForFile(filePath, scanPath.language);

  // Build relative path for output
  const outputRelPath = path.join('smart-contracts', config.name, relativeToRepo.replace(/\.[^.]+$/, '.md'));

  // Build subcategories from directory parts
  const dirParts = path.dirname(relativeToRepo).split(path.sep).filter(Boolean);

  return {
    filePath,
    relativePath: outputRelPath,
    title: '', // Will be set after reading content
    content: '', // Will be set after reading content
    category: 'smart-contracts',
    subcategories: [config.name, ...dirParts],
    frontmatter: {
      repo: config.name,
      language: lang,
      type: scanPath.type,
      extension: ext,
    },
  };
}

export async function parseRepo(
  config: RepoConfig,
  contractsDir: string,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<ParsedDoc[]> {
  const repoDir = await cloneOrUpdateRepo(config, contractsDir);
  const docs: ParsedDoc[] = [];
  const allFiles: { file: string; scanPath: ScanPath }[] = [];

  // Collect all files from all scan paths
  for (const scanPath of config.scanPaths) {
    const files = await findSourceFiles(repoDir, scanPath);
    for (const file of files) {
      allFiles.push({ file, scanPath });
    }
  }

  // Parse each file
  let skipped = 0;
  for (let i = 0; i < allFiles.length; i++) {
    const { file, scanPath } = allFiles[i];
    const relativeToRepo = path.relative(repoDir, file);
    onProgress?.(i + 1, allFiles.length, relativeToRepo);

    // Path/filename-based skip
    if (shouldSkipFile(relativeToRepo)) {
      skipped++;
      continue;
    }

    try {
      const content = await fs.readFile(file, 'utf-8');
      if (content.trim().length < 10) continue;

      const ext = path.extname(file).toLowerCase();
      const lang = getLanguageForFile(file, scanPath.language);
      const basename = path.basename(file);

      // Content-based filtering for specific file types
      if (basename === 'Cargo.toml' && isBoilerplateCargo(content)) {
        skipped++;
        continue;
      }
      if (basename === 'mod.rs' && isModReexportOnly(content)) {
        skipped++;
        continue;
      }
      const outputRelPath = path.join('smart-contracts', config.name, relativeToRepo.replace(/\.[^.]+$/, '.md'));
      const dirParts = path.dirname(relativeToRepo).split(path.sep).filter(Boolean);

      let title: string;
      let processedContent: string;

      if (scanPath.type === 'doc') {
        if (ext === '.adoc') {
          title = extractTitleFromAdoc(content) || extractTitleFromSource(file, content, lang);
          processedContent = convertAdocToMarkdown(content);
        } else {
          // .md doc files
          title = extractTitleFromMd(content) || extractTitleFromSource(file, content, lang);
          processedContent = content;
        }
      } else {
        // Source code files - wrap in code block
        title = extractTitleFromSource(file, content, lang);
        const effectiveLang = getLanguageForFile(file, scanPath.language);
        processedContent = `\`\`\`${effectiveLang}\n${content}\n\`\`\``;
      }

      docs.push({
        filePath: file,
        relativePath: outputRelPath,
        title,
        content: processedContent,
        category: 'smart-contracts',
        subcategories: [config.name, ...dirParts],
        frontmatter: {
          repo: config.name,
          language: lang,
          type: scanPath.type,
          extension: ext,
        },
      });
    } catch (error) {
      console.error(chalk.yellow(`   ⚠ Failed to parse ${file}:`), chalk.dim(error instanceof Error ? error.message : String(error)));
    }
  }

  if (skipped > 0) {
    console.log(chalk.dim(`\n   Filtered ${skipped} files (boilerplate, tests, mocks)`));
  }

  return docs;
}

export async function parseAllRepos(
  configs: RepoConfig[],
  contractsDir: string,
  onProgress?: (repo: string, current: number, total: number, file: string) => void
): Promise<ParsedDoc[]> {
  const allDocs: ParsedDoc[] = [];

  for (const config of configs) {
    console.log(`\n   ${chalk.bold.cyan(`[${config.name}]`)} ${chalk.white(config.displayName)}`);
    try {
      const docs = await parseRepo(config, contractsDir, (current, total, file) => {
        onProgress?.(config.name, current, total, file);
      });
      allDocs.push(...docs);
      console.log(chalk.green(`\n   ✓ ${config.name}: ${docs.length} files parsed`));
    } catch (error) {
      console.log(chalk.red(`\n   ✗ ${config.name}: Failed - ${error instanceof Error ? error.message : error}`));
    }
  }

  return allDocs;
}
