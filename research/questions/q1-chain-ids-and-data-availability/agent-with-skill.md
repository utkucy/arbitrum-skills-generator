# Q1 With Skill: Chain IDs, RPC Endpoints & Data Availability

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 11
**Question:** "What are the exact chain IDs and RPC endpoints for Arbitrum One and Arbitrum Nova? What's the difference in data availability between the two?"

---

## Answer

### Chain IDs and RPC Endpoints

The following table contains the exact chain parameters for Arbitrum One and Arbitrum Nova, as documented in the Arbitrum bridge quickstart:

| Parameter          | Arbitrum One                   | Arbitrum Nova                  |
|--------------------|-------------------------------|-------------------------------|
| **Chain ID**       | **42161**                     | **42170**                     |
| **RPC URL**        | `https://arb1.arbitrum.io/rpc` | `https://nova.arbitrum.io/rpc` |
| **Currency Symbol**| ETH                           | ETH                           |
| **Block Explorer** | https://arbiscan.io           | https://nova.arbiscan.io/     |

For reference, the testnet **Arbitrum Sepolia** uses Chain ID **421614** with RPC URL `https://sepolia-rollup.arbitrum.io/rpc`.

**Additional endpoints:**

- **Sequencer Feed (Arbitrum One):** `wss://arb1-feed.arbitrum.io/feed` (used when running a feed relay with `--chain.id=42161`)
- **Timeboost Auctioneer (Arbitrum One):** `https://arb1-auctioneer.arbitrum.io/`
- **Timeboost Auctioneer (Arbitrum Nova):** `https://nova-auctioneer.arbitrum.io/`

**Important notes on public RPC endpoints:**
- These public RPCs are **rate-limited** and best suited for testing, development, and light usage.
- Public RPCs **do not provide WebSocket support**.
- Sequencer endpoints (distinct from RPC endpoints) only support `eth_sendRawTransaction` and `eth_sendRawTransactionConditional`.
- For production applications requiring higher throughput or reliability, third-party RPC providers or self-hosted nodes are recommended.

### Data Availability: Arbitrum One vs. Arbitrum Nova

The fundamental difference between Arbitrum One and Arbitrum Nova lies in how they handle **data availability** -- the mechanism by which transaction data is made accessible for verification.

#### Arbitrum One: Rollup Mode (Fully Trustless)

Arbitrum One implements the **Arbitrum Rollup Protocol** and uses **Rollup mode** for data availability:

- **All transaction data is posted directly to Ethereum** (the parent chain), either as calldata in transactions submitted to the parent chain or as blobs submitted via EIP-4844 blob transactions.
- This inclusion ensures that **all data is readily available onchain for anyone to download and verify**.
- The Sequencer batches transactions, compresses them via the Brotli algorithm, and posts them to Ethereum through the Sequencer Inbox Contract.
- The default method is **blob transactions under EIP-4844**, providing cost-effective data inclusion. As a fallback, **calldata transactions** embed data directly.
- This approach introduces **no additional trust assumptions** beyond Ethereum itself -- it provides Ethereum-grade security guarantees.
- The tradeoff is **higher cost**, since posting all data to Ethereum is the largest component of cost in Arbitrum.

**Node synchronization in Rollup mode:** Full nodes read data directly from the parent chain calldata or blobs.

#### Arbitrum Nova: AnyTrust Mode (Mild Trust Assumption)

Arbitrum Nova implements the **AnyTrust protocol**, a variant of Nitro that lowers costs by accepting a mild trust assumption:

- Transaction data is **not posted in full to Ethereum**. Instead, it is submitted to a **Data Availability Committee (DAC)** -- a group of designated nodes that store data and provide it on demand.
- The DAC has **N members**, of which AnyTrust assumes **at least 2 are honest**.
- Instead of posting the entire dataset onchain, only a **Data Availability Certificate (DACert)** -- a cryptographic proof that the data has been stored by the DAC -- is submitted to the parent chain. This significantly reduces onchain data and therefore reduces costs.

**DACert contents:**
- The hash of the data block
- An expiration time
- Proof that N-1 DAC members signed the (hash, expiration time) pair, consisting of:
  - The hash of the Keyset used in signing
  - A bitmap indicating which DAC members signed
  - A BLS aggregated signature (over the BLS12-381 curve)

