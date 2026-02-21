# Q6 Without Skill: Setting Up and Running an Arbitrum Full Node with Nitro

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "How do I set up and run an Arbitrum full node with Nitro? Include exact hardware requirements, Docker commands, configuration parameters, snapshot sources, and the differences between Arbitrum One and Nova node setup."

---

## Answer

### Overview

Arbitrum Nitro is the current tech stack powering Arbitrum's Layer 2 rollup chains. Running a full node allows you to validate the chain state independently, submit transactions directly, and query historical data without relying on third-party RPC providers. The official node software is maintained by Offchain Labs and distributed as a Docker image.

---

### 1. Hardware Requirements

**Minimum recommended specs for a full node:**

| Resource | Requirement |
|----------|------------|
| CPU | 4+ cores (modern x86_64) |
| RAM | 8-16 GB minimum (16 GB recommended) |
| Storage | 600 GB+ SSD (NVMe strongly recommended) |
| Network | Stable broadband connection, 10+ Mbps |

**Notes on storage:**
- The Arbitrum One chain state grows over time. As of mid-2024 to early 2025, the database size was in the range of several hundred gigabytes and growing.
- NVMe SSDs are strongly recommended over SATA SSDs due to the I/O demands of syncing and serving RPC queries.
- If running an archive node (which stores all historical states), storage requirements increase dramatically -- potentially multiple terabytes.
- Nova has lower storage requirements than Arbitrum One since it has less historical data and different usage patterns.

---

### 2. Prerequisites

Before setting up a Nitro node, you need:

1. **Docker** installed and running (Docker Engine or Docker Desktop).
2. **An L1 Ethereum RPC endpoint** -- your Nitro node needs to read from Ethereum L1 to validate the rollup. You can use:
   - A self-hosted Ethereum full node (e.g., Geth + consensus client)
   - A third-party provider such as Alchemy, Infura, or QuickNode
   - The L1 endpoint must be a full node (not a light client) and ideally an archive node for best compatibility, though a full node works for most use cases.
3. **An L1 Beacon Chain RPC endpoint** -- Nitro nodes (post-Dencun/EIP-4844 support) also need access to the L1 Beacon API to retrieve blob data.

---

### 3. Docker Image

The official Docker image is published by Offchain Labs:

```
offchainlabs/nitro-node:<version-tag>
```

The format is typically `offchainlabs/nitro-node:<version>-<commit_hash>`. You should check the official documentation or the Docker Hub / GitHub releases for the most current stable tag.

To pull the image:

```bash
docker pull offchainlabs/nitro-node:latest
```

---

### 4. Snapshot Sources (Database Initialization)

Syncing from genesis takes an extremely long time for Arbitrum One. It is strongly recommended to initialize from a database snapshot.

**Offchain Labs provides official snapshots:**

- **Arbitrum One snapshots:** Available at a URL pattern like:
  ```
  https://snapshot.arbitrum.foundation/arb1/nitro-pruned.tar
  ```
  or via the snapshot page on the Arbitrum documentation site.

- **Arbitrum Nova snapshots:**
  ```
  https://snapshot.arbitrum.foundation/nova/nitro-pruned.tar
  ```

**Using the `--init.url` parameter:**

Nitro supports automatic snapshot initialization via the `--init.url` flag. When this is set, the node will download and import the snapshot on first startup if the database directory is empty:

```
--init.url="https://snapshot.arbitrum.foundation/arb1/nitro-pruned.tar"
```

For Nova:
```
--init.url="https://snapshot.arbitrum.foundation/nova/nitro-pruned.tar"
```

You can also manually download and extract a snapshot into the data directory before starting the node:

```bash
wget -O arbitrum-one-snapshot.tar <SNAPSHOT_URL>
tar -xf arbitrum-one-snapshot.tar -C /path/to/arbitrum-data/
```

---

### 5. Running an Arbitrum One Full Node

#### Basic Docker Run Command

```bash
docker run -d \
  --name arbitrum-one-node \
  -p 8547:8547 \
  -p 8548:8548 \
  -v /path/to/arbitrum-data:/home/user/.arbitrum \
  offchainlabs/nitro-node:latest \
  --parent-chain.connection.url="https://your-ethereum-l1-rpc-url" \
  --parent-chain.blob-client.beacon-url="https://your-beacon-api-url" \
  --chain.id=42161 \
  --http.api=net,web3,eth \
  --http.corsdomain="*" \
  --http.addr=0.0.0.0 \
  --http.port=8547 \
  --http.vhosts="*" \
  --node.feed.input.url="wss://arb1.arbitrum.io/feed" \
  --init.url="https://snapshot.arbitrum.foundation/arb1/nitro-pruned.tar"
```

#### Key Configuration Parameters

