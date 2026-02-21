# Q4 Without Skill: Cross-Chain Messaging Between Ethereum L1 and Arbitrum L2

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "How does cross-chain messaging work between Ethereum (L1) and Arbitrum (L2)? Explain both L1-to-L2 and L2-to-L1 directions with exact function signatures, address aliasing mechanics, timing, and code examples."

---

## Answer

### Overview

Arbitrum uses a native cross-chain messaging system that allows contracts on Ethereum L1 and Arbitrum L2 to communicate with each other. The two directions have fundamentally different trust models and timing characteristics:

- **L1-to-L2 (Deposits / Retryable Tickets):** Messages are submitted on L1, included by the Sequencer, and execute on L2 typically within ~10-15 minutes. They are trust-minimized because L1 is the source of truth.
- **L2-to-L1 (Withdrawals / Outbox):** Messages are initiated on L2, but must wait for the dispute/challenge period (~7 days on mainnet) before they can be executed on L1. This delay is inherent to Optimistic Rollup security.

---

### Key Contracts

| Contract | Network | Purpose |
|----------|---------|---------|
| `Inbox` | L1 | Entry point for L1-to-L2 messages |
| `Bridge` | L1 | Core bridge contract |
| `Outbox` | L1 | Executes confirmed L2-to-L1 messages on L1 |
| `ArbSys` | L2 (precompile at `0x0000000000000000000000000000000000000064`) | System precompile for L2-to-L1 messaging |
| `ArbRetryableTx` | L2 (precompile at `0x000000000000000000000000000000000000006E`) | Manage retryable tickets |
| `NodeInterface` | L2 (virtual at `0x00000000000000000000000000000000000000C8`) | Helper for gas estimation and proof generation |

---

### L1-to-L2 Messaging (Retryable Tickets)

#### Mechanism

When you want to send a message from L1 to L2, you create a **Retryable Ticket**. This is a special L2 transaction that is created from L1 and will execute on L2. The key function on the Inbox contract is:

```solidity
function createRetryableTicket(
    address to,
    uint256 l2CallValue,
    uint256 maxSubmissionCost,
    address excessFeeRefundAddress,
    address callValueRefundAddress,
    uint256 gasLimit,
    uint256 maxFeePerGas,
    bytes calldata data
) external payable returns (uint256);
```

**Parameters explained:**

- `to`: The L2 destination address
- `l2CallValue`: ETH value to send to `to` on L2
- `maxSubmissionCost`: The maximum amount of ETH to pay for the base submission fee on L2. This covers the cost of posting the retryable ticket data. Any excess is refunded to `excessFeeRefundAddress`.
- `excessFeeRefundAddress`: Address on L2 that receives excess fee refunds
- `callValueRefundAddress`: Address on L2 that receives the `l2CallValue` if the retryable ticket is cancelled or expires without execution
- `gasLimit`: Maximum gas for the L2 execution
- `maxFeePerGas`: Maximum gas price for the L2 execution
- `data`: The calldata for the L2 transaction

**Total ETH required (sent as `msg.value`):**
```
msg.value >= maxSubmissionCost + l2CallValue + (gasLimit * maxFeePerGas)
```

There is also an "unsafe" variant that does not apply address aliasing to the refund addresses:

```solidity
function unsafeCreateRetryableTicket(
    address to,
    uint256 l2CallValue,
    uint256 maxSubmissionCost,
    address excessFeeRefundAddress,
    address callValueRefundAddress,
    uint256 gasLimit,
    uint256 maxFeePerGas,
    bytes calldata data
) external payable returns (uint256);
```

#### Retryable Ticket Lifecycle