**How the Sequencer-DAC interaction works:**
1. The Sequencer sends the batch data along with an expiration time (normally three weeks in the future) via RPC to all DAC members in parallel.
2. Each DAC member stores the data in its backing store, indexed by the data's hash, then signs the (hash, expiration time) pair using its BLS key and returns the signature.
3. Once enough signatures are collected, the Sequencer aggregates them into a valid DACert and posts it to the parent chain inbox contract.
4. **Fallback to Rollup:** If the Sequencer fails to collect enough signatures within a few minutes, it abandons the DAC approach and posts the full data directly to the parent chain, exactly as a non-AnyTrust chain would.

**Node synchronization in AnyTrust mode:** Full nodes check the DACert to verify data availability and query the data from the DAC rather than reading it from parent chain calldata/blobs.

**Gas estimation implication for Nova:** For Arbitrum Nova, the size of the parent chain data posting is a fixed value, since only the Data Availability Certificate is posted on the parent chain (not the full transaction data).

#### Summary Comparison

| Aspect                       | Arbitrum One (Rollup)                              | Arbitrum Nova (AnyTrust)                                  |
|------------------------------|---------------------------------------------------|----------------------------------------------------------|
| **Protocol**                 | Arbitrum Rollup Protocol                          | AnyTrust Protocol (variant of Nitro)                     |
| **Data posted to Ethereum**  | Full transaction data (blobs or calldata)         | Only DACert (cryptographic proof)                        |
| **Trust assumption**         | Purely trustless (Ethereum-grade security)        | Mild trust: at least 2-of-N DAC members are honest       |
| **Cost**                     | Higher (Ethereum data posting is the largest cost)| Significantly lower (offchain data storage)              |
| **Ideal use case**           | Applications demanding Ethereum's pure trustlessness | High-throughput, cost-sensitive apps (e.g., gaming, social) |
| **Fallback mechanism**       | N/A (always posts to Ethereum)                    | Falls back to full Rollup posting if DAC fails           |
| **Validation (BoLD)**        | Permissionless validation enabled                 | Permissioned validator allowlist (DAO-controlled)        |

Both chains use the same **Nitro technology stack** under the hood and settle to Ethereum mainnet. The key architectural decision is the tradeoff between pure trustlessness (Arbitrum One) and reduced cost via a mild trust assumption (Arbitrum Nova).

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md` -- Decision guide and topic navigation
2. `.claude/skills/arbitrum-skills/arbitrum-bridge/01-quickstart.md` -- Chain IDs, RPC URLs, block explorer URLs (definitive table)
3. `.claude/skills/arbitrum-skills/build-decentralized-apps/03-public-chains.md` -- Arbitrum One vs Nova overview, Rollup vs AnyTrust description
4. `.claude/skills/arbitrum-skills/run-arbitrum-node/data-availability.md` -- Rollup mode vs AnyTrust mode data flow, node synchronization
5. `.claude/skills/arbitrum-skills/how-arbitrum-works/deep-dives/anytrust-protocol.md` -- AnyTrust protocol details: Keysets, DACerts, DAS, Sequencer-DAC interaction, fallback
6. `.claude/skills/arbitrum-skills/how-arbitrum-works/01-inside-arbitrum-nitro.md` -- Nitro architecture overview, AnyTrust as advanced feature
7. `.claude/skills/arbitrum-skills/stylus/reference/testnet-information.md` -- Public RPC endpoint notes (rate limiting, no WebSocket)
8. `.claude/skills/arbitrum-skills/run-arbitrum-node/run-feed-relay.md` -- Sequencer feed URL for Arbitrum One (`wss://arb1-feed.arbitrum.io/feed`)
9. `.claude/skills/arbitrum-skills/how-arbitrum-works/timeboost/how-to-use-timeboost.md` -- Timeboost auctioneer endpoints
10. `.claude/skills/arbitrum-skills/build-decentralized-apps/02-how-to-estimate-gas.md` -- Nova gas estimation difference (fixed DACert size)
11. `.claude/skills/arbitrum-skills/how-arbitrum-works/deep-dives/transaction-lifecycle.md` -- Public RPC details, submission methods
12. `.claude/skills/arbitrum-skills/how-arbitrum-works/bold/gentle-introduction.md` -- BoLD validation: permissionless for One, permissioned allowlist for Nova
