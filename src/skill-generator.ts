import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import type { ParsedDoc, CategoryNode, GeneratorConfig, RepoConfig } from './types.js';

const MCP_TOOLS_URL = 'https://arbitrum-ai-hub.gitbook.io/docs/llms-full.txt';

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
  'arbitrum-mcp-tools': 'MCP tools for AI assistants to interact with Arbitrum blockchain',
  'root': 'Overview and general documentation',
  'smart-contracts': 'Smart contract source code and documentation from key Arbitrum repositories',
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

  for (const doc of node.docs.sort((a, b) => a.title.localeCompare(b.title))) {
    const refPath = doc.relativePath.replace(/\.mdx?$/, '.md');
    lines.push(`${prefix}- [${doc.title}](${refPath})`);
  }

  for (const [, child] of [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${prefix}- **${child.title}/**`);
    lines.push(...generateTreeReference(child, indent + 1));
  }

  return lines;
}

function buildContractTree(contractDocs: ParsedDoc[]): Map<string, CategoryNode> {
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

  for (const doc of repoNode.docs.sort((a, b) => a.title.localeCompare(b.title))) {
    lines.push(`${prefix}- [${doc.title}](${doc.relativePath})`);
  }

  for (const [, child] of [...repoNode.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${prefix}- **${child.title}/**`);
    lines.push(...generateContractTreeReference(child, indent + 1));
  }

  return lines;
}

// Count total docs in a category node (including children)
function countDocs(node: CategoryNode): number {
  let count = node.docs.length;
  for (const [, child] of node.children) {
    count += countDocs(child);
  }
  return count;
}

// Get top-level subcategory names for a category
function getSubcategoryNames(node: CategoryNode): string[] {
  return [...node.children.keys()].sort().map(formatTitle);
}

// ============================================================================
// NAV FILE GENERATORS (Progressive Disclosure)
// ============================================================================

function generateNavDocs(docs: ParsedDoc[], includeMcp: boolean): string {
  const tree = buildCategoryTree(docs);
  const lines: string[] = [];

  lines.push('# Documentation File Index');
  lines.push('');
  lines.push('Complete file listing for all Arbitrum documentation. Use this to find specific files by topic.');
  lines.push('');

  const sortedCategories = [...tree.entries()].sort((a, b) => {
    if (a[0] === 'root') return -1;
    if (b[0] === 'root') return 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [categoryName, categoryNode] of sortedCategories) {
    const description = CATEGORY_DESCRIPTIONS[categoryName] || '';
    lines.push(`## ${categoryNode.title}`);
    if (description) {
      lines.push(`*${description}*`);
    }
    lines.push('');
    lines.push(...generateTreeReference(categoryNode));
    lines.push('');
  }

  if (includeMcp) {
    lines.push('## Arbitrum MCP Tools');
    lines.push(`*${CATEGORY_DESCRIPTIONS['arbitrum-mcp-tools']}*`);
    lines.push('');
    lines.push('- [Arbitrum MCP Tools Documentation](arbitrum-mcp-tools/index.md)');
    lines.push('');
  }

  return lines.join('\n');
}

function generateNavContracts(
  contractDocs: ParsedDoc[],
  repoConfig: RepoConfig
): string {
  const contractTree = buildContractTree(contractDocs);
  const repoNode = contractTree.get(repoConfig.name);
  if (!repoNode) return '';

  const lines: string[] = [];

  lines.push(`# ${repoConfig.displayName}`);
  lines.push('');
  lines.push(`*${repoConfig.description}*`);
  lines.push('');

  // Add table of contents for large files
  const topDirs = [...repoNode.children.keys()].sort();
  if (topDirs.length > 0) {
    lines.push('## Contents');
    for (const dir of topDirs) {
      const child = repoNode.children.get(dir)!;
      lines.push(`- ${child.title}`);
    }
    lines.push('');
  }

  lines.push('## File Index');
  lines.push('');
  lines.push(...generateContractTreeReference(repoNode));
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// MAIN SKILL.MD GENERATOR (Concise, <500 lines)
// ============================================================================

function generateSkillMd(
  docs: ParsedDoc[],
  includeMcp: boolean,
  contractDocs: ParsedDoc[],
  repoConfigs: RepoConfig[]
): string {
  const tree = buildCategoryTree(docs);
  const lines: string[] = [];

  // --- YAML Frontmatter (improved description with trigger keywords) ---
  lines.push('---');
  lines.push('name: arbitrum-skills');
  lines.push('description: Provides Arbitrum L2 blockchain development documentation including Stylus WASM smart contracts (Rust), token bridging (ETH, ERC-20, USDC), Orbit chain deployment, node operations (full node, validator, sequencer), gas estimation, cross-chain messaging, BoLD protocol, Timeboost, ArbOS upgrades, and OpenZeppelin/Nitro contract references. Use when the user mentions Arbitrum, Stylus, Orbit, Nitro, ArbOS, or L2 scaling.');
  lines.push('---');
  lines.push('');

  // --- Title ---
  lines.push('# Arbitrum Development Knowledge Base');
  lines.push('');

  // --- Search Instructions (concise) ---
  lines.push('## Search Instructions');
  lines.push('');
  lines.push('Always search and read files in this skill folder before answering. Do not rely on prior knowledge.');
  lines.push('Extract exact values (chain IDs, RPC URLs, addresses, commands, code) from the docs.');
  lines.push('');
  lines.push('**Context management:** Start with narrow grep searches. Use the topic navigation below to identify target files before searching. Read selectively — avoid loading entire folders.');
  lines.push('');

  // --- Response Guidelines (concise) ---
  lines.push('## Response Guidelines');
  lines.push('');
  lines.push('- Use **section headers**, **tables**, **bullet points**, and **code blocks** for clarity');
  lines.push('- Put the most important information first (answer at top, details below)');
  lines.push('- Follow correct step order for procedural responses');
  lines.push('- Use **bold** for key values the user needs to spot quickly');
  lines.push('');

  // --- Decision Guide ---
  lines.push('## Decision Guide');
  lines.push('');
  lines.push('Route to the right files based on what the user needs:');
  lines.push('');
  lines.push('| User wants to... | Start with |');
  lines.push('|---|---|');
  lines.push('| **Write a Solidity smart contract** | `build-decentralized-apps/01-quickstart-solidity-remix.md` |');
  lines.push('| **Write a Rust/Stylus contract** | `stylus/quickstart.md`, then `stylus/overview.md` |');
  lines.push('| **Bridge tokens (ETH/ERC-20)** | `arbitrum-bridge/01-quickstart.md` |');
  lines.push('| **Bridge tokens programmatically** | `build-decentralized-apps/token-bridging/bridge-tokens-programmatically/01-get-started.md` |');
  lines.push('| **Bridge USDC** | `arbitrum-bridge/02-usdc-arbitrum-one.md` |');
  lines.push('| **Run a full node** | `run-arbitrum-node/02-run-full-node.md` |');
  lines.push('| **Run a validator** | `run-arbitrum-node/more-types/02-run-validator-node.md` |');
  lines.push('| **Run an archive node** | `run-arbitrum-node/more-types/01-run-archive-node.md` |');
  lines.push('| **Launch an Orbit chain** | `launch-arbitrum-chain/01-a-gentle-introduction.md` |');
  lines.push('| **Deploy an Orbit chain** | `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md` |');
  lines.push('| **Estimate gas** | `build-decentralized-apps/02-how-to-estimate-gas.md` |');
  lines.push('| **Understand Arbitrum architecture** | `how-arbitrum-works/01-inside-arbitrum-nitro.md` |');
  lines.push('| **Use cross-chain messaging** | `build-decentralized-apps/04-cross-chain-messaging.md` |');
  lines.push('| **Get chain IDs / RPC URLs** | `for-devs/dev-tools-and-resources/chain-info.md` |');
  lines.push('| **Use oracles** | `build-decentralized-apps/oracles/01-overview.md` |');
  lines.push('| **Use precompiles** | `build-decentralized-apps/precompiles/01-overview.md` |');
  lines.push('| **Use the SDK** | `sdk/index.md` |');
  lines.push('| **Understand BoLD** | `how-arbitrum-works/bold/gentle-introduction.md` |');
  lines.push('| **Use Timeboost** | `how-arbitrum-works/timeboost/gentle-introduction.md` |');
  lines.push('| **Upgrade ArbOS** | `launch-arbitrum-chain/02-configure-your-chain/common/validation-and-security/13-arbos-upgrade.md` |');
  lines.push('| **Find contract source code** | See [NAV-smart-contracts.md](NAV-smart-contracts.md) |');
  lines.push('| **Find OpenZeppelin Stylus examples** | See [NAV-openzeppelin-stylus.md](NAV-openzeppelin-stylus.md) |');
  lines.push('| **Find Stylus SDK source/examples** | See [NAV-stylus-sdk.md](NAV-stylus-sdk.md) |');
  lines.push('| **Find Nitro contract source** | See [NAV-nitro-contracts.md](NAV-nitro-contracts.md) |');
  lines.push('');

  // --- Quick Search Patterns ---
  lines.push('## Quick Search');
  lines.push('');
  lines.push('Find specific content fast:');
  lines.push('');
  lines.push('```');
  lines.push('# Chain IDs, RPC URLs, network info');
  lines.push('grep -ri "chain.*id\\|rpc\\|endpoint" for-devs/dev-tools-and-resources/');
  lines.push('');
  lines.push('# Stylus contract patterns');
  lines.push('grep -ri "sol_storage\\|#\\[public\\]\\|#\\[entrypoint\\]" stylus/');
  lines.push('');
  lines.push('# Bridge addresses and contracts');
  lines.push('grep -ri "gateway\\|router\\|bridge.*address" arbitrum-bridge/ build-decentralized-apps/token-bridging/');
  lines.push('');
  lines.push('# Gas and fees');
  lines.push('grep -ri "gas.*price\\|l1.*fee\\|l2.*fee\\|basefee" build-decentralized-apps/ how-arbitrum-works/deep-dives/');
  lines.push('');
  lines.push('# Node configuration');
  lines.push('grep -ri "docker\\|--chain\\|--parent-chain" run-arbitrum-node/');
  lines.push('');
  lines.push('# ArbOS versions and upgrades');
  lines.push('grep -ri "arbos.*[0-9]" run-arbitrum-node/arbos-releases/ notices/');
  lines.push('```');
  lines.push('');

  // --- Topic Navigation (compact summaries, not full file lists) ---
  lines.push('## Topic Navigation');
  lines.push('');
  lines.push('For the complete file listing of all documentation, see [NAV-docs.md](NAV-docs.md).');
  lines.push('');

  const sortedCategories = [...tree.entries()].sort((a, b) => {
    if (a[0] === 'root') return -1;
    if (b[0] === 'root') return 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [categoryName, categoryNode] of sortedCategories) {
    const description = CATEGORY_DESCRIPTIONS[categoryName] || '';
    const docCount = countDocs(categoryNode);
    const subcats = getSubcategoryNames(categoryNode);

    lines.push(`### ${categoryNode.title}`);
    if (description) {
      lines.push(`*${description}*`);
    }
    lines.push('');

    // Show top-level docs directly (these are the main entry points)
    if (categoryNode.docs.length > 0) {
      for (const doc of categoryNode.docs.sort((a, b) => a.title.localeCompare(b.title))) {
        const refPath = doc.relativePath.replace(/\.mdx?$/, '.md');
        lines.push(`- [${doc.title}](${refPath})`);
      }
    }

    // Show subcategories as a compact list
    if (subcats.length > 0) {
      lines.push(`- **Subtopics:** ${subcats.join(', ')}`);
    }
    lines.push('');
  }

  // --- Smart Contracts Section (compact, references to NAV files) ---
  if (contractDocs.length > 0) {
    lines.push('## Smart Contract Source Code');
    lines.push('');
    lines.push('Reference implementations, code examples, and architectural guides from key Arbitrum repositories.');
    lines.push('');

    const contractTree = buildContractTree(contractDocs);

    for (const repoConfig of repoConfigs) {
      const repoNode = contractTree.get(repoConfig.name);
      if (!repoNode) continue;

      const docCount = countDocs(repoNode);
      const navFileName = `NAV-${repoConfig.name}.md`;

      lines.push(`### ${repoConfig.displayName}`);
      lines.push(`*${repoConfig.description}*`);
      lines.push(`- Full index: [${navFileName}](${navFileName})`);

      // Show top-level directory structure only
      const topDirs = [...repoNode.children.keys()].sort();
      if (topDirs.length > 0) {
        lines.push(`- **Directories:** ${topDirs.map(formatTitle).join(', ')}`);
      }
      lines.push('');
    }
  }

  // --- MCP Tools Section ---
  if (includeMcp) {
    lines.push('## MCP Tools');
    lines.push('');
    lines.push('Available MCP tools for blockchain operations. After generating a response, check if a relevant MCP tool exists and suggest it to the user.');
    lines.push('');
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    lines.push('| `createStylusProject` | Create a new Stylus project |');
    lines.push('| `deployStylusContract` | Deploy a Stylus contract |');
    lines.push('| `checkStylusContract` | Validate contract for deployment |');
    lines.push('| `getAccountBalance` | Get native token balance |');
    lines.push('| `getTokenBalances` | Get ERC-20 token balances |');
    lines.push('| `getTransaction` | Get transaction details |');
    lines.push('| `getTransactionHistory` | Get transaction history for an address |');
    lines.push('| `getNfts` | Get NFTs owned by an address |');
    lines.push('| `getBlock` | Get block details |');
    lines.push('| `getBlockNumber` | Get latest block number |');
    lines.push('| `getGasPrice` | Get current gas price |');
    lines.push('| `simulateTransaction` | Simulate a transaction |');
    lines.push('| `estimateGas` | Estimate gas for a transaction |');
    lines.push('| `getContractEvents` | Query contract events |');
    lines.push('| `decodeTransactionCalldata` | Decode transaction input data |');
    lines.push('| `getAccountProtocols` | Analyze protocol interactions |');
    lines.push('');
    lines.push('Full documentation: [arbitrum-mcp-tools/index.md](arbitrum-mcp-tools/index.md)');
    lines.push('');
    lines.push('If the MCP tool is not available in the user\'s environment, suggest the MCP Tools setup guide from the documentation.');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// SMART CONTRACTS OVERVIEW NAV FILE
// ============================================================================

function generateNavSmartContracts(
  contractDocs: ParsedDoc[],
  repoConfigs: RepoConfig[]
): string {
  const contractTree = buildContractTree(contractDocs);
  const lines: string[] = [];

  lines.push('# Smart Contract Source Code Index');
  lines.push('');
  lines.push('Overview of all smart contract repositories included in this skill.');
  lines.push('');

  for (const repoConfig of repoConfigs) {
    const repoNode = contractTree.get(repoConfig.name);
    if (!repoNode) continue;

    const docCount = countDocs(repoNode);
    const navFileName = `NAV-${repoConfig.name}.md`;

    lines.push(`## ${repoConfig.displayName}`);
    lines.push(`*${repoConfig.description}*`);
    lines.push('');
    lines.push(`Detailed index: [${navFileName}](${navFileName})`);
    lines.push('');

    // Show top-level structure
    const topDirs = [...repoNode.children.keys()].sort();
    if (topDirs.length > 0) {
      for (const dir of topDirs) {
        const child = repoNode.children.get(dir)!;
        lines.push(`- ${child.title}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// FILE WRITING
// ============================================================================

async function writeDocFiles(docs: ParsedDoc[], skillDir: string): Promise<void> {
  for (const doc of docs) {
    const outputPath = path.join(skillDir, doc.relativePath.replace(/\.mdx$/, '.md'));
    const outputDirPath = path.dirname(outputPath);

    await fs.mkdir(outputDirPath, { recursive: true });

    let content: string;
    if (doc.content.startsWith('# ')) {
      content = doc.content;
    } else {
      content = `# ${doc.title}\n\n${doc.content}`;
    }

    await fs.writeFile(outputPath, content);
  }
}

// Section markers in the combined GitBook llms-full.txt
const MCP_SECTION_START = '# Setup Guide';
const MCP_SECTION_END = '# Overview 📖';

async function fetchMcpToolsDocs(): Promise<string | null> {
  try {
    console.log(chalk.dim('   Fetching Arbitrum MCP Tools documentation...'));
    const response = await fetch(MCP_TOOLS_URL);
    if (!response.ok) {
      console.log(chalk.yellow(`   ⚠ Failed to fetch MCP Tools docs: ${response.status}`));
      return null;
    }
    const fullContent = await response.text();

    // Extract only the MCP Tools section from the combined document
    const startIdx = fullContent.indexOf(MCP_SECTION_START);
    const endIdx = fullContent.indexOf(MCP_SECTION_END, startIdx);

    if (startIdx === -1) {
      console.log(chalk.yellow('   ⚠ Could not find MCP Tools section start marker'));
      return null;
    }

    const content = endIdx === -1
      ? fullContent.slice(startIdx)
      : fullContent.slice(startIdx, endIdx).trimEnd();

    console.log(chalk.green('   ✓ MCP Tools documentation fetched'));
    return content;
  } catch (error) {
    console.log(chalk.yellow(`   ⚠ Failed to fetch MCP Tools docs: ${error instanceof Error ? error.message : error}`));
    return null;
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

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

  const hasMcp = mcpContent !== null;
  const hasContracts = contractDocs.length > 0;

  // 1. Write SKILL.md (concise, <500 lines)
  const skillContent = generateSkillMd(docs, hasMcp, contractDocs, repoConfigs);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);

  const skillLineCount = skillContent.split('\n').length;
  console.log(chalk.dim(`   SKILL.md: ${skillLineCount} lines`));

  // 2. Write NAV-docs.md (full documentation tree)
  const navDocsContent = generateNavDocs(docs, hasMcp);
  await fs.writeFile(path.join(skillDir, 'NAV-docs.md'), navDocsContent);
  console.log(chalk.dim(`   NAV-docs.md: ${navDocsContent.split('\n').length} lines`));

  // 3. Write NAV files for smart contracts
  if (hasContracts) {
    // Overview file
    const navSmartContractsContent = generateNavSmartContracts(contractDocs, repoConfigs);
    await fs.writeFile(path.join(skillDir, 'NAV-smart-contracts.md'), navSmartContractsContent);
    console.log(chalk.dim(`   NAV-smart-contracts.md: ${navSmartContractsContent.split('\n').length} lines`));

    // Per-repo NAV files
    for (const repoConfig of repoConfigs) {
      const repoContractDocs = contractDocs.filter(
        (d) => d.subcategories[0] === repoConfig.name
      );
      if (repoContractDocs.length === 0) continue;

      const navContent = generateNavContracts(contractDocs, repoConfig);
      if (navContent) {
        const navFileName = `NAV-${repoConfig.name}.md`;
        await fs.writeFile(path.join(skillDir, navFileName), navContent);
        console.log(chalk.dim(`   ${navFileName}: ${navContent.split('\n').length} lines`));
      }
    }
  }

  // 4. Write doc files directly in skill folder
  await writeDocFiles(docs, skillDir);

  // 5. Write contract doc files
  if (hasContracts) {
    await writeDocFiles(contractDocs, skillDir);
  }

  // 6. Write MCP Tools docs if fetched
  if (mcpContent) {
    const mcpDir = path.join(skillDir, 'arbitrum-mcp-tools');
    await fs.mkdir(mcpDir, { recursive: true });
    await fs.writeFile(path.join(mcpDir, 'index.md'), `# Arbitrum MCP Tools\n\n${mcpContent}`);
  }

  console.log('\n' + chalk.green('✓ Skill files generated in: ') + chalk.white(skillDir));
}