| Parameter | Description | Example Value |
|-----------|------------|---------------|
| `--parent-chain.connection.url` | L1 Ethereum RPC endpoint | `https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY` |
| `--parent-chain.blob-client.beacon-url` | L1 Beacon Chain API endpoint | `http://localhost:5052` |
| `--chain.id` | Chain ID (42161 for Arb One, 42170 for Nova) | `42161` |
| `--http.api` | Enabled JSON-RPC API namespaces | `net,web3,eth,debug` |
| `--http.addr` | HTTP-RPC listen address | `0.0.0.0` |
| `--http.port` | HTTP-RPC port | `8547` |
| `--ws.port` | WebSocket port | `8548` |
| `--http.corsdomain` | CORS domains for HTTP | `*` |
| `--http.vhosts` | Virtual hosts for HTTP | `*` |
| `--init.url` | Snapshot URL for initial sync | See above |
| `--persistent.chain` | Path for chain data | `/home/user/.arbitrum` |
| `--node.feed.input.url` | Sequencer feed URL | `wss://arb1.arbitrum.io/feed` |
| `--execution.caching.archive` | Enable archive mode | `true` (if you want archive) |
| `--node.forwarding-target` | Forward txs to sequencer | The sequencer endpoint URL |

**Note on parameter naming:** Offchain Labs has changed parameter names across Nitro versions. Earlier versions used `--l1.url` instead of `--parent-chain.connection.url`. The blob-client beacon URL parameter was added when Arbitrum adopted EIP-4844 blob data. Always verify with `docker run offchainlabs/nitro-node:latest --help` for your specific version.

#### Sequencer Feed

For fastest block updates, connect to the Sequencer feed:

- **Arbitrum One:** `wss://arb1.arbitrum.io/feed`
- **Arbitrum Nova:** `wss://nova.arbitrum.io/feed`

This allows your node to receive transactions in real-time from the Sequencer before they are posted on L1.

---

### 6. Running an Arbitrum Nova Full Node

Nova uses the same Nitro Docker image but with different configuration:

```bash
docker run -d \
  --name arbitrum-nova-node \
  -p 8547:8547 \
  -p 8548:8548 \
  -v /path/to/nova-data:/home/user/.arbitrum \
  offchainlabs/nitro-node:latest \
  --parent-chain.connection.url="https://your-ethereum-l1-rpc-url" \
  --parent-chain.blob-client.beacon-url="https://your-beacon-api-url" \
  --chain.id=42170 \
  --http.api=net,web3,eth \
  --http.corsdomain="*" \
  --http.addr=0.0.0.0 \
  --http.port=8547 \
  --http.vhosts="*" \
  --node.feed.input.url="wss://nova.arbitrum.io/feed" \
  --init.url="https://snapshot.arbitrum.foundation/nova/nitro-pruned.tar"
```

---

### 7. Key Differences: Arbitrum One vs. Arbitrum Nova Node Setup

| Aspect | Arbitrum One | Arbitrum Nova |
|--------|-------------|---------------|
| **Chain ID** | 42161 | 42170 |
| **Data Availability** | Rollup (all data posted to L1 Ethereum) | AnyTrust (data posted to a Data Availability Committee, only hashes/certs on L1) |
| **Security Model** | Full Ethereum security -- all transaction data is on L1 | Trust-minimized -- relies on a Data Availability Committee (DAC) with at least one honest member |
| **Sequencer Feed URL** | `wss://arb1.arbitrum.io/feed` | `wss://nova.arbitrum.io/feed` |
| **Snapshot URL** | `arb1` path | `nova` path |
| **Storage Requirements** | Higher (more historical data due to DeFi activity) | Lower (gaming/social use cases, less data historically) |
| **Transaction Costs** | Higher (data posted to L1) | Lower (data posted to DAC, cheaper) |
| **Use Cases** | DeFi, high-security applications | Gaming, social, NFTs, cost-sensitive applications |
| **Node Configuration** | Same Docker image, different chain.id and feed URL | Same Docker image, different chain.id and feed URL |
| **Data Availability Server** | Not applicable | Nova nodes can optionally connect to the DAC. For a full node this is handled automatically, but running a DAC member is a separate concern. |

**Important architectural difference:** Because Nova uses AnyTrust, a Nova full node does not need to retrieve all transaction data from L1 -- it retrieves Data Availability Certificates (DACerts) from L1 and can fetch the actual data from DAC members. This means Nova nodes may have slightly different sync behavior and lower bandwidth requirements for L1 data retrieval.

---

### 8. Additional Configuration Options

#### Running as an Archive Node

To run an archive node (stores all historical states, needed for `eth_call` at arbitrary historical blocks):

```
--execution.caching.archive=true
```

Archive nodes require significantly more disk space (potentially multiple terabytes for Arbitrum One).

