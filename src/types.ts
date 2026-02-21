export interface ParsedDoc {
  filePath: string;
  relativePath: string;
  title: string;
  content: string;
  category: string;
  subcategories: string[];
  frontmatter: Record<string, unknown>;
}

export interface CategoryNode {
  name: string;
  title: string;
  path: string;
  docs: ParsedDoc[];
  children: Map<string, CategoryNode>;
}

export interface ScanPath {
  dir: string;
  extensions: string[];
  language: string;
  type: 'source' | 'doc';
}

export interface RepoConfig {
  name: string;
  repoUrl: string;
  displayName: string;
  description: string;
  scanPaths: ScanPath[];
}

export interface GeneratorConfig {
  docsPath: string;
  outputDir: string;
  skillName: string;
  ignoreMcp: boolean;
  ignoreContracts: boolean;
  contractsDir: string;
}
