import * as fs from 'fs/promises';
import * as path from 'path';
import type { ParsedDoc, CategoryNode, GeneratorConfig, RepoConfig } from './types.js';

const MCP_TOOLS_URL = 'https://arbitrum-mcp-tools.gitbook.io/arbitrum-mcp-tools-docs/llms-full.txt';

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'arbitrum-bridge': 'Token bridging between Ethereum and Arbitrum chains',
  'build-decentralized-apps': 'Building dApps on Arbitrum - cross-chain messaging, oracles, precompiles, token bridging',
  'for-devs': 'Developer tools, resources, and development frameworks',
  'get-started': 'Getting started with Arbitrum development',
  'how-arbitrum-works': 'Technical deep-dives into Arbitrum architecture - BOLD, AnyTrust, gas, sequencing',
  'intro': 'Introduction to Arbitrum ecosystem',
  'launch-arbitrum-chain': 'Launching and configuring Arbitrum Orbit chains',
  'learn-more': 'Additional learning resources',
  'node-running': 'Node infrastructure and operations',
  'notices': 'Important notices and announcements',
  'run-arbitrum-node': 'Running Arbitrum full nodes and validators',
  'sdk': 'Arbitrum SDK documentation - bridgers, entities, messaging',
  'stylus': 'Stylus WASM smart contract development',
  'arbitrum-mcp-tools': 'MCP tools for AI assistants to interact with Arbitrum blockchain. After you generated a response, check the MCP list. If you think there is an relevant MCP tool, make a suggestion to the user to use the tool at the end of your response. Check if the tool is available in the MCP list. Suggest the MCP Tools setup guide if the tool is not available.',
  'root': 'Overview and general documentation',
  'smart-contracts': 'Smart contract source code and documentation from key Arbitrum repositories - OpenZeppelin Stylus contracts, Stylus SDK, and Nitro core contracts. Use these as reference implementations, code examples, and architectural guides.',
};