1. **Submission:** The L1 transaction calls `createRetryableTicket` on the Inbox. This deposits ETH and creates a retryable ticket on L2.
2. **Auto-redeem:** The Sequencer will automatically attempt to execute the retryable ticket on L2. If the provided gas is sufficient, this succeeds immediately.
3. **Manual redeem (if auto-redeem fails):** If the auto-redeem fails (e.g., insufficient gas, revert), anyone can manually redeem the ticket by calling `redeem(bytes32 ticketId)` on the `ArbRetryableTx` precompile at `0x000000000000000000000000000000000000006E`. The ticket has a lifetime (default ~7 days) during which it can be redeemed.
4. **Cancellation / Expiry:** If not redeemed within the lifetime, the ticket expires and the `callValueRefundAddress` receives any remaining value.

#### Simple L1-to-L2 Message (depositEth)

For simple ETH deposits:

```solidity
function depositEth() external payable returns (uint256);
```

This is a simpler function that just deposits ETH to the sender's aliased address on L2.

#### Timing

- L1-to-L2 messages typically arrive on L2 within **~10-15 minutes** after the L1 transaction is confirmed, depending on the Sequencer's inclusion behavior.
- If the Sequencer is down or censoring, messages are force-included after a delay (currently ~24 hours via the delayed inbox mechanism).

#### Code Example: L1 Contract Sending a Message to L2

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IInbox {
    function createRetryableTicket(
        address to,
        uint256 l2CallValue,
        uint256 maxSubmissionCost,
        address excessFeeRefundAddress,
        address callValueRefundAddress,
        uint256 gasLimit,
        uint256 maxFeePerGas,
        bytes calldata data
    ) external payable returns (uint256);
}

contract L1Sender {
    IInbox public inbox;

    constructor(address _inbox) {
        inbox = IInbox(_inbox);
    }

    function sendMessageToL2(
        address l2Target,
        bytes calldata l2Calldata,
        uint256 maxSubmissionCost,
        uint256 gasLimit,
        uint256 maxFeePerGas
    ) external payable returns (uint256) {
        uint256 ticketId = inbox.createRetryableTicket{value: msg.value}(
            l2Target,           // to
            0,                  // l2CallValue (no ETH to send with the call)
            maxSubmissionCost,  // maxSubmissionCost
            msg.sender,         // excessFeeRefundAddress (NOTE: will be aliased on L2)
            msg.sender,         // callValueRefundAddress (NOTE: will be aliased on L2)
            gasLimit,           // gasLimit
            maxFeePerGas,       // maxFeePerGas
            l2Calldata          // data
        );
        return ticketId;
    }
}
```

#### Code Example: L2 Contract Receiving a Message from L1

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract L2Receiver {
    address public l1Sender; // The L1 contract address (NOT aliased)

    constructor(address _l1Sender) {
        l1Sender = _l1Sender;
    }

    /// @notice Apply L1-to-L2 address aliasing
    function applyAlias(address l1Address) internal pure returns (address) {
        return address(uint160(l1Address) + uint160(0x1111000000000000000000000000000000001111));
    }

    function receiveFromL1(uint256 someValue) external {
        // When an L1 contract calls L2 via retryable ticket,
        // msg.sender is the ALIASED address of the L1 contract
        require(
            msg.sender == applyAlias(l1Sender),
            "Only callable from L1 sender"
        );

        // Process the message
        // ...
    }
}
```

---

### Address Aliasing

Address aliasing is a critical safety mechanism. When an L1 **contract** sends a message to L2, the `msg.sender` on L2 is not the L1 contract's address directly. Instead, it is the **aliased** version:

```
L2 alias = L1 address + 0x1111000000000000000000000000000000001111
```

More precisely, this is modular arithmetic over `uint160`:

```solidity
function applyL1ToL2Alias(address l1Address) internal pure returns (address l2Address) {
    unchecked {
        l2Address = address(uint160(l1Address) + uint160(0x1111000000000000000000000000000000001111));
    }
}
```

And the reverse (undoing the alias):

```solidity
function undoL1ToL2Alias(address l2Address) internal pure returns (address l1Address) {
    unchecked {
        l1Address = address(uint160(l2Address) - uint160(0x1111000000000000000000000000000000001111));
    }
}
```

