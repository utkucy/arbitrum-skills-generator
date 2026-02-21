# Arbitrum Skill Generator

Generate Claude Code skills from Arbitrum documentation.

## Installation

```bash
npm install
```

## Usage

1. Clone the Arbitrum docs repository:

```bash
git clone https://github.com/OffchainLabs/arbitrum-docs.git
```

2. Generate the skill:

```bash
npm run generate -- ./arbitrum-docs/docs
```

## Output Structure

```
output/arbitrum-skills/
├── SKILL.md                       # Main skill with navigation
├── stylus/
│   ├── quickstart.md
│   ├── overview.md
│   ├── concepts/
│   ├── how-tos/
│   └── reference/
├── sdk/
│   ├── index.md
│   └── migrate.md
├── run-arbitrum-node/
│   ├── arbos-releases/
│   ├── sequencer/
│   └── nitro/
├── build-decentralized-apps/
│   ├── token-bridging/
│   └── ...
└── ...
```

## Installing the Skill

```bash
cp -r output/arbitrum-skills ~/.claude/skills/
```

## License

MIT
