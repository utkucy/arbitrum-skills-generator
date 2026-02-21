import * as fs from 'fs/promises';
import * as path from 'path';
import { parseAllDocs } from './parser.js';
import { generateSkillFiles } from './skill-generator.js';
import { parseAllRepos } from './source-parser.js';
import { REPO_CONFIGS } from './repo-config.js';
import type { GeneratorConfig, ParsedDoc } from './types.js';

function printUsage(): void {
  console.log(`
Usage: npm run generate -- <docs-path> [options]

Arguments:
  <docs-path>          Path to the documentation folder (e.g., ./arbitrum-docs/docs)

Options:
  --output, -o         Output directory (default: ./output)
  --name, -n           Skill name (default: arbitrum-skills)
  --ignore-mcp         Skip fetching Arbitrum MCP Tools documentation
  --ignore-contracts   Skip cloning and parsing smart contract repositories
  --contracts-dir      Directory for cloning contract repos (default: ./.repos)
  --help, -h           Show this help message

Examples:
  npm run generate -- ./arbitrum-docs/docs
  npm run generate -- ./arbitrum-docs/docs --output ./my-output
  npm run generate -- ./arbitrum-docs/docs --ignore-contracts
  npm run generate -- /path/to/docs -o ./output -n my-skill
`);
}

function parseArgs(args: string[]): GeneratorConfig | null {
  const positionalArgs: string[] = [];
  let outputDir = './output';
  let skillName = 'arbitrum-skills';
  let ignoreMcp = false;
  let ignoreContracts = false;
  let contractsDir = './.repos';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--output' || arg === '-o') {
      outputDir = args[++i];
      if (!outputDir) {
        console.error('Error: --output requires a path');
        return null;
      }
    } else if (arg === '--name' || arg === '-n') {
      skillName = args[++i];
      if (!skillName) {
        console.error('Error: --name requires a value');
        return null;
      }
    } else if (arg === '--ignore-mcp') {
      ignoreMcp = true;
    } else if (arg === '--ignore-contracts') {
      ignoreContracts = true;
    } else if (arg === '--contracts-dir') {
      contractsDir = args[++i];
      if (!contractsDir) {
        console.error('Error: --contracts-dir requires a path');
        return null;
      }
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      return null;
    }
  }

  if (positionalArgs.length === 0) {
    console.error('Error: docs-path is required');
    printUsage();
    return null;
  }

  const docsPath = path.resolve(positionalArgs[0]);

  return {
    docsPath,
    outputDir: path.resolve(outputDir),
    skillName,
    ignoreMcp,
    ignoreContracts,
    contractsDir: path.resolve(contractsDir),
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function createProgressBar(current: number, total: number, width: number = 30): string {
  const percentage = current / total;
  const filled = Math.round(width * percentage);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${current}/${total}`;
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Arbitrum Skill Generator                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const config = parseArgs(process.argv.slice(2));
  if (!config) {
    process.exit(1);
  }

  // Verify docs path exists
  try {
    const stat = await fs.stat(config.docsPath);
    if (!stat.isDirectory()) {
      console.error(`Error: ${config.docsPath} is not a directory`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: ${config.docsPath} does not exist`);
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Docs Path:       ${config.docsPath}`);
  console.log(`  Output:          ${config.outputDir}/${config.skillName}/`);
  console.log(`  Include MCP:     ${!config.ignoreMcp}`);
  console.log(`  Include Contracts: ${!config.ignoreContracts}`);
  if (!config.ignoreContracts) {
    console.log(`  Contracts Dir:   ${config.contractsDir}`);
  }
  console.log('');

  const startTime = Date.now();

  try {
    // Step 1: Parse all docs
    const totalSteps = config.ignoreContracts ? 2 : 3;
    let step = 1;

    console.log(`📋 Step ${step}/${totalSteps}: Parsing documentation files...`);

    let lastUpdate = 0;
    const docs = await parseAllDocs(config.docsPath, (current, total, file) => {
      const now = Date.now();
      if (now - lastUpdate > 100 || current === total) {
        lastUpdate = now;
        process.stdout.write(`\r   ${createProgressBar(current, total)} ${file.slice(0, 40).padEnd(40)}   `);
      }
    });

    console.log('\n');
    console.log(`   ✓ Parsed ${docs.length} documentation files`);
    console.log('');
    step++;

    // Step 2: Clone and parse contract repos (if not ignored)
    let contractDocs: ParsedDoc[] = [];

    if (!config.ignoreContracts) {
      console.log(`📦 Step ${step}/${totalSteps}: Cloning and parsing smart contract repos...`);

      contractDocs = await parseAllRepos(REPO_CONFIGS, config.contractsDir, (repo, current, total, file) => {
        const now = Date.now();
        if (now - lastUpdate > 100 || current === total) {
          lastUpdate = now;
          process.stdout.write(`\r   ${createProgressBar(current, total)} ${file.slice(0, 50).padEnd(50)}   `);
        }
      });

      console.log('');
      console.log(`   ✓ Total contract files: ${contractDocs.length}`);
      console.log('');
      step++;
    }

    // Step 3: Generate skill files
    console.log(`📝 Step ${step}/${totalSteps}: Generating skill files...`);
    await generateSkillFiles(docs, config, contractDocs, REPO_CONFIGS);

    const totalTime = Date.now() - startTime;
    const skillDir = path.join(config.outputDir, config.skillName);

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Generation Complete!                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Total time:      ${formatDuration(totalTime)}`);
    console.log(`Documents:       ${docs.length}`);
    if (contractDocs.length > 0) {
      console.log(`Contract files:  ${contractDocs.length}`);

      // Show per-repo stats
      const repoStats = new Map<string, number>();
      for (const doc of contractDocs) {
        const repo = doc.subcategories[0] || 'unknown';
        repoStats.set(repo, (repoStats.get(repo) || 0) + 1);
      }
      for (const [repo, count] of repoStats) {
        console.log(`  - ${repo}: ${count} files`);
      }
    }
    console.log('');
    console.log('Generated structure:');
    console.log(`  📁 ${skillDir}/`);
    console.log('     ├── SKILL.md');
    console.log('     ├── stylus/');
    console.log('     ├── sdk/');
    console.log('     ├── run-arbitrum-node/');
    console.log('     ├── build-decentralized-apps/');
    if (contractDocs.length > 0) {
      console.log('     ├── smart-contracts/');
      console.log('     │   ├── openzeppelin-stylus/');
      console.log('     │   ├── stylus-sdk/');
      console.log('     │   └── nitro-contracts/');
    }
    console.log('     └── ...');
    console.log('');
    console.log('Usage:');
    console.log(`  Copy to Claude Code skills: cp -r ${skillDir} ~/.claude/skills/`);
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
