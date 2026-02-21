import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { parseAllDocs } from './parser.js';
import { generateSkillFiles } from './skill-generator.js';
import { parseAllRepos, cloneOrUpdateRepo } from './source-parser.js';
import { REPO_CONFIGS, DOCS_REPO_CONFIG } from './repo-config.js';
import type { GeneratorConfig, ParsedDoc } from './types.js';

function printUsage(): void {
  console.log(`
Usage: npm run generate -- [docs-path] [options]

Arguments:
  [docs-path]          Path to the documentation folder (optional)
                       If omitted, arbitrum-docs repo is auto-cloned to .repos/

Options:
  --output, -o         Output directory (default: ./output)
  --name, -n           Skill name (default: arbitrum-skills)
  --ignore-mcp         Skip fetching Arbitrum MCP Tools documentation
  --ignore-contracts   Skip cloning and parsing smart contract repositories
  --contracts-dir      Directory for cloning contract repos (default: ./.repos)
  --help, -h           Show this help message

Examples:
  npm run generate                                  Auto-clone docs + contracts
  npm run generate -- ./arbitrum-docs/docs           Use local docs path
  npm run generate -- ./arbitrum-docs/docs --output ./my-output
  npm run generate -- --ignore-contracts             Auto-clone docs only
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
        console.error(chalk.red('Error: --output requires a path'));
        return null;
      }
    } else if (arg === '--name' || arg === '-n') {
      skillName = args[++i];
      if (!skillName) {
        console.error(chalk.red('Error: --name requires a value'));
        return null;
      }
    } else if (arg === '--ignore-mcp') {
      ignoreMcp = true;
    } else if (arg === '--ignore-contracts') {
      ignoreContracts = true;
    } else if (arg === '--contracts-dir') {
      contractsDir = args[++i];
      if (!contractsDir) {
        console.error(chalk.red('Error: --contracts-dir requires a path'));
        return null;
      }
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    } else {
      console.error(chalk.red(`Unknown option: ${arg}`));
      return null;
    }
  }

  const docsPath = positionalArgs.length > 0 ? path.resolve(positionalArgs[0]) : '';

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
  const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${chalk.white(`${current}/${total}`)}`;
}

async function main(): Promise<void> {
  console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('           Arbitrum Skill Generator                           ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));
  console.log('');

  const config = parseArgs(process.argv.slice(2));
  if (!config) {
    process.exit(1);
  }

  // Auto-clone arbitrum-docs if no docs-path provided
  if (!config.docsPath) {
    console.log(chalk.yellow('No docs-path provided — auto-cloning arbitrum-docs...'));
    console.log('');
    const repoDir = await cloneOrUpdateRepo(DOCS_REPO_CONFIG, config.contractsDir);
    config.docsPath = path.join(repoDir, 'docs');
  }

  // Verify docs path exists
  try {
    const stat = await fs.stat(config.docsPath);
    if (!stat.isDirectory()) {
      console.error(chalk.red(`Error: ${config.docsPath} is not a directory`));
      process.exit(1);
    }
  } catch {
    console.error(chalk.red(`Error: ${config.docsPath} does not exist`));
    process.exit(1);
  }

  console.log(chalk.bold.white('Configuration:'));
  console.log(chalk.dim('  Docs Path:       ') + chalk.white(config.docsPath));
  console.log(chalk.dim('  Output:          ') + chalk.white(`${config.outputDir}/${config.skillName}/`));
  console.log(chalk.dim('  Include MCP:     ') + (!config.ignoreMcp ? chalk.green('true') : chalk.red('false')));
  console.log(chalk.dim('  Include Contracts: ') + (!config.ignoreContracts ? chalk.green('true') : chalk.red('false')));
  if (!config.ignoreContracts) {
    console.log(chalk.dim('  Contracts Dir:   ') + chalk.white(config.contractsDir));
  }
  console.log('');

  const startTime = Date.now();

  try {
    // Step 1: Parse all docs
    const totalSteps = config.ignoreContracts ? 2 : 3;
    let step = 1;

    console.log(chalk.bold.blue(`Step ${step}/${totalSteps}: Parsing documentation files...`));

    let lastUpdate = 0;
    const docs = await parseAllDocs(config.docsPath, (current, total, file) => {
      const now = Date.now();
      if (now - lastUpdate > 100 || current === total) {
        lastUpdate = now;
        process.stdout.write(`\r   ${createProgressBar(current, total)} ${file.slice(0, 40).padEnd(40)}   `);
      }
    });

    console.log('\n');
    console.log(chalk.green(`   ✓ Parsed ${docs.length} documentation files`));
    console.log('');
    step++;

    // Step 2: Clone and parse contract repos (if not ignored)
    let contractDocs: ParsedDoc[] = [];

    if (!config.ignoreContracts) {
      console.log(chalk.bold.yellow(`Step ${step}/${totalSteps}: Cloning and parsing smart contract repos...`));

      contractDocs = await parseAllRepos(REPO_CONFIGS, config.contractsDir, (repo, current, total, file) => {
        const now = Date.now();
        if (now - lastUpdate > 100 || current === total) {
          lastUpdate = now;
          process.stdout.write(`\r   ${createProgressBar(current, total)} ${file.slice(0, 50).padEnd(50)}   `);
        }
      });

      console.log('');
      console.log(chalk.green(`   ✓ Total contract files: ${contractDocs.length}`));
      console.log('');
      step++;
    }

    // Step 3: Generate skill files
    console.log(chalk.bold.magenta(`Step ${step}/${totalSteps}: Generating skill files...`));
    await generateSkillFiles(docs, config, contractDocs, REPO_CONFIGS);

    const totalTime = Date.now() - startTime;
    const skillDir = path.join(config.outputDir, config.skillName);

    console.log('');
    console.log(chalk.green('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.green('║') + chalk.bold.green('                    Generation Complete!                       ') + chalk.green('║'));
    console.log(chalk.green('╚══════════════════════════════════════════════════════════════╝'));
    console.log('');
    console.log(chalk.dim('Total time:      ') + chalk.bold.white(formatDuration(totalTime)));
    console.log(chalk.dim('Documents:       ') + chalk.bold.white(String(docs.length)));
    if (contractDocs.length > 0) {
      console.log(chalk.dim('Contract files:  ') + chalk.bold.white(String(contractDocs.length)));

      // Show per-repo stats
      const repoStats = new Map<string, number>();
      for (const doc of contractDocs) {
        const repo = doc.subcategories[0] || 'unknown';
        repoStats.set(repo, (repoStats.get(repo) || 0) + 1);
      }
      for (const [repo, count] of repoStats) {
        console.log(chalk.dim('  - ') + chalk.cyan(repo) + chalk.dim(': ') + chalk.white(String(count)) + chalk.dim(' files'));
      }
    }
    console.log('');
    console.log(chalk.bold.white('Generated structure:'));
    console.log(chalk.dim('  ') + chalk.cyan(skillDir + '/'));
    console.log(chalk.dim('     ├── ') + chalk.white('SKILL.md') + chalk.dim(' (concise, <500 lines)'));
    console.log(chalk.dim('     ├── ') + chalk.yellow('NAV-docs.md') + chalk.dim(' (full doc index)'));
    if (contractDocs.length > 0) {
      console.log(chalk.dim('     ├── ') + chalk.yellow('NAV-smart-contracts.md') + chalk.dim(' (contracts overview)'));
      console.log(chalk.dim('     ├── ') + chalk.yellow('NAV-openzeppelin-stylus.md'));
      console.log(chalk.dim('     ├── ') + chalk.yellow('NAV-stylus-sdk.md'));
      console.log(chalk.dim('     ├── ') + chalk.yellow('NAV-nitro-contracts.md'));
    }
    console.log(chalk.dim('     ├── ') + chalk.cyan('stylus/'));
    console.log(chalk.dim('     ├── ') + chalk.cyan('sdk/'));
    console.log(chalk.dim('     ├── ') + chalk.cyan('run-arbitrum-node/'));
    console.log(chalk.dim('     ├── ') + chalk.cyan('build-decentralized-apps/'));
    if (contractDocs.length > 0) {
      console.log(chalk.dim('     ├── ') + chalk.cyan('smart-contracts/'));
    }
    console.log(chalk.dim('     └── ...'));
    console.log('');
    console.log(chalk.bold.white('Usage:'));
    console.log(chalk.dim('  Copy to Claude Code skills: ') + chalk.yellow(`cp -r ${skillDir} ~/.claude/skills/`));
    console.log('');
  } catch (error) {
    console.error('');
    console.error(chalk.bold.red('Error:'), chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

main();
