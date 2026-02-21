# Q1 Without Skill: Chain IDs, RPC Endpoints & Data Availability

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "What are the exact chain IDs and RPC endpoints for Arbitrum One and Arbitrum Nova? What's the difference in data availability between the two?"

---

## Answer

### Chain IDs

- **Arbitrum One:** Chain ID `42161`
- **Arbitrum Nova:** Chain ID `42170`

### RPC Endpoints

**Arbitrum One:**
- Public RPC: `https://arb1.arbitrum.io/rpc`
- Alternate public endpoints are available from providers like Alchemy, Infura, and QuickNode, but the canonical free public endpoint maintained by Offchain Labs is the one above.

**Arbitrum Nova:**
- Public RPC: `https://nova.arbitrum.io/rpc`
- Similarly, third-party providers offer Nova endpoints, but the canonical public endpoint is the one above.

### Data Availability: Arbitrum One vs. Arbitrum Nova

This is the most important architectural distinction between the two chains.

**Arbitrum One** uses **Rollup** (specifically Arbitrum Rollup) for its data availability. This means:
- All transaction data is posted to **Ethereum Layer 1** (as calldata, and more recently as blobs via EIP-4844).
- This provides the strongest security guarantees because anyone can reconstruct the full chain state from L1 data alone.
- The tradeoff is higher costs, since posting data to Ethereum L1 is expensive.
- Security model: Inherits full Ethereum security for data availability.

**Arbitrum Nova** uses **AnyTrust** for its data availability. This means:
- Transaction data is managed by a **Data Availability Committee (DAC)** -- a designated set of committee members who store the data and provide Data Availability Certificates (DACerts).
- Data is posted to Ethereum L1 **only as a fallback** -- if the DAC fails to provide a certificate (e.g., if not enough committee members sign), the system falls back to posting full data on-chain like a standard rollup.
- The DAC members include well-known entities (such as Google Cloud, Reddit, Offchain Labs, Consensys, QuickNode, and others).
- This significantly reduces costs, making Nova much cheaper for transactions, which is why it is targeted at **high-throughput, cost-sensitive applications** like gaming and social media (Reddit's Community Points used Nova, for example).
- Security model: Relies on the assumption that at least **2 out of N** DAC members are honest (where N is the total committee size). This is a weaker trust assumption than full Ethereum DA, but still provides strong guarantees given the reputable committee members.

### Summary Table

| Feature | Arbitrum One | Arbitrum Nova |
|---|---|---|
| Chain ID | 42161 | 42170 |
| Public RPC | https://arb1.arbitrum.io/rpc | https://nova.arbitrum.io/rpc |
| Technology | Arbitrum Rollup | Arbitrum AnyTrust |
| Data Availability | Ethereum L1 (calldata/blobs) | Data Availability Committee (DAC) with L1 fallback |
| Security Level | Full Ethereum security | Trust assumption on DAC (N-1 of N honest members) |
| Cost | Higher | Significantly lower |
| Target Use Cases | DeFi, general-purpose | Gaming, social, high-volume/low-cost apps |

---

## Things I Am Less Certain About

1. **Exact DAC trust threshold:** I stated "2 out of N" as the honesty assumption, but I am not fully confident in that exact number. The AnyTrust protocol requires that at least 2 members are honest (meaning N-1 can be malicious), but the exact current committee size and whether the threshold has changed is something I am not certain about. It may be that only 1 honest member is needed for safety (with N-1 being the threshold for liveness).

2. **Exact DAC membership:** I listed several members (Google Cloud, Reddit, Offchain Labs, Consensys, QuickNode) from memory. The committee composition may have changed since my training data, and I may be missing members or including ones that are no longer active.

3. **RPC endpoint URLs:** I am fairly confident about `https://arb1.arbitrum.io/rpc` for Arbitrum One and `https://nova.arbitrum.io/rpc` for Arbitrum Nova, but these URLs could have changed. Offchain Labs may have updated them or the exact subdomain format might differ slightly.

4. **EIP-4844 blob adoption:** I mentioned that Arbitrum One now uses blobs (EIP-4844) for data posting. This was expected after Ethereum's Dencun upgrade in March 2024, and I believe Arbitrum One adopted it, but I am not 100% certain of the exact timeline or whether it fully transitioned.

5. **Reddit Community Points:** I mentioned Reddit used Nova for Community Points. Reddit actually shut down Community Points in late 2023, so while Nova was used for that purpose, it is no longer an active use case.
