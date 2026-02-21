import type { RepoConfig } from './types.js';

export const DOCS_REPO_CONFIG: RepoConfig = {
  name: 'arbitrum-docs',
  repoUrl: 'https://github.com/OffchainLabs/arbitrum-docs.git',
  displayName: 'Arbitrum Documentation',
  description: 'Official Arbitrum documentation',
  scanPaths: [], // Docs parsing is handled by parser.ts, not the source-parser pipeline
};

export const REPO_CONFIGS: RepoConfig[] = [
  {
    name: 'openzeppelin-stylus',
    repoUrl: 'https://github.com/OpenZeppelin/rust-contracts-stylus.git',
    displayName: 'OpenZeppelin Rust Contracts for Stylus',
    description: 'Production-ready Rust smart contract implementations for Arbitrum Stylus - ERC20, ERC721, ERC1155, access control, proxy patterns, finance utilities, and cryptographic helpers.',
    scanPaths: [
      { dir: 'contracts/src', extensions: ['.rs'], language: 'rust', type: 'source' },
      { dir: 'examples', extensions: ['.rs', '.toml'], language: 'rust', type: 'source' },
      { dir: 'docs/modules/ROOT/pages', extensions: ['.adoc'], language: 'markdown', type: 'doc' },
    ],
  },
  {
    name: 'stylus-sdk',
    repoUrl: 'https://github.com/OffchainLabs/stylus-sdk-rs.git',
    displayName: 'Stylus SDK for Rust',
    description: 'Core Rust SDK for building Arbitrum Stylus contracts - storage abstractions, ABI encoding, proc macros, host I/O, testing framework, and cargo-stylus CLI tool.',
    scanPaths: [
      { dir: 'stylus-sdk/src', extensions: ['.rs'], language: 'rust', type: 'source' },
      { dir: 'stylus-core/src', extensions: ['.rs'], language: 'rust', type: 'source' },
      { dir: 'stylus-proc/src', extensions: ['.rs'], language: 'rust', type: 'source' },
      { dir: 'stylus-test/src', extensions: ['.rs'], language: 'rust', type: 'source' },
      { dir: 'examples', extensions: ['.rs', '.toml'], language: 'rust', type: 'source' },
    ],
  },
  {
    name: 'nitro-contracts',
    repoUrl: 'https://github.com/OffchainLabs/nitro-contracts.git',
    displayName: 'Nitro Contracts (Solidity)',
    description: 'Core Arbitrum Nitro L1/L2 smart contracts - bridge (Inbox, Outbox, SequencerInbox), rollup management, BoLD challenge protocol, one-step proof verification, and token bridging.',
    scanPaths: [
      { dir: 'src', extensions: ['.sol'], language: 'solidity', type: 'source' },
      { dir: 'docs', extensions: ['.md'], language: 'markdown', type: 'doc' },
    ],
  },
];
