import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import type { ParsedDoc } from './types.js';

const IGNORED_DIRS = ['node_modules', '.git', 'partials', 'i18n', 'src', 'components'];
const IGNORED_FILES = ['CONTRIBUTE.md', 'README.md', 'CONTRIBUTING.md'];
const DOC_EXTENSIONS = ['.md', '.mdx'];

export async function findAllDocs(docsPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scanDir(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
          await scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (DOC_EXTENSIONS.includes(ext) && !IGNORED_FILES.includes(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scanDir(docsPath);
  return files.sort();
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);

  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterStr.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: string | number | boolean = line.slice(colonIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(Number(value)) && value !== '') value = Number(value);

      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

function extractTitle(content: string, frontmatter: Record<string, unknown>, filePath: string): string {
  if (frontmatter.title && typeof frontmatter.title === 'string') {
    return frontmatter.title;
  }

  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  const filename = path.basename(filePath, path.extname(filePath));
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanMdxContent(content: string): string {
  let cleaned = content;

  // Remove import statements
  cleaned = cleaned.replace(/^import\s+.*?(?:from\s+['"].*?['"])?;?\s*$/gm, '');

  // Remove export statements (but keep content)
  cleaned = cleaned.replace(/^export\s+(?!default).*?$/gm, '');

  // Remove self-closing JSX tags
  cleaned = cleaned.replace(/<[A-Z][a-zA-Z]*\s*\/>/g, '');

  // Remove JSX component wrappers but keep content
  cleaned = cleaned.replace(/<([A-Z][a-zA-Z]*)[^>]*>([\s\S]*?)<\/\1>/g, (_, _tag, innerContent) => {
    return innerContent.trim();
  });

  // Remove remaining JSX tags
  cleaned = cleaned.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Clean up HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function getPathParts(relativePath: string): { category: string; subcategories: string[] } {
  const parts = relativePath.split(path.sep).filter(Boolean);

  // Remove the filename from parts
  parts.pop();

  if (parts.length === 0) {
    return { category: 'root', subcategories: [] };
  }

  const category = parts[0];
  const subcategories = parts.slice(1);

  return { category, subcategories };
}

export async function parseDoc(filePath: string, docsPath: string): Promise<ParsedDoc> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(docsPath, filePath);

  const { frontmatter, body } = parseFrontmatter(content);
  const title = extractTitle(body, frontmatter, filePath);
  const cleanedContent = cleanMdxContent(body);
  const { category, subcategories } = getPathParts(relativePath);

  return {
    filePath,
    relativePath,
    title,
    content: cleanedContent,
    category,
    subcategories,
    frontmatter,
  };
}

export async function parseAllDocs(
  docsPath: string,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<ParsedDoc[]> {
  const files = await findAllDocs(docsPath);
  const docs: ParsedDoc[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, path.relative(docsPath, file));

    try {
      const doc = await parseDoc(file, docsPath);
      if (doc.content.length > 50) {
        docs.push(doc);
      }
    } catch (error) {
      console.error(chalk.yellow(`   ⚠ Failed to parse ${file}:`), chalk.dim(error instanceof Error ? error.message : String(error)));
    }
  }

  return docs;
}
