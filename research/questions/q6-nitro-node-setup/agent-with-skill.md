# Q6 With Skill: Setting Up and Running an Arbitrum Full Node with Nitro

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 14
**Question:** "How do I set up and run an Arbitrum full node with Nitro? Include exact hardware requirements, Docker commands, configuration parameters, snapshot sources, and the differences between Arbitrum One and Nova node setup."

---

## Answer

### 1. Hardware Requirements

The minimum hardware configuration for running a Nitro full node (non-archival) is:

| Resource | Recommended |
|:---------|:------------|
| **RAM** | **64 GB** |
| **CPU** | **8 core CPU** (for AWS, an `i4i.2xlarge` instance) |
| **Storage type** | **NVMe SSD drives** with locally attached drives strongly recommended |
| **Storage size** | Depends on the chain and its traffic over time |

**Important notes on hardware:**
- The 64 GB RAM / 8 core CPU minimums are for nodes handling a **limited number of RPC requests**. For nodes processing multiple simultaneous requests, both RAM and CPU core count should be increased.
- **Single core performance matters**: if the node is falling behind and a single core is 100% busy, upgrade to a faster processor.
- Storage requirements grow over time as the chain grows. For reference, archive node storage (as of April 2024): Arbitrum One requires ~9.7 TB SSD growing at ~850 GB/month; Arbitrum Nova requires ~4.3 TB SSD growing at ~1.8 TB/month. Full (pruned) nodes require significantly less.

*(Source: `run-arbitrum-node/02-run-full-node.md`, `run-arbitrum-node/more-types/01-run-archive-node.md`)*

---

### 2. Recommended Nitro Version

**Latest Docker image:** `offchainlabs/nitro-node:v3.9.4-7f582c3`

Available on Docker Hub: https://hub.docker.com/r/offchainlabs/nitro-node/tags

> **Warning:** Only use release versions when running your node. Running beta or release candidate versions is not supported and may lead to unexpected behaviors and/or database corruption.

*(Source: `run-arbitrum-node/02-run-full-node.md`)*

---

### 3. Database Snapshots