**Why aliasing exists:**

- On L1, contracts and EOAs have entirely different security properties. A contract on L1 might have a specific address, but an EOA could exist at the "same" address on L2.
- Without aliasing, an attacker could deploy a contract on L1 at address X, send a message to L2, and L2 would think it came from address X -- but address X on L2 might be an EOA controlled by someone else, or a different contract entirely.
- The alias offset `0x1111000000000000000000000000000000001111` ensures that L1 contract addresses are mapped to a distinct space on L2 that would not collide with normal addresses.

**Important:** Address aliasing only applies to **contracts** calling from L1. When an EOA sends a transaction from L1 (e.g., via `depositEth()`), no aliasing is applied because EOAs have the same private key on both L1 and L2.

**When using `unsafeCreateRetryableTicket`:** The "unsafe" variant does NOT apply aliasing to the `excessFeeRefundAddress` and `callValueRefundAddress`. This is useful when the L1 contract knows the exact L2 address it wants refunds sent to. However, the `msg.sender` on L2 is still aliased for the actual retryable execution.

---

### L2-to-L1 Messaging (Withdrawals / Outbox)

#### Mechanism

L2-to-L1 messaging uses the `ArbSys` precompile on L2 and the `Outbox` contract on L1:

**Step 1: Initiate on L2 via ArbSys**

The key function on `ArbSys` (at `0x0000000000000000000000000000000000000064`):

```solidity
function sendTxToL1(
    address destination,
    bytes calldata data
) external payable returns (uint256);
```

This emits an `L2ToL1Tx` event (sometimes referenced as `L2ToL1Transaction` in older versions):

```solidity
event L2ToL1Tx(
    address caller,
    address indexed destination,
    uint256 indexed hash,
    uint256 indexed position,
    uint256 arbBlockNum,
    uint256 ethBlockNum,
    uint256 timestamp,
    uint256 callvalue,
    bytes data
);
```

**Step 2: Wait for the challenge period (~7 days)**

After the L2 transaction is included in an RBlock (Rollup Block) that gets confirmed on L1, there is a dispute window. On Arbitrum One mainnet, this is approximately **7 days**. During this period, validators can challenge the state assertion. Only after the RBlock is confirmed can the L2-to-L1 message be executed on L1.

**Step 3: Execute on L1 via the Outbox**

Once the challenge period passes and the RBlock is confirmed, anyone can execute the message on L1 by calling:

```solidity
function executeTransaction(
    bytes32[] calldata proof,
    uint256 index,
    address l2Sender,
    address to,
    uint256 l2Block,
    uint256 l1Block,
    uint256 l2Timestamp,
    uint256 value,
    bytes calldata data
) external;
```

The `proof` is a Merkle proof showing the L2-to-L1 message is included in the confirmed output root. The Arbitrum SDK provides utilities to generate this proof.

#### Checking the L2 Sender on L1

When the Outbox executes the transaction on L1, the L1 target contract can verify who sent the message from L2:

```solidity
interface IOutbox {
    function l2ToL1Sender() external view returns (address);
}
```

This function returns the original L2 sender address during the execution context of `executeTransaction`. **Note:** Unlike L1-to-L2 messaging, there is NO address aliasing for L2-to-L1 messages. The `l2ToL1Sender()` returns the original L2 address.

#### Code Example: L2 Contract Sending a Message to L1

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IArbSys {
    function sendTxToL1(
        address destination,
        bytes calldata data
    ) external payable returns (uint256);
}