#### Enabling Debug APIs

```
--http.api=net,web3,eth,debug,txpool
```

#### Metrics and Monitoring

Nitro nodes can expose Prometheus metrics:

```
--metrics
--metrics.addr=0.0.0.0
--metrics.port=6070
```

#### Resource Limits in Docker

Recommended Docker resource configuration:

```bash
docker run -d \
  --name arbitrum-node \
  --memory=16g \
  --cpus=4 \
  ...
```

---

### 9. Docker Compose Example

For a more production-ready setup:

```yaml
version: '3.8'
services:
  arbitrum-one:
    image: offchainlabs/nitro-node:latest
    container_name: arbitrum-one-node
    restart: unless-stopped
    ports:
      - "8547:8547"
      - "8548:8548"
    volumes:
      - arbitrum-data:/home/user/.arbitrum
    command:
      - --parent-chain.connection.url=https://your-l1-rpc
      - --parent-chain.blob-client.beacon-url=https://your-beacon-url
      - --chain.id=42161
      - --http.api=net,web3,eth
      - --http.corsdomain=*
      - --http.addr=0.0.0.0
      - --http.vhosts=*
      - --http.port=8547
      - --ws.port=8548
      - --node.feed.input.url=wss://arb1.arbitrum.io/feed
      - --init.url=https://snapshot.arbitrum.foundation/arb1/nitro-pruned.tar
    deploy:
      resources:
        limits:
          memory: 16g
          cpus: '4'

volumes:
  arbitrum-data:
```

---

### 10. Verifying Node Health

After starting, check if your node is syncing:

```bash
# Check the latest block number
curl -X POST http://localhost:8547 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check sync status
curl -X POST http://localhost:8547 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'
```

Compare your node's block number with a public RPC or block explorer (https://arbiscan.io for Arbitrum One, https://nova.arbiscan.io for Nova).

---

### 11. Important Caveats

1. **L1 RPC requirements**: Running a full node requires a reasonably performant L1 endpoint. Free-tier RPC providers may rate-limit you and cause sync issues. A dedicated L1 node or a paid RPC plan is recommended for production use.

2. **Classic vs. Nitro data**: Arbitrum transitioned from the "Classic" stack to Nitro. Full historical data from before the Nitro migration may require additional setup or a separate Classic node for very old blocks, though Nitro snapshots now typically include the full history post-migration.

3. **Security**: If exposing the RPC to the internet, use a reverse proxy with authentication. The `--http.addr=0.0.0.0` and `--http.vhosts=*` settings are permissive and should be locked down in production.

---

## Things I Am Less Certain About

1. **Exact Docker image tags:** The specific latest version tag changes frequently. Offchain Labs releases new versions regularly. I did not provide a specific pinned tag because I cannot verify the current stable release. Always check the official documentation or GitHub releases page.

2. **Exact snapshot URLs:** The snapshot URLs I provided follow patterns I recall from my training data, but these may have changed. Offchain Labs has moved snapshot hosting locations before. The `snapshot.arbitrum.foundation` domain and path structure should be verified against the current documentation.

3. **Parameter naming (parent-chain vs l1):** There was a significant refactor of CLI parameter names between Nitro v2.x and v3.x. Earlier versions used `--l1.url`, while newer versions use `--parent-chain.connection.url`. I am reasonably confident about the newer naming but the exact transition point and whether both are still accepted is uncertain.

4. **Beacon URL parameter:** The `--parent-chain.blob-client.beacon-url` parameter was introduced to support EIP-4844 blob data retrieval. I am somewhat confident in this parameter name but the exact flag may differ slightly.

5. **Current disk space requirements:** Storage needs grow continuously. The figures I cited (600 GB+ for a pruned full node) are estimates from my training data and the actual current requirement could be significantly higher by early 2026.

6. **Nova-specific DAC configuration:** I described Nova's AnyTrust architecture at a high level, but I am less certain about whether a regular Nova full node requires any additional DAC-specific configuration flags beyond the chain ID and feed URL.

7. **Sequencer feed URLs:** The WebSocket feed URLs (`wss://arb1.arbitrum.io/feed` and `wss://nova.arbitrum.io/feed`) are from my training data and I am fairly confident about them, but they could potentially have changed.

8. **Metrics and debug flags:** The exact names for metrics and monitoring flags (`--metrics`, `--metrics.addr`, etc.) follow common patterns but may have slightly different naming in the current version.

9. **Archive mode flag:** The `--execution.caching.archive` flag is my best recollection. Earlier versions may have used a different flag name for archive mode.

10. **RAM requirements:** I listed 8-16 GB as the range, but actual requirements depend heavily on workload (RPC traffic, caching settings, etc.). Some operators report needing 32 GB or more for heavy RPC workloads.
