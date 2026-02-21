# Q3 With Skill: Custom Gas Token for AnyTrust Orbit Chain

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 12
**Question:** "How do I set up a custom gas token for an AnyTrust Orbit chain? What are the specific steps, requirements, and configuration parameters?"

---

## Answer

### Overview

An AnyTrust Orbit chain can be configured to use an **ERC-20 token** instead of ETH as the native gas token for paying transaction fees. This choice is made **during chain deployment** and is **immutable afterward** -- it integrates directly into the chain's genesis parameters. The token is "natively bridged" from the parent chain and configured as the native gas token on the child chain.

Compared to Rollup mode (which requires a fee token pricer for exchange rates), AnyTrust mode offers a **simpler configuration** path for custom gas tokens because AnyTrust chains use a Data Availability Committee (DAC) instead of posting full data to the parent chain, reducing the complexity of fee conversion mechanics.

*(Source: `launch-arbitrum-chain/features/common/gas-and-fees/choose-custom-gas-token.md`)*

---

### Step 1: Ensure Your ERC-20 Token Meets the Requirements

The custom gas token must be an ERC-20 token deployed on the **parent chain** (e.g., Ethereum, Arbitrum One, Arbitrum Sepolia). It must comply with the following restrictions:

| Requirement | Details |
|---|---|
| **Standard ERC-20** | Must be a standard ERC-20 token |
| **No rebasing** | The token must not be a rebasing token |
| **No transfer fees** | The token must not include any transfer fee mechanism |
| **Zero-value transfers** | Must not revert on transfers of 0 value |
| **Direct transfers only** | The token must only be transferable via a call to the token address itself (no proxies or hooks) |
| **Direct allowance only** | The token must only be able to set allowance via a call to the token address itself |
| **No transfer callbacks** | The token must not have a callback on transfer; a user must not be able to make a transfer to themselves revert |
| **Decimals** | Typically 18 decimals is expected |

*(Source: `launch-arbitrum-chain/02-configure-your-chain/common/gas/01-use-a-custom-gas-token-anytrust.md`)*

---

### Step 2: Prepare the Chain Configuration

Use the **Arbitrum Chain SDK** to prepare the chain configuration. Set `DataAvailabilityCommittee: true` for AnyTrust mode.

```typescript
import { prepareChainConfig } from '@arbitrum/chain-sdk';

const chainConfig = prepareChainConfig({
  chainId: 123_456,
  arbitrum: {
    InitialChainOwner: '0xYourOwnerAddress',
    // AnyTrust = true, Rollup = false
    DataAvailabilityCommittee: true,
  },
});
```

Then prepare the deployment params config:

```typescript
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { createRollupPrepareDeploymentParamsConfig } from '@arbitrum/chain-sdk';

const parentChain = arbitrumSepolia;
const parentChainPublicClient = createPublicClient({
  chain: parentChain,
  transport: http(parentChainRPC),
});

const createRollupConfig = createRollupPrepareDeploymentParamsConfig(parentChainPublicClient, {
  chainId: 123_456,
  owner: '0xYourOwnerAddress',
  chainConfig: chainConfig,
});
```

*(Source: `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md`, `launch-arbitrum-chain/features/common/data-availability/choose-anytrust.md`)*

---

### Step 3: Deploy the Chain with the Custom Gas Token

The key parameter is **`nativeToken`** in the `RollupDeploymentParams` struct. Set it to the address of your ERC-20 token on the parent chain. If set to the zero address, the chain uses ETH.

The full `RollupDeploymentParams` struct passed to the `RollupCreator.createRollup()` function is:

```solidity
struct RollupDeploymentParams {
    Config config;
    address[] validators;
    uint256 maxDataSize;
    address nativeToken;        // <-- your ERC-20 token address on the parent chain
    bool deployFactoriesToL2;
    uint256 maxFeePerGasForRetryables;
    address[] batchPosters;
    address batchPosterManager;
}
```

**Key parameters:**

| Parameter | Value for Custom Gas Token AnyTrust |
|---|---|
| `nativeToken` | Address of your ERC-20 token on the parent chain |
| `maxDataSize` | `117964` for L2 chains, `104857` for L3 chains |
| `config.chainConfig` (DataAvailabilityCommittee) | `true` |
| `validators` | Array of initial validator addresses |
| `batchPosters` | Array of initial batch poster addresses |

**Important:** Before calling `createRollup`, the deployer must give **allowance** to the `RollupCreator` contract so it can spend enough tokens to send the corresponding parent-to-child messages during deployment. The Chain SDK's `createRollup` function handles this, but the deployer must own enough tokens.