contract L2Sender {
    // ArbSys precompile address
    address constant ARBSYS = 0x0000000000000000000000000000000000000064;

    event L2ToL1MessageSent(uint256 indexed withdrawalId);

    function sendMessageToL1(
        address l1Target,
        bytes calldata l1Calldata
    ) external payable returns (uint256) {
        uint256 withdrawalId = IArbSys(ARBSYS).sendTxToL1{value: msg.value}(
            l1Target,
            l1Calldata
        );

        emit L2ToL1MessageSent(withdrawalId);
        return withdrawalId;
    }
}
```

#### Code Example: L1 Contract Receiving a Message from L2

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOutbox {
    function l2ToL1Sender() external view returns (address);
}

interface IBridge {
    function activeOutbox() external view returns (address);
}

contract L1Receiver {
    address public bridge;    // The Arbitrum Bridge contract on L1
    address public l2Sender;  // The expected L2 sender contract

    constructor(address _bridge, address _l2Sender) {
        bridge = _bridge;
        l2Sender = _l2Sender;
    }

    modifier onlyFromL2() {
        // Get the active outbox from the bridge
        IOutbox outbox = IOutbox(IBridge(bridge).activeOutbox());

        // Verify the L2 sender
        require(
            outbox.l2ToL1Sender() == l2Sender,
            "Only callable from expected L2 sender"
        );
        _;
    }

    function receiveFromL2(uint256 someValue) external onlyFromL2 {
        // Process the message
        // ...
    }
}
```

---

### Timing Summary

| Direction | Typical Time | Notes |
|-----------|-------------|-------|
| L1 -> L2 | ~10-15 minutes | After L1 tx confirmation. Sequencer includes the retryable ticket. |
| L2 -> L1 | ~7 days | Must wait for the challenge/dispute period on mainnet. |
| L1 -> L2 (force inclusion) | ~24 hours | If the Sequencer is not including the message, the delayed inbox force-includes it. |

---

### Using the Arbitrum SDK (JavaScript/TypeScript)

The Arbitrum SDK (`@arbitrum/sdk`) provides high-level utilities for cross-chain messaging:

#### L1-to-L2 Example (Conceptual)

```typescript
import { L1ToL2MessageGasEstimator } from '@arbitrum/sdk';
import { getBaseFee } from '@arbitrum/sdk/dist/lib/utils/lib';

// Estimate gas parameters for a retryable ticket
const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider);

const submissionPriceWei = await l1ToL2MessageGasEstimate.estimateSubmissionFee(
    l1Provider,
    await getBaseFee(l1Provider),
    callDataLength
);

const gasEstimate = await l1ToL2MessageGasEstimate.estimateRetryableTicketGasLimit({
    from: l1ContractAddress, // Will be aliased on L2
    to: l2TargetAddress,
    l2CallValue: BigNumber.from(0),
    excessFeeRefundAddress: refundAddress,
    callValueRefundAddress: refundAddress,
    data: l2Calldata,
});
```

#### L2-to-L1 Example (Conceptual)

```typescript
import { L2ToL1MessageStatus, L2TransactionReceipt } from '@arbitrum/sdk';

// Get L2 transaction receipt
const l2Receipt = new L2TransactionReceipt(
    await l2Provider.getTransactionReceipt(l2TxHash)
);

// Get the L2-to-L1 messages
const messages = await l2Receipt.getL2ToL1Messages(l1Signer);

// Check status (will be UNCONFIRMED during challenge period)
const status = await messages[0].status(l2Provider);

if (status === L2ToL1MessageStatus.CONFIRMED) {
    // Execute on L1 (after challenge period)
    const tx = await messages[0].execute(l2Provider);
    await tx.wait();
}
```

---

### Additional Details

#### Force Inclusion (Delayed Inbox)

If the Sequencer censors or is offline, users can force-include messages through the **delayed inbox**. Messages submitted to the delayed inbox will be force-included after a delay (~24 hours). The typical force-inclusion mechanism involves:

1. Submitting to the delayed inbox
2. Waiting for the force-inclusion delay
3. Calling `forceInclusion()` on the `SequencerInbox`

#### ETH Deposits

For simple ETH transfers from L1 to L2:

```solidity
// On the Inbox contract
function depositEth() external payable returns (uint256);
```

Or simply sending ETH directly to the Inbox contract address triggers a deposit.

#### Token Bridging