Database snapshots are available at the **[Snapshot Explorer](https://snapshot-explorer.arbitrum.io/)** for Arbitrum One, Arbitrum Nova, and Arbitrum Sepolia.

#### Why snapshots matter:
- **Arbitrum One: A snapshot is required** because Nitro cannot process transactions from the Classic Arbitrum era (pre-block 22207817). You must start from a snapshot.
- **Arbitrum Nova and Sepolia: Snapshots are optional** but highly recommended, as syncing from genesis takes a long time.

#### Snapshot parameters:

| Parameter | Description |
|:----------|:------------|
| `--init.latest <type>` | Downloads the latest snapshot automatically. Accepted values: `archive`, `pruned`, `genesis` |
| `--init.latest-base` | Sets the base URL when searching for the latest snapshot |
| `--init.url <url>` | Provide a specific snapshot URL (supports `https://` or `file://` for local files) |
| `--init.download-path` | Directory where the snapshot is temporarily stored during download |
| `--init.validate-checksum` | Validates the SHA256 checksum after download (default: true; set to `false` to disable) |

**How `--init.latest` works:** Nitro searches for a remote file at `<latest-base>/<chain-name>/latest-<kind>.txt` where `<kind>` is `archive`, `pruned`, or `genesis`. This file contains the URL to the snapshot. Make sure to set `--chain.name` correctly (e.g., `arb1` for Arbitrum One) so Nitro can find the snapshot.

> These snapshot parameters are **ignored** if a database already exists on disk.

#### Manual snapshot download:

```shell
# Download the snapshot (use -c to resume interrupted downloads)
wget -c -P /tmp "$SNAPSHOT_URL"

# Fetch the remote checksum
wget -q -O - "$SNAPSHOT_URL".sha256

# Verify the downloaded file's checksum
sha256sum $PATH_TO_SNAPSHOT

# If the snapshot is in parts, join them into a single archive
cat archive.tar.part* > archive.tar
```

#### Manual snapshot extraction:

```shell
mkdir -p $HOME/.arbitrum/$CHAIN/nitro
cd $HOME/.arbitrum/$CHAIN/nitro
tar zxfv $ARCHIVE_PATH
```

After extraction, you should see the directories: `arbitrumdata`, `l2chaindata`, `nodes`.

For the Arbitrum One archive snapshot, use the `--init.url` parameter:
```
--init.url="https://snapshot.arbitrum.foundation/arb1/nitro-archive.tar"
```

*(Source: `run-arbitrum-node/nitro/03-nitro-database-snapshots.md`, `run-arbitrum-node/02-run-full-node.md`, `run-arbitrum-node/more-types/01-run-archive-node.md`)*

---

### 4. Required Configuration Parameters

#### For Arbitrum One (Chain ID: 42161)

| Parameter | Value |
|:----------|:------|
| `--parent-chain.connection.url` | Your Ethereum L1 RPC endpoint (e.g., `https://l1-mainnet-node:8545`) |
| `--chain.id` | `42161` |
| `--http.api` | `net,web3,eth` |
| `--http.corsdomain` | `*` |
| `--http.addr` | `0.0.0.0` |
| `--http.vhosts` | `*` |
| `--init.latest` | `pruned` (for first-time startup; required for Arbitrum One) |

Additionally, after the Ethereum Dencun upgrade, your L1 provider must support **beacon chain blob data**. You need an L1 beacon chain RPC endpoint that provides historical blob data.

#### For Arbitrum Nova (Chain ID: 42170)

Same parameters as above but with:
- `--chain.id=42170`
- Different sequencer feed URL (Nova has its own feed endpoint)
- Snapshot is optional (Nova started as Nitro from genesis block 0)

*(Source: `run-arbitrum-node/02-run-full-node.md`, `run-arbitrum-node/more-types/01-run-archive-node.md`)*

---

### 5. Docker Commands

#### Pre-setup: Create the data directory

```shell
mkdir /data/arbitrum
chmod -fR 777 /data/arbitrum
```

The Docker image runs as non-root **UID 1000**, so the data directory must exist and be writable before running the container. If it does not exist before running the container, Docker may create it as root-owned and the container will fail to write to it.

#### Running an Arbitrum One full node:

```shell
docker run --rm -it \
  -v /some/local/dir/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url=https://l1-mainnet-node:8545 \
  --chain.id=42161 \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --init.latest=pruned
```

#### Running an Arbitrum Nova full node:

```shell
docker run --rm -it \
  -v /some/local/dir/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url=https://l1-mainnet-node:8545 \
  --chain.id=42170 \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --init.latest=pruned
```

#### Running with a node config file:

```shell
docker run --rm -it \
  -v /Path/to/mount/arbitrum:/home/user/.arbitrum \
  -v /Path/to/node-config.json:/home/user/.arbitrum/node-config.json \
  -p 0.0.0.0:8450:8450 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --conf.file /home/user/.arbitrum/node-config.json
```

#### Running an Arbitrum One archive node:

```shell
docker run --rm -it \
  -v /some/local/dir/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url https://l1-node:8545 \
  --chain.id=42161 \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --execution.caching.archive
```

#### Running an archive node with Classic forwarding (for pre-Nitro data on Arbitrum One):

```shell
docker run --rm -it \
  -v /some/local/dir/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url https://l1-node:8545 \
  --chain.id=42161 \
  --execution.rpc.classic-redirect=<classic node RPC> \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --execution.caching.archive
```

#### Running with a custom feed relay (for multi-node setups):

```shell
docker run --rm -it \
  -v /some/local/dir/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url=https://l1-mainnet-node:8545 \
  --chain.id=42161 \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --node.feed.input.url=ws://local-relay-address:9642
```

#### Running a feed relay (required when running multiple nodes):

```shell
docker run --rm -it \
  -p 0.0.0.0:9642:9642 \
  --entrypoint relay \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --node.feed.output.addr=0.0.0.0 \
  --node.feed.input.url=wss://arb1-feed.arbitrum.io/feed \
  --chain.id=42161
```

For latency-sensitive applications, configure redundant feed connections:
```shell
--node.feed.input.url=wss://arb1.arbitrum.io/feed,wss://arb1.arbitrum.io/feed
```
Note: this doubles bandwidth usage and should only be done at the relay level, not on individual nodes.

#### Graceful shutdown (critical to avoid database corruption):

```shell
docker stop --time=1800 $(docker ps -aq)
```

> A graceful shutdown saves the current state to disk. Ungraceful shutdowns can lead to "Head state missing, repairing" errors and potentially require re-syncing the node.

#### Networking note:
If running your L1 node on `localhost`, add `--network host` right after `docker run` to use Docker host-based networking.

*(Source: `run-arbitrum-node/02-run-full-node.md`, `run-arbitrum-node/run-feed-relay.md`, `run-arbitrum-node/more-types/01-run-archive-node.md`)*

---

### 6. Important Ports

| Protocol | Default Port |
|:---------|:-------------|
| RPC/HTTP | `8547` |
| RPC/WebSocket | `8548` |
| Sequencer Feed | `9642` |

To enable WebSocket, add these flags:
- `--ws.port=8548`
- `--ws.addr=0.0.0.0`
- `--ws.origins=*`

*(Source: `run-arbitrum-node/02-run-full-node.md`)*

---

### 7. Differences Between Arbitrum One and Nova Node Setup

| Aspect | Arbitrum One | Arbitrum Nova |
|:-------|:-------------|:--------------|
| **Chain ID** | `42161` | `42170` |
| **Chain Name** | `arb1` | `nova` |
| **Protocol** | Optimistic Rollup | AnyTrust (variant of Nitro) |
| **Data Availability** | All transaction data posted on L1 as calldata/blobs | Data stored by Data Availability Committee (DAC); only DACerts posted on L1 |
| **Snapshot Requirement** | **Required** (cannot process Classic-era transactions) | **Optional** (Nova started as Nitro from genesis, no Classic blocks) |
| **Nitro Genesis Block** | Block `22207817` (Classic-to-Nitro transition) | Block `0` (no Classic era) |
| **Feed URL** | `wss://arb1-feed.arbitrum.io/feed` | Nova-specific feed endpoint |
| **Classic Node Needed?** | Yes, if you need pre-Nitro archive data (pre-block 22207817) | No, Nova has no Classic blocks |
| **Trust Assumption** | Fully trustless (pure Rollup) | Mild trust assumption: at least 2-of-N DAC members are honest |
| **Data Sync** | Node reads batch data directly from L1 calldata/blobs | Node verifies DACerts, queries data from DAC REST API |
| **Staking Token (BoLD)** | WETH | WETH |
| **Wallet Directory** | `arb1/wallet/` | `nova/wallet/` |
| **Cost Profile** | Higher L1 data costs | Significantly lower costs due to off-chain data storage |
| **Storage Growth (archive)** | ~850 GB/month | ~1.8 TB/month |

#### Key Nova-specific details (AnyTrust protocol):

1. **AnyTrust Data Flow:** In Nova's AnyTrust mode, the sequencer sends transaction batches to the Data Availability Committee (DAC), which stores the data and returns a Data Availability Certificate (DACert). Only the DACert is posted to L1, dramatically reducing costs. The DACert contains: the hash of a data block, an expiration time, and proof that N-1 DAC members have signed the (hash, expiration time) pair using BLS aggregated signatures.

2. **DAC Structure:** The DAC has N members, each with a BLS public key. A valid DACert requires N-1 member signatures. Under the 2-of-N trust assumption (at least 2 honest members), at least one honest member will always provide data when needed. Keyset management (member keys and signature requirements) is handled by an on-chain `KeysetManager` contract.

3. **Node Synchronization for Nova:** When a Nova node joins the network, upon receiving a `SequencerBatchDelivered` event, it checks DACerts to verify data availability and queries the actual data from the DAC's REST API. The REST API is publicly available and fully cacheable via CDN.

4. **Fallback Mechanism:** If the sequencer cannot collect enough DAC signatures within a few minutes, it falls back to posting full data on L1 (as calldata), exactly like a standard Rollup chain. The child chain software understands both formats.

5. **DAS Software:** DAC members run Data Availability Server (DAS) software with two APIs:
   - **Sequencer API** (JSON-RPC): For the sequencer to submit data blocks (restricted access)
   - **REST API** (HTTP/S): For anyone to fetch data blocks by hash (public, cacheable)

*(Source: `build-decentralized-apps/03-public-chains.md`, `run-arbitrum-node/data-availability.md`, `how-arbitrum-works/deep-dives/anytrust-protocol.md`, `run-arbitrum-node/more-types/02-run-validator-node.md`, `run-arbitrum-node/sequencer/02-read-sequencer-feed.md`)*

---

### 8. Additional Configuration Options

#### Watchtower Mode (default: enabled)
The full node runs in Watchtower mode by default, monitoring on-chain assertions and logging errors if it finds incorrect ones (`found incorrect assertion in watchtower mode`). For BoLD-enabled chains (Arbitrum One and Nova) running Nitro before v3.6.0, set `--node.bold.enable=true` for proper assertion monitoring. This adds a small memory/execution overhead. Disable with: `--node.staker.enable=false`.

#### Pruning Options
Pruning removes older state data to save disk space (keeps only the latest 128 block states). When using the default `--execution.caching.state-scheme=hash`, activate with:

| Pruning Mode | Description | Time Estimate |
|:-------------|:------------|:--------------|
| `--init.prune minimal` | Only genesis + latest head state | Several hours (for Arbitrum One) |
| `--init.prune full` | Genesis + head state + latest confirmed block state | ~50+ hours |
| `--init.prune validator` | All above + latest validated block state | ~2x what `full` takes |

> Pruning occurs at node startup; the node will **not serve RPC requests** during this process.

#### Beacon Chain Requirements (Post-Dencun)
Your L1 endpoint must provide access to **beacon chain blob data**. Recommended beacon chain RPC providers with historical blob support:

| Provider | Mainnet Beacon | Historical Blobs | Sepolia |
|:---------|:--------------:|:----------------:|:-------:|
| Ankr | Yes | Yes | Yes |
| Chainstack | Yes | Yes | Yes |
| QuickNode | Yes | Yes | Yes |
| dRPC | Yes | Yes | Yes |
| Nirvana Labs | Yes | Yes | No |
| Conduit | Yes | Yes | No |

If running your own beacon node (e.g., Prysm), add the `--subscribe-all-data-subnets` flag (available since Prysm v6.1.0).

*(Source: `run-arbitrum-node/02-run-full-node.md`, `run-arbitrum-node/04-l1-ethereum-beacon-chain-rpc-providers.md`, `run-arbitrum-node/beacon-nodes-historical-blobs.md`)*

---

### 9. Building Nitro from Source (Alternative to Docker)

If you prefer to build from source instead of using the Docker image:

```shell
# Clone the Nitro source
git clone --branch v3.9.4 https://github.com/OffchainLabs/nitro.git
cd nitro
git submodule update --init --recursive --force

# Build the Docker image locally
docker build . --tag nitro-node
```

Supported build platforms: Debian 11.7 (arm64), Ubuntu 22.04 (amd64), MacOS Sonoma 14.3.

To build native binaries, you will need: Git, Curl, Build-Essential, CMake, npm, Go 1.25, Rust 1.83.0, Bison, LLVM/LLD, Foundry 1.0.0, and Node 23.

After building:
```shell
./target/bin/nitro <node parameters>
```

*(Source: `run-arbitrum-node/nitro/01-build-nitro-locally.md`)*

---

### 10. Common Troubleshooting

| Scenario | Solution |
|:---------|:---------|
| `Head state missing, repairing` | Usually from ungraceful shutdown. Recovers in minutes; if not, re-sync. Always use `docker stop --time=1800` |
| Machine running out of memory | Nitro/Geth consume lots of memory under heavy request load. Increase RAM. |
| Cannot connect to L1 on `localhost:8545` | Docker port configuration issue. Use `--network host` flag. |
| Snapshot file not found with `--init.url` | Mount the snapshot file into the Docker container with `-v` |
| `403` errors from feed URL | Cloudflare blocking; may need to retry or use a feed relay |
| `no contract code at given address` | Your L1 node may not be fully synced. Wait for it to finish. |
| `failed to get blobs` | Connect to a beacon endpoint that supports historical blob data |
| `on-chain WASM module root did not match` | Running old node version. Upgrade to latest Nitro release. |

*(Source: `run-arbitrum-node/06-troubleshooting.md`)*

---

### 11. Quick Start Summary

For a basic Arbitrum One full node:

```shell
# 1. Create and permission the data directory
mkdir -p /data/arbitrum
chmod -fR 777 /data/arbitrum

# 2. Run the node with snapshot initialization
docker run --rm -it \
  -v /data/arbitrum:/home/user/.arbitrum \
  -p 0.0.0.0:8547:8547 \
  -p 0.0.0.0:8548:8548 \
  offchainlabs/nitro-node:v3.9.4-7f582c3 \
  --parent-chain.connection.url=<YOUR_L1_RPC_URL> \
  --chain.id=42161 \
  --http.api=net,web3,eth \
  --http.corsdomain=* \
  --http.addr=0.0.0.0 \
  --http.vhosts=* \
  --init.latest=pruned

# 3. Graceful shutdown when needed
docker stop --time=1800 $(docker ps -aq)
```

For Arbitrum Nova, change `--chain.id=42161` to `--chain.id=42170`.

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md` - Decision guide and navigation
2. `.claude/skills/arbitrum-skills/run-arbitrum-node/02-run-full-node.md` - Primary full node setup guide
3. `.claude/skills/arbitrum-skills/run-arbitrum-node/01-overview.md` - Node types overview
4. `.claude/skills/arbitrum-skills/run-arbitrum-node/06-troubleshooting.md` - Troubleshooting guide
5. `.claude/skills/arbitrum-skills/run-arbitrum-node/data-availability.md` - Data availability mechanisms (Rollup vs AnyTrust)
6. `.claude/skills/arbitrum-skills/run-arbitrum-node/nitro/03-nitro-database-snapshots.md` - Snapshot download and configuration
7. `.claude/skills/arbitrum-skills/run-arbitrum-node/nitro/01-build-nitro-locally.md` - Building Nitro from source
8. `.claude/skills/arbitrum-skills/run-arbitrum-node/run-feed-relay.md` - Feed relay setup
9. `.claude/skills/arbitrum-skills/run-arbitrum-node/04-l1-ethereum-beacon-chain-rpc-providers.md` - Beacon chain RPC providers
10. `.claude/skills/arbitrum-skills/run-arbitrum-node/beacon-nodes-historical-blobs.md` - Historical blob requirements
11. `.claude/skills/arbitrum-skills/build-decentralized-apps/03-public-chains.md` - Arbitrum chains overview (One vs Nova)
12. `.claude/skills/arbitrum-skills/run-arbitrum-node/more-types/01-run-archive-node.md` - Archive node setup and storage requirements
13. `.claude/skills/arbitrum-skills/how-arbitrum-works/deep-dives/anytrust-protocol.md` - AnyTrust protocol deep dive (DAC, DACerts, Keysets)
14. `.claude/skills/arbitrum-skills/run-arbitrum-node/sequencer/02-read-sequencer-feed.md` - Sequencer feed details and genesis block numbers
15. `.claude/skills/arbitrum-skills/run-arbitrum-node/more-types/02-run-validator-node.md` - Validator node (staking token and wallet directory info)
16. `.claude/skills/arbitrum-skills/run-arbitrum-node/03-run-local-full-chain-simulation.md` - Local testnode setup
17. `.claude/skills/arbitrum-skills/run-arbitrum-node/05-run-nitro-dev-node.md` - Local dev node
18. `.claude/skills/arbitrum-skills/for-devs/dev-tools-and-resources/chain-info.md` - Chain parameters