Using the Chain SDK:

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { createRollup } from '@arbitrum/chain-sdk';

const deployer = privateKeyToAccount(deployerPrivateKey);
const parentChainPublicClient = createPublicClient({
  chain: parentChain,
  transport: http(),
});

const createRollupResults = await createRollup({
  params: {
    config: createRollupConfig,
    batchPosters: [batchPoster],
    validators: [validator],
    nativeToken: '0xYourERC20TokenAddressOnParentChain',
  },
  account: deployer,
  parentChainPublicClient,
});
```

The `createRollupResults` returns:
- `transaction`: The transaction sent
- `transactionReceipt`: The transaction receipt
- `coreContracts`: An object with the addresses of all deployed contracts

*(Source: `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md`)*

---

### Step 4: Set Up the DAC Keyset (AnyTrust-Specific)

Since you are deploying an AnyTrust chain, you must configure the **Data Availability Committee (DAC)** keyset in the `SequencerInbox` contract. This involves:

1. Setting up Data Availability Servers (DAS)
2. Generating the keyset with all DAS keys
3. Calling `setValidKeyset` on the SequencerInbox

```typescript
import { setValidKeyset, createWalletClient } from '@arbitrum/chain-sdk';

const deployer = privateKeyToAccount(deployerPrivateKey);
const parentChainPublicClient = createPublicClient({
  chain: parentChain,
  transport: http(),
});
const deployerWalletClient = createWalletClient({
  account: deployer,
  chain: parentChain,
  transport: http(),
});

const transactionReceipt = await setValidKeyset({
  coreContracts: {
    upgradeExecutor: '0xUpgradeExecutor',
    sequencerInbox: '0xSequencerInbox',
  },
  keyset: generatedKeyset,
  publicClient: parentChainPublicClient,
  walletClient: deployerWalletClient,
});
```

*(Source: `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md`)*

---

### Step 5: Reset Parent Chain Base Fees (Critical Post-Deployment Step)

After deploying the chain, you **must** reset the parent chain base fee parameters by calling the following functions on the **`ArbOwner` precompile** (address `0x0000000000000000000000000000000000000070`):

1. **`SetL1PricePerUnit`** -- set `pricePerUnit` to `0`
2. **`SetL1PricingRewardRate`** -- set `perUnitReward` to `0`

Using `cast`:

```shell
# Set L1 price per unit to 0
cast send --rpc-url $ORBIT_CHAIN_RPC --private-key $OWNER_PRIVATE_KEY \
  0x0000000000000000000000000000000000000070 \
  "setL1PricePerUnit(uint256) ()" 0

# Set L1 pricing reward rate to 0
cast send --rpc-url $ORBIT_CHAIN_RPC --private-key $OWNER_PRIVATE_KEY \
  0x0000000000000000000000000000000000000070 \
  "setL1PricingRewardRate(uint64) ()" 0
```

Or using the Chain SDK:

```typescript
const owner = privateKeyToAccount(ownerPrivateKey);
const orbitChainClient = createPublicClient({
  chain: orbitChain,
  transport: http(),
}).extend(arbOwnerPublicActions);

// Set L1PricePerUnit to 0
const tx1 = await orbitChainClient.arbOwnerPrepareTransactionRequest({
  functionName: 'setL1PricePerUnit',
  args: [0n],
  upgradeExecutor: false,
  account: owner.address,
});
await orbitChainClient.sendRawTransaction({
  serializedTransaction: await owner.signTransaction(tx1),
});

// Set L1PricingRewardRate to 0
const tx2 = await orbitChainClient.arbOwnerPrepareTransactionRequest({
  functionName: 'setL1PricingRewardRate',
  args: [0n],
  upgradeExecutor: false,
  account: owner.address,
});
await orbitChainClient.sendRawTransaction({
  serializedTransaction: await owner.signTransaction(tx2),
});
```

**Why this is critical:** Nitro assumes the native asset is ETH and applies parent chain fees accordingly. Without resetting these values:
- If your custom gas token is **more expensive than ETH** (e.g., wrapped BTC), users will be **significantly overcharged** for parent chain fees.
- If your token is **cheaper than ETH**, the impact is less pronounced but still results in incorrect fee accounting.

*(Source: `launch-arbitrum-chain/02-configure-your-chain/common/gas/01-use-a-custom-gas-token-anytrust.md`, `launch-arbitrum-chain/02-configure-your-chain/common/fees/07-fee-management.md`)*

---

### Step 6: Deploy the Token Bridge (Optional but Recommended)

Deploy the canonical token bridge so ERC-20 tokens can move between parent and child chains. For custom gas token chains, there is an additional approval step:

1. **Approve the custom gas token for the `TokenBridgeCreator`** -- the `TokenBridgeCreator` needs allowance to spend custom gas tokens for retryable ticket fees:

```typescript
import {
  createTokenBridgeEnoughCustomFeeTokenAllowance,
  createTokenBridgePrepareCustomFeeTokenApprovalTransactionRequest,
} from '@arbitrum/chain-sdk';