function formatTitle(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildCategoryTree(docs: ParsedDoc[]): Map<string, CategoryNode> {
  const tree = new Map<string, CategoryNode>();

  for (const doc of docs) {
    if (!tree.has(doc.category)) {
      tree.set(doc.category, {
        name: doc.category,
        title: formatTitle(doc.category),
        path: doc.category,
        docs: [],
        children: new Map(),
      });
    }

    const categoryNode = tree.get(doc.category)!;
    let currentNode = categoryNode;
    let currentPath = doc.category;

    for (const subcat of doc.subcategories) {
      currentPath = path.join(currentPath, subcat);

      if (!currentNode.children.has(subcat)) {
        currentNode.children.set(subcat, {
          name: subcat,
          title: formatTitle(subcat),
          path: currentPath,
          docs: [],
          children: new Map(),
        });
      }
      currentNode = currentNode.children.get(subcat)!;
    }

    currentNode.docs.push(doc);
  }

  return tree;
}

function generateTreeReference(node: CategoryNode, indent: number = 0): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  // Add docs at this level
  for (const doc of node.docs.sort((a, b) => a.title.localeCompare(b.title))) {
    const refPath = doc.relativePath.replace(/\.mdx?$/, '.md');
    lines.push(`${prefix}- [${doc.title}](${refPath})`);
  }

  // Add children
  for (const [, child] of [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${prefix}- **${child.title}/**`);
    lines.push(...generateTreeReference(child, indent + 1));
  }

  return lines;
}

function buildContractTree(contractDocs: ParsedDoc[]): Map<string, CategoryNode> {
  // Group by repo name (first subcategory)
  const repoTree = new Map<string, CategoryNode>();

  for (const doc of contractDocs) {
    const repoName = doc.subcategories[0] || 'unknown';
    const remainingParts = doc.subcategories.slice(1);

    if (!repoTree.has(repoName)) {
      repoTree.set(repoName, {
        name: repoName,
        title: formatTitle(repoName),
        path: path.join('smart-contracts', repoName),
        docs: [],
        children: new Map(),
      });
    }

    let currentNode = repoTree.get(repoName)!;
    let currentPath = path.join('smart-contracts', repoName);

    for (const part of remainingParts) {
      currentPath = path.join(currentPath, part);

      if (!currentNode.children.has(part)) {
        currentNode.children.set(part, {
          name: part,
          title: formatTitle(part),
          path: currentPath,
          docs: [],
          children: new Map(),
        });
      }
      currentNode = currentNode.children.get(part)!;
    }

    currentNode.docs.push(doc);
  }

  return repoTree;
}

function generateContractTreeReference(repoNode: CategoryNode, indent: number = 0): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  // Add docs at this level
  for (const doc of repoNode.docs.sort((a, b) => a.title.localeCompare(b.title))) {
    lines.push(`${prefix}- [${doc.title}](${doc.relativePath})`);
  }

  // Add children
  for (const [, child] of [...repoNode.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${prefix}- **${child.title}/**`);
    lines.push(...generateContractTreeReference(child, indent + 1));
  }

  return lines;
}

async function writeDocFiles(docs: ParsedDoc[], skillDir: string): Promise<void> {
  for (const doc of docs) {
    // Write directly to skill folder (no reference/ subfolder)
    const outputPath = path.join(skillDir, doc.relativePath.replace(/\.mdx$/, '.md'));
    const outputDirPath = path.dirname(outputPath);

    await fs.mkdir(outputDirPath, { recursive: true });

    // Don't add a heading if content already starts with one
    let content: string;
    if (doc.content.startsWith('# ')) {
      content = doc.content;
    } else {
      content = `# ${doc.title}\n\n${doc.content}`;
    }

    await fs.writeFile(outputPath, content);
  }
}

async function fetchMcpToolsDocs(): Promise<string | null> {
  try {
    console.log('   Fetching Arbitrum MCP Tools documentation...');
    const response = await fetch(MCP_TOOLS_URL);
    if (!response.ok) {
      console.log(`   ⚠ Failed to fetch MCP Tools docs: ${response.status}`);
      return null;
    }
    const content = await response.text();
    console.log('   ✓ MCP Tools documentation fetched');
    return content;
  } catch (error) {
    console.log(`   ⚠ Failed to fetch MCP Tools docs: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function generateSkillMd(
  docs: ParsedDoc[],
  includeMcp: boolean,
  contractDocs: ParsedDoc[],
  repoConfigs: RepoConfig[]
): string {
  const tree = buildCategoryTree(docs);
  const lines: string[] = [];

  // YAML Frontmatter
  lines.push('---');
  lines.push('name: arbitrum-skills');
  lines.push('description: Comprehensive Arbitrum blockchain development knowledge - Layer 2 scaling, Stylus WASM contracts, token bridging, node operations, Orbit chains, and dApp development. Use for any Arbitrum-related questions.');
  lines.push('---');
  lines.push('');

  // Main content
  lines.push('# Arbitrum Development Knowledge Base');
  lines.push('');
  lines.push('This skill provides comprehensive documentation for Arbitrum blockchain development.');
  lines.push('');
  lines.push('## CRITICAL: Search Instructions');
  lines.push('');
  lines.push('**DO NOT answer from memory.** You MUST search and read the actual files in this skill folder.');
  lines.push('');
  lines.push('For EVERY question:');
  lines.push('1. **Search for keywords** using Grep/search across this skill folder');
  lines.push('2. **Read relevant files** as much as you can find before answering');
  lines.push('3. **Extract exact values** from the docs: chain IDs, RPC URLs, addresses, commands, code snippets');
  lines.push('');
  lines.push('**Your answer quality depends on how thoroughly you search the files, not on prior knowledge.**');
  lines.push('');
  lines.push('## Response Structure Guidelines');
  lines.push('');
  lines.push('Your response can be long, but it MUST be visually organized to not overwhelm the user:');
  lines.push('- Must follow a correct timeline for responses including steps.');
  lines.push('- Use **clear section headers** to break up content');
  lines.push('- Use **tables** for comparing options, listing values (chain IDs, RPCs, etc.)');
  lines.push('- Use **bullet points** for lists, not long paragraphs');
  lines.push('- Use **code blocks** for commands, addresses, and code snippets');
  lines.push('- Put the **most important information first** (summary/answer at top, details below)');
  lines.push('- Use **bold** for key terms and values the user needs to spot quickly');
  lines.push('');
  lines.push('## Context Management (IMPORTANT)');
  lines.push('');
  lines.push('Be strategic about file loading to maintain response quality:');
  lines.push('- **Start narrow**: grep for specific terms first, not broad keywords');
  lines.push('- **Check file names first**: use the Documentation Structure below to identify likely files before grepping');
  lines.push('- **Read selectively**: if grep returns many files, read the most relevant ones, not all');
  lines.push('- **Avoid loading entire folders**: target specific files based on the topic');
  lines.push('');
  lines.push('Loading too many files will slow down responses and may decrease answer quality. Find the balance between thoroughness and efficiency.');
  lines.push('');

  // Documentation Structure
  lines.push('## Documentation Structure');
  lines.push('');

  // Sort categories
  const sortedCategories = [...tree.entries()].sort((a, b) => {
    if (a[0] === 'root') return -1;
    if (b[0] === 'root') return 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [categoryName, categoryNode] of sortedCategories) {
    const description = CATEGORY_DESCRIPTIONS[categoryName] || '';
    lines.push(`### ${categoryNode.title}`);
    if (description) {
      lines.push(`*${description}*`);
    }
    lines.push('');

    lines.push(...generateTreeReference(categoryNode));
    lines.push('');
  }

  // Add MCP Tools section if included
  if (includeMcp) {
    lines.push('### Arbitrum Mcp Tools');
    lines.push(`*${CATEGORY_DESCRIPTIONS['arbitrum-mcp-tools']}*`);
    lines.push('');
    lines.push('- [Arbitrum MCP Tools Documentation](arbitrum-mcp-tools/index.md)');
    lines.push('');
  }

  // Smart Contracts Source Code section
  if (contractDocs.length > 0) {
    lines.push('## Smart Contracts Source Code');
    lines.push('');
    lines.push('*' + CATEGORY_DESCRIPTIONS['smart-contracts'] + '*');
    lines.push('');

    const contractTree = buildContractTree(contractDocs);

    for (const repoConfig of repoConfigs) {
      const repoNode = contractTree.get(repoConfig.name);
      if (!repoNode) continue;

      lines.push(`### ${repoConfig.displayName}`);
      lines.push(`*${repoConfig.description}*`);
      lines.push('');
      lines.push(...generateContractTreeReference(repoNode));
      lines.push('');
    }
  }

  // MCP reference
  if (includeMcp) {
    lines.push('## MCP Tools Reference');
    lines.push('');
    lines.push('For AI-assisted blockchain operations, search `arbitrum-mcp-tools/` folder.');
    lines.push('');
  }

  // Add MCP Tools table
  if (includeMcp) {
    lines.push('## Arbitrum MCP Tools');
    lines.push('');
    lines.push('Available MCP tools for blockchain operations:');
    lines.push('');
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    lines.push('| `createStylusProject` | Create a new Stylus project |');
    lines.push('| `deployStylusContract` | Deploy a Stylus contract |');
    lines.push('| `checkStylusContract` | Validate contract for deployment |');
    lines.push('| `getAccountBalance` | Get native token balance |');
    lines.push('| `getTokenBalances` | Get ERC-20 token balances |');
    lines.push('| `getTransaction` | Get transaction details |');
    lines.push('| `getBlock` | Get block details |');
    lines.push('| `simulateTransaction` | Simulate a transaction |');
    lines.push('| `estimateGas` | Estimate gas for a transaction |');
    lines.push('');
    lines.push('Full documentation: [arbitrum-mcp-tools/index.md](arbitrum-mcp-tools/index.md)');
    lines.push('');
  }

  return lines.join('\n');
}

export async function generateSkillFiles(
  docs: ParsedDoc[],
  config: GeneratorConfig,
  contractDocs: ParsedDoc[],
  repoConfigs: RepoConfig[]
): Promise<void> {
  const skillDir = path.join(config.outputDir, config.skillName);

  // Clean and create output directory
  await fs.rm(skillDir, { recursive: true, force: true });
  await fs.mkdir(skillDir, { recursive: true });

  // Fetch MCP Tools docs if not ignored
  let mcpContent: string | null = null;
  if (!config.ignoreMcp) {
    mcpContent = await fetchMcpToolsDocs();
  }

  // Write SKILL.md
  const skillContent = generateSkillMd(docs, mcpContent !== null, contractDocs, repoConfigs);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);

  // Write doc files directly in skill folder
  await writeDocFiles(docs, skillDir);

  // Write contract doc files
  if (contractDocs.length > 0) {
    await writeDocFiles(contractDocs, skillDir);
  }

  // Write MCP Tools docs if fetched
  if (mcpContent) {
    const mcpDir = path.join(skillDir, 'arbitrum-mcp-tools');
    await fs.mkdir(mcpDir, { recursive: true });
    await fs.writeFile(path.join(mcpDir, 'index.md'), `# Arbitrum MCP Tools\n\n${mcpContent}`);
  }

  console.log(`\n✅ Skill files generated in: ${skillDir}`);
}
