# Q3 Without Skill: Custom Gas Token for AnyTrust Orbit Chain

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "How do I set up a custom gas token for an AnyTrust Orbit chain? What are the specific steps, requirements, and configuration parameters?"

---

## Answer

### Overview

Arbitrum Orbit allows you to launch your own Layer 2 (or Layer 3) chain built on the Arbitrum technology stack. One of the features available specifically to **AnyTrust** Orbit chains is the ability to use a **custom ERC-20 token as the native gas token** instead of ETH. When configured, users pay for gas fees using your chosen token, and that token effectively replaces ETH as the native currency on the child chain.

**Fundamental constraint:** Custom gas tokens are only supported on **AnyTrust** Orbit chains, not on Rollup Orbit chains. This is an architectural requirement.

### Token Requirements

The ERC-20 token you select as the gas token must satisfy several criteria:

1. **18 decimals** -- The token must use 18 decimals. Tokens with non-18 decimal configurations are not supported (or at minimum were not supported as of my training cutoff).

2. **Standard ERC-20 compliance** -- The token must be a well-behaved ERC-20 that returns `true` on successful transfers and follows the standard interface.

3. **No fee-on-transfer** -- Tokens that charge fees on transfer will break the bridging and deposit mechanics because the received amount would differ from the sent amount.

4. **No rebasing** -- Rebasing tokens (where balances change automatically) are incompatible with the bridge contracts.

5. **Deployed on the parent chain** -- The ERC-20 contract must already be deployed on the parent chain (e.g., Ethereum L1, Arbitrum One, or Arbitrum Nova if you are deploying an L3).

### Step-by-Step Setup

#### Step 1: Prepare the ERC-20 Token

If your custom gas token does not already exist on the parent chain, deploy a standard ERC-20 token contract meeting the requirements above. Ensure you have sufficient supply for chain initialization and ongoing operations.

#### Step 2: Configure the Chain Parameters

When deploying your Orbit chain, the critical configuration parameter is:

- **`nativeToken`**: Set this to the address of your ERC-20 token on the parent chain. When this is set to `address(0)` or omitted, the chain defaults to ETH. When set to a valid ERC-20 address, that token becomes the native gas token.

Other important chain parameters include:

| Parameter | Description |
|-----------|-------------|
| `nativeToken` | ERC-20 token address on parent chain |
| `DataAvailabilityCommittee` | Must be `true` (AnyTrust is required for custom gas tokens) |
| `chainId` | Unique chain ID for your Orbit chain |
| `owner` | Address that controls chain administration |
| `validators` | Array of validator addresses |
| `batchPoster` | Address of the batch poster |
| `loserStakeEscrow` | Address for escrowed stakes from losing challenges |
| `maxDataSize` | Maximum data size for transactions |

#### Step 3: Approve Token Spending

Before deploying the chain contracts, you must **approve** the `RollupCreator` contract (and potentially other deployment contracts) to spend your custom gas token. The deployment process transfers an initial amount of tokens to fund the chain infrastructure:

```javascript
// Approve the RollupCreator contract to spend tokens
await nativeToken.approve(rollupCreatorAddress, depositAmount);
```

#### Step 4: Deploy the Orbit Chain

Deploy the chain using one of:

**Option A: Orbit SDK (programmatic)**

```typescript
import { createRollupPrepareConfig, createRollupPrepareTransactionRequest } from '@arbitrum/orbit-sdk';

const config = createRollupPrepareConfig({
  chainId: BigInt(YOUR_CHAIN_ID),
  owner: deployerAddress,
  chainConfig: {
    // chain config parameters
    DataAvailabilityCommittee: true, // Required for AnyTrust / custom gas token
  },
  nativeToken: '0xYourERC20TokenAddress', // The custom gas token address
});

// Then prepare and send the deployment transaction
const txRequest = await createRollupPrepareTransactionRequest({
  params: config,
  account: deployerAddress,
  publicClient,
});
```

**Option B: Orbit Chain Deployment Portal (web UI)**

The Arbitrum Orbit deployment portal provides a guided UI where you can select "Custom Gas Token" and provide your ERC-20 token address during the chain configuration step.

The deployment process will:
1. Deploy the rollup contracts on the parent chain (using `ERC20Bridge` and `ERC20Inbox` variants instead of the standard `Bridge` and `Inbox`)
2. Configure the bridge to use the custom gas token
3. Set up the inbox and outbox contracts
4. Initialize the chain with the native token configuration

#### Step 5: Contract Variants

With a custom gas token, the system uses different contract variants:

- **`ERC20Bridge`** instead of `Bridge` -- handles token deposits/withdrawals via `transferFrom` rather than ETH `msg.value`
- **`ERC20Inbox`** instead of `Inbox` -- accepts ERC-20 token approvals for message submission and retryable tickets
- The outbox and other contracts are adjusted accordingly

#### Step 6: Set Up Chain Infrastructure

After contract deployment:

1. **Data Availability Committee (DAC):** Configure your DAC members with their signing keys and RPC endpoints. This is required for AnyTrust.

2. **Batch Poster:** The batch poster needs:
   - Custom gas token on the child chain (for child chain operations)
   - ETH (or parent chain native token) on the parent chain (for posting batches)

3. **Validators:** Fund validators with appropriate tokens for staking and operations.

4. **Sequencer Node:** Configure the sequencer with the chain info JSON that includes the native token address and all bridge contract addresses.

#### Step 7: Node Configuration

When running the Orbit chain node, the chain info JSON (generated during deployment) will contain the native token address and related bridge contract addresses. A typical node config references this:

```json
{
  "chain": {
    "info-json": "[chain-info-json-including-native-token-config]",
    "name": "your-chain-name"
  }
}
```

### Bridge Behavior with Custom Gas Tokens

- **Depositing the native token:** When users bridge the custom ERC-20 from the parent chain to the Orbit chain, it becomes the native token on the child chain (analogous to how ETH works on standard Arbitrum chains).
- **ETH on the child chain:** If ETH is bridged to an Orbit chain with a custom gas token, it arrives as a **wrapped ERC-20 token** on the child chain, not as the native currency.
- **Retryable tickets:** Cross-chain messages (retryable tickets) require deposits denominated in the custom gas token, not ETH. The `ERC20Inbox` handles the token transfer via `approve` + `transferFrom`.
- **Withdrawals:** Users can withdraw the native token back to the parent chain through the standard bridge mechanism.

### Operational Considerations

1. **Gas pricing:** The gas price oracle on the child chain denominates prices in the custom token. `eth_gasPrice` returns values in the custom token's smallest unit.

2. **`eth_getBalance`:** Standard RPC calls return balances in the custom gas token, not ETH.

3. **Fee distribution:** Transaction fees go to the network fee account and infrastructure fee account on the child chain, denominated in the custom token.

4. **Token liquidity:** Ensure sufficient liquidity so users can acquire the gas token to pay for transactions.

5. **Block explorer:** Configure your block explorer to display the custom token as the native currency.

6. **L1 posting costs:** While gas is paid in the custom token on the child chain, batch posting to the parent chain still requires the parent chain's native token (e.g., ETH). AnyTrust significantly reduces this cost through the DAC.

---

## Things I Am Less Certain About

1. **Exact 18-decimal requirement strictness:** I am fairly confident 18 decimals is required, but there may have been updates to the Orbit SDK or contracts to support non-18-decimal tokens, possibly via adapter contracts. I cannot verify whether this has changed.

2. **Orbit SDK API surface:** The Orbit SDK has been under active development. The exact function names (`createRollupPrepareConfig`, `createRollupPrepareTransactionRequest`), parameter structures, and import paths may have changed since my training data. The conceptual flow is correct, but specific API calls may differ.

3. **Exact token approval flow:** I described approving the `RollupCreator` contract, but the exact contract to approve, the precise deposit amount required, and whether additional approvals are needed for bridge initialization may vary by SDK version.

4. **ETH wrapping mechanism:** I stated ETH becomes a wrapped ERC-20 on custom gas token chains. I am fairly confident about this, but the exact wrapper contract implementation and how it's surfaced to users is something I'm less certain about.

5. **`maxDataSize` default values:** I listed this as a parameter but am not confident about the exact default value for AnyTrust chains.

6. **Additional token restrictions:** There may be additional documented restrictions on which tokens can serve as gas tokens (e.g., upgradeable proxies, permit functions, etc.) that I am not aware of.

7. **Orbit deployment portal current state:** The web-based deployment portal may have changed its flow, added new options, or been deprecated in favor of SDK-only deployment.

8. **Minimum deposit / funding amounts:** There may be specific minimum token amounts required during chain initialization to fund the chain's infrastructure accounts. I don't know the exact figures.

9. **Interaction with Stylus:** Whether Stylus smart contracts on AnyTrust chains with custom gas tokens require any special handling is something I'm uncertain about.

10. **Recent protocol changes (ArbOS versions):** Newer ArbOS versions may have changed how custom gas tokens work, added new features, or modified requirements. My knowledge may not reflect the latest state.

11. **Whether `RollupCreator` is the exact contract name:** The factory contract for creating Orbit chains may use a slightly different name or may have been refactored since my training data.