const allowanceParams = {
  nativeToken,
  owner: rollupOwner.address,
  publicClient: parentChainPublicClient,
};

if (!(await createTokenBridgeEnoughCustomFeeTokenAllowance(allowanceParams))) {
  const approvalTxRequest =
    await createTokenBridgePrepareCustomFeeTokenApprovalTransactionRequest(allowanceParams);
  const approvalTxHash = await parentChainPublicClient.sendRawTransaction({
    serializedTransaction: await rollupOwner.signTransaction(approvalTxRequest),
  });
  await parentChainPublicClient.waitForTransactionReceipt({ hash: approvalTxHash });
}
```

2. **Deploy the token bridge** using `createTokenBridgePrepareTransactionRequest`
3. **Wait for retryable tickets** to execute on the child chain
4. **Note:** The WETH gateway step is **not needed** for custom gas token chains (it only applies to ETH-based chains)

When deploying a `TokenBridgeCreator` from scratch for custom gas token chains, set `BASECHAIN_WETH` to the **zero address** in your `.env` file.

*(Source: `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/05-deploying-token-bridge.md`, `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/07-canonical-factory-contracts.md`)*

---

### Step 7: Configure the Node and Start the Chain

After deploying the chain's contracts, generate the node configuration and start your chain's node. See the node configuration guide for details.

*(Source: `launch-arbitrum-chain/arbitrum-chain-sdk-introduction.md`)*

---

### Key Differences: AnyTrust vs. Rollup Custom Gas Token

| Aspect | AnyTrust | Rollup |
|---|---|---|
| **Fee Token Pricer** | Not required | Required (for exchange rate between custom token and parent chain's native token) |
| **Data Availability** | DAC stores data off-chain, only DACerts posted to parent chain | Full data posted to parent chain |
| **Exchange Rate Concerns** | Minimal -- batch poster costs are lower | Significant -- batch poster must convert tokens to ETH for L1 data posting |
| **Complexity** | Simpler configuration | Requires deploying and maintaining a pricer contract (e.g., `OwnerAdjustableExchangeRatePricer.sol`, `UniswapV2TwapPricer.sol`, or `TradeTracker.sol`) |
| **BoLD Requirement** | Not explicitly required for custom gas token | Required (BoLD must be enabled) |
| **L3 Support** | Supported | L3 support planned but not yet available |

*(Source: `launch-arbitrum-chain/features/common/gas-and-fees/choose-custom-gas-token.md`, `launch-arbitrum-chain/02-configure-your-chain/common/gas/02-use-a-custom-gas-token-rollup.md`)*

---

### Fee Handling on AnyTrust Chains with Custom Gas Tokens

- **On the child chain**: Gas costs are calculated and deducted in the custom token
- **For data posting to parent chain**: The sequencer or batch poster collects custom tokens as revenue but must convert them to the parent's native token (ETH) to cover posting costs. This is managed via an exchange rate mechanism
- **AnyTrust Advantage**: Simpler configuration compared to Rollup mode; doesn't require heavy pricer emphasis
- **Compatibility**: Works well with Alternative Data Availability (Alt-DA) providers like Celestia or EigenDA, which reduce conversion risks from token volatility

*(Source: `launch-arbitrum-chain/features/common/gas-and-fees/choose-custom-gas-token.md`)*

---

### SDK Support for Custom Gas Token Operations

The Arbitrum SDK provides APIs for custom gas token chains:

**EthBridger Context:**
- `getApproveGasTokenRequest` and `approveGasToken` -- for bridging native tokens to the Arbitrum chain. They facilitate the necessary approval for native tokens, allowing contracts to manage fund movements (escrow on parent chain, bridge to child chain).

**Erc20Bridger Context:**
- `getApproveGasTokenRequest` and `approveGasToken` -- for bridging ERC-20 assets. Adequate native tokens must be approved and allocated on the parent chain to cover retryable ticket submission and execution fees on the child chain.

**Important Notes:**
- These APIs are **only needed for custom gas token chains** (not for ETH-powered chains)
- When native tokens transfer to the custom gas token chain, they **function equivalently to ETH** on EVM chains
- The SDK automatically handles custom gas token code paths if the `L2Network` config has a `nativeToken` field

**Registering Custom Tokens in the Token Bridge:**
When registering a custom token on a custom-gas-token chain, there is an additional step before calling `registerTokenToL2`. The Token Bridge router and generic-custom gateway expect allowance to transfer the native token from `msg.sender()` to the inbox contract, so the token contract typically handles those approvals internally.

*(Source: `build-decentralized-apps/custom-gas-token-sdk.md`)*

---

### Example Scripts

The Chain SDK provides ready-to-use example scripts:

- **[`create-rollup-custom-fee-token`](https://github.com/OffchainLabs/arbitrum-chain-sdk/tree/main/examples/create-rollup-custom-fee-token)**: Creating an AnyTrust chain with a custom gas token
- **[`create-token-bridge-custom-fee-token`](https://github.com/OffchainLabs/arbitrum-chain-sdk/blob/main/examples/create-token-bridge-custom-fee-token/index.ts)**: Deploying a token bridge for a custom gas token chain
- **[`set-valid-keyset`](https://github.com/OffchainLabs/arbitrum-chain-sdk/blob/main/examples/set-valid-keyset/index.ts)**: Setting up the DAC keyset
- **[`custom-token-bridging`](https://github.com/OffchainLabs/arbitrum-tutorials/tree/master/packages/custom-token-bridging)**: Deploying and registering tokens in the Token Bridge of a custom-gas-token chain

*(Source: `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md`, `launch-arbitrum-chain/03-deploy-an-arbitrum-chain/05-deploying-token-bridge.md`, `build-decentralized-apps/custom-gas-token-sdk.md`)*

---

### Summary Checklist

1. Deploy or identify your ERC-20 token on the parent chain (must meet all requirements listed above)
2. Prepare chain config with `DataAvailabilityCommittee: true` using `prepareChainConfig`
3. Prepare deployment params config using `createRollupPrepareDeploymentParamsConfig`
4. Call `createRollup` with `nativeToken` set to your ERC-20 address (deployer must have sufficient tokens and grant allowance to `RollupCreator`)
5. Set up the DAC keyset in the SequencerInbox using `setValidKeyset`
6. **Reset parent chain fees**: `SetL1PricePerUnit(0)` and `SetL1PricingRewardRate(0)` via ArbOwner precompile (`0x0000000000000000000000000000000000000070`)
7. Deploy the token bridge with custom gas token approval (skip WETH gateway setup)
8. Configure and start your chain's node

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md` -- Decision guide and topic navigation
2. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/02-configure-your-chain/common/gas/01-use-a-custom-gas-token-anytrust.md` -- Primary guide for AnyTrust custom gas token configuration
3. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/features/common/gas-and-fees/choose-custom-gas-token.md` -- Overview of custom gas token feature, key concepts, and compatibility
4. `.claude/skills/arbitrum-skills/build-decentralized-apps/custom-gas-token-sdk.md` -- SDK APIs for custom gas token chains
5. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/02-configure-your-chain/common/gas/02-use-a-custom-gas-token-rollup.md` -- Rollup custom gas token guide (for comparison)
6. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/03-deploy-an-arbitrum-chain/02-deploying-an-arbitrum-chain.md` -- Chain deployment guide with RollupDeploymentParams and Config structs
7. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/features/common/data-availability/choose-anytrust.md` -- AnyTrust data availability configuration
8. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/01-a-gentle-introduction.md` -- Introduction to Arbitrum chains
9. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/03-deploy-an-arbitrum-chain/05-deploying-token-bridge.md` -- Token bridge deployment with custom gas token approval steps
10. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/02-configure-your-chain/common/gas/configure-native-mint-burn-gas-token.md` -- Native mint/burn gas token feature (alternative approach)
11. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/arbitrum-chain-sdk-introduction.md` -- Chain SDK overview and deployment process
12. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/03-deploy-an-arbitrum-chain/07-canonical-factory-contracts.md` -- RollupCreator and TokenBridgeCreator contract addresses
13. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/features/common/gas-and-fees/choose-native-eth.md` -- Native ETH option (for comparison)
14. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/02-configure-your-chain/common/fees/07-fee-management.md` -- Fee management and ArbOwner precompile usage
15. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/features/common/gas-and-fees/choose-fee-rebates.md` -- Fee distribution information