Token bridging (ERC-20, ERC-721) is built on top of this retryable ticket mechanism through the **Gateway Router** system. The standard ERC-20 bridge uses:
- `L1GatewayRouter` on L1
- `L2GatewayRouter` on L2
- Various gateway implementations (StandardGateway, CustomGateway, WethGateway)

These gateways internally use `createRetryableTicket` for L1-to-L2 and `sendTxToL1` for L2-to-L1 token transfers.

---

### Summary of Key Differences

| Aspect | L1 to L2 (Retryable Tickets) | L2 to L1 (Outbox) |
|---|---|---|
| **Timing** | ~10-15 minutes | ~7 days (challenge period) |
| **Mechanism** | Inbox + Retryable Ticket | ArbSys precompile + Outbox |
| **Execution** | Auto-redeemed (or manually retried) | Must be manually executed on L1 with Merkle proof |
| **Retry** | Yes, retryable for ~7 days | No retry needed; once confirmed, can be executed anytime |
| **Address aliasing** | Yes (for contract senders, offset by `0x1111...1111`) | No (Outbox is the msg.sender; use `l2ToL1Sender()`) |
| **Cost** | Pays L1 gas + L2 gas + submission fee | Pays L2 gas for sending; L1 gas for execution |
| **Trust model** | Message is delivered as long as sequencer is live | Security relies on the challenge/fraud proof mechanism |

---

## Things I Am Less Certain About

1. **Exact timing for L1-to-L2 inclusion:** I stated ~10-15 minutes, but the actual time can vary. In practice it can be faster (as low as ~10 minutes) or occasionally slower. The exact guarantee depends on the Sequencer's behavior and L1 finality requirements.

2. **Force inclusion delay:** I stated ~24 hours for the delayed inbox force-inclusion window. This value may have been updated. I recall it being approximately 24 hours on mainnet, but the exact parameter should be verified against the current contract configuration.

3. **`L2ToL1Tx` event signature:** The exact event name and field ordering may have changed across Arbitrum Nitro versions. Older (Classic) Arbitrum used `L2ToL1Transaction`, and Nitro updated this. I believe my representation is correct for Nitro but the exact field names and indexed parameters should be verified.

4. **`Outbox.executeTransaction` exact parameter list:** I am fairly confident in the general shape of this function, but the exact parameter order and types may differ slightly from what I have written. The Arbitrum codebase has evolved, and I may be mixing up parameter orderings. The proof structure (Merkle proof as `bytes32[]`) is correct conceptually.

5. **Arbitrum SDK class names and API:** The SDK has been updated multiple times. The class names like `L1ToL2MessageGasEstimator`, `L2TransactionReceipt`, and method names may have changed in newer SDK versions (v3+). My examples reflect what I recall from the v2.x era.

6. **`unsafeCreateRetryableTicket` aliasing behavior:** I stated that `msg.sender` is still aliased even with the unsafe variant, but that the refund addresses are not aliased. I am fairly confident this is correct but less than 100% certain about the exact semantics.

7. **ArbRetryableTx precompile address:** I listed `0x6E` (110 in decimal). I believe this is correct for Arbitrum Nitro but should be double-checked.

8. **NodeInterface address:** I listed `0xC8` (200 in decimal). This is a virtual contract that does not actually exist on-chain but is intercepted by the node. I am fairly confident in the address but it should be verified.

9. **Challenge period on mainnet:** I stated 7 days, which is the commonly cited figure. The exact parameter is configurable and could technically be different, though 7 days has been the standard for Arbitrum One.

10. **`depositEth` return value:** I indicated it returns a `uint256`, which I believe is the message number, but the exact return type should be verified against the current Inbox ABI.

11. **Changes with BoLD:** Arbitrum has been evolving with BoLD (Bounded Liquidity Delay) for the dispute protocol. Some details about the dispute mechanism and confirmation timing may have changed, though the user-facing L2-to-L1 delay is intended to remain similar.
