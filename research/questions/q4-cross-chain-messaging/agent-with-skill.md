# Q4 With Skill: Cross-Chain Messaging Between Ethereum L1 and Arbitrum L2

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 11
**Question:** "How does cross-chain messaging work between Ethereum (L1) and Arbitrum (L2)? Explain both L1-to-L2 and L2-to-L1 directions with exact function signatures, address aliasing mechanics, timing, and code examples."

---

## Answer

Cross-chain messaging in Arbitrum enables arbitrary contract calls between Ethereum (parent/L1) and Arbitrum (child/L2) in both directions. The two directions differ significantly in mechanism, timing, trust assumptions, and execution model.

---

### Part 1: L1-to-L2 Messaging (Parent to Child Chain)

There are three primary categories of L1-to-L2 messaging:

1. **Native token bridging** (ETH deposits)
2. **Transactions via the Delayed Inbox** (signed and unsigned messages)
3. **Retryable tickets** (the canonical method for arbitrary cross-chain calls)

#### 1.1 Native ETH Deposits

The simplest path for depositing ETH from L1 to L2 is calling `depositEth()` on the `Inbox` contract:

```solidity
function depositEth() public payable whenNotPaused onlyAllowed returns (uint256)
```

**How it works:** ETH is sent to the Bridge contract on L1. The bridge credits the deposited amount to the designated address on L2. The funds are held in the bridge contract on behalf of the user.

**Important caveats:**
- Depositing ETH via `depositEth` to a contract on L2 will **not** invoke that contract's fallback function.
- If the caller is an **EOA**, the ETH appears at the same address on L2.
- If the caller is a **contract**, the ETH is deposited to the **aliased address** on L2 (see Address Aliasing below).
- If the caller is a **7702-enabled account** (EOA with temporary contract code), the ETH goes to the aliased address as well.

The actual `depositEth` implementation from the Inbox contract applies aliasing conditionally:

```solidity
function depositEth() public payable whenNotPaused onlyAllowed returns (uint256) {
    address dest = msg.sender;

    if (AddressUpgradeable.isContract(msg.sender) || tx.origin != msg.sender) {
        dest = AddressAliasHelper.applyL1ToL2Alias(msg.sender);
    }

    return _deliverMessage(
        L1MessageType_ethDeposit, msg.sender, abi.encodePacked(dest, msg.value), msg.value
    );
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/Inbox.md` (lines 205-224)

#### 1.2 Transactions via the Delayed Inbox

The Delayed Inbox on L1 can deliver arbitrary messages to L2. This is critical for two reasons: (1) general cross-chain messaging, and (2) censorship resistance if the Sequencer misbehaves.

Messages can be **signed** or **unsigned**.

##### Signed Messages

Signed messages let an L1 EOA prove ownership, so `msg.sender` on L2 equals the signer's address (no aliasing). Two methods are available:

```solidity
// Flexible, callable by EOA or contract. Emits event log with signed tx data.
function sendL2Message(
    bytes calldata messageData
) external whenNotPaused onlyAllowed returns (uint256);

// Gas-optimized, only callable by a codeless EOA. Tx data retrieved from calldata directly.
function sendL2MessageFromOrigin(
    bytes calldata messageData
) external whenNotPaused onlyAllowed returns (uint256);
```

Source: `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 127-151), `smart-contracts/nitro-contracts/src/bridge/AbsInbox.md` (lines 142-159)

##### Unsigned Messages

Unsigned messages do not include an EOA signature. The sender's address **must be aliased** on L2 for security. Four methods exist, divided by caller type and whether L1 funds are included:

**From EOAs (include nonce for replay protection):**

```solidity
// With L1 funds transferred to L2
function sendL1FundedUnsignedTransaction(
    uint256 gasLimit,
    uint256 maxFeePerGas,
    uint256 nonce,
    address to,
    bytes calldata data
) external payable returns (uint256);

// No L1 funds transferred; uses existing L2 balance
function sendUnsignedTransaction(
    uint256 gasLimit,
    uint256 maxFeePerGas,
    uint256 nonce,
    address to,
    uint256 value,
    bytes calldata data
) external whenNotPaused onlyAllowed returns (uint256);
```

**From Contracts:**

```solidity
// No new funds from L1; uses existing L2 balance
function sendContractTransaction(
    uint256 gasLimit,
    uint256 maxFeePerGas,
    address to,
    uint256 value,
    bytes calldata data
) external whenNotPaused onlyAllowed returns (uint256);

// With L1 funds transferred to L2
function sendL1FundedContractTransaction(
    uint256 gasLimit,
    uint256 maxFeePerGas,
    address to,
    bytes calldata data
) external payable returns (uint256);
```

Source: `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 153-214), `smart-contracts/nitro-contracts/src/bridge/Inbox.md` (lines 51-102), `smart-contracts/nitro-contracts/src/bridge/AbsInbox.md` (lines 162-215)

#### 1.3 Retryable Tickets (Canonical L1-to-L2 Method)

Retryable tickets are **Arbitrum's canonical mechanism** for creating L1-to-L2 messages. A retryable is submitted for a fixed cost on L1 (dependent only on calldata size); its submission on L1 is separable/asynchronous from its execution on L2. Retryables provide atomicity between the cross-chain operations: if the L1 transaction to request submission succeeds (does not revert), then the execution of the retryable on L2 has a strong guarantee to succeed.

##### Core Function Signature

```solidity
function createRetryableTicket(
    address to,                        // Destination L2 contract address
    uint256 l2CallValue,               // Call value for the L2 message
    uint256 maxSubmissionCost,          // Max ETH for submitting the ticket
    address excessFeeRefundAddress,     // Receives unused gas + submission cost refund
    address callValueRefundAddress,     // Receives l2CallValue if ticket expires/cancelled (the "beneficiary")
    uint256 gasLimit,                   // Max gas for L2 execution
    uint256 maxFeePerGas,              // Gas price bid for L2 execution
    bytes calldata data                // Calldata for the L2 message
) external payable whenNotPaused onlyAllowed returns (uint256);
```

There is also an **unsafe** variant that bypasses sanity checks (no deposit validation, no automatic aliasing of refund addresses):

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
) public payable whenNotPaused onlyAllowed returns (uint256);
```

Source: `smart-contracts/nitro-contracts/src/bridge/Inbox.md` (lines 264-309)

##### Complete Parameter Details

| Parameter | Description |
|-----------|-------------|
| `l1CallValue` (msg.value / deposit) | Not a real function parameter; the `callValue` sent with the transaction. Must be >= `maxSubmissionCost + l2CallValue + gasLimit * maxFeePerGas` |
| `to` | Destination L2 contract address |
| `l2CallValue` | The callvalue for the retryable L2 message, supplied within the deposit |
| `maxSubmissionCost` | Maximum ETH payable for submitting the ticket. Directly proportional to retryable's data size and L1 basefee |
| `excessFeeRefundAddress` | Receives: `(gasLimit * maxFeePerGas - executionCost) + (maxSubmission - (autoredeem ? 0 : submissionCost))`. Note: excess deposit goes to alias of L1 tx's `msg.sender`, not this address |
| `callValueRefundAddress` | L2 address credited with `l2CallValue` if ticket times out or is cancelled. This is also the "beneficiary" who can cancel the ticket |
| `gasLimit` | Maximum gas for L2 execution of the ticket |
| `maxFeePerGas` | Gas price bid for L2 execution, supplied within the deposit |
| `data` | Calldata to the destination L2 address |

Source: `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 241-254)

##### Deposit Requirement

```
msg.value >= maxSubmissionCost + l2CallValue + gasLimit * maxFeePerGas
```

##### Submission Fee Calculation

The submission fee is calculated in the Inbox contract:

```solidity
function calculateRetryableSubmissionFee(
    uint256 dataLength,
    uint256 baseFee
) public view returns (uint256) {
    // Use current block basefee if baseFee parameter is 0
    return (1400 + 6 * dataLength) * (baseFee == 0 ? block.basefee : baseFee);
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/Inbox.md` (lines 312-318)

##### Safety Checks in `createRetryableTicket`

The safe `createRetryableTicket` method performs several sanity checks that `unsafeCreateRetryableTicket` bypasses:

1. **Deposit validation:** Ensures the user's deposit is enough to cover `maxSubmissionCost + l2CallValue + gasLimit * maxFeePerGas`.
2. **Automatic aliasing of refund addresses:** If `excessFeeRefundAddress` or `callValueRefundAddress` is a contract, it is automatically aliased so the L1 contract can recover funds on L2.

```solidity
// From AbsInbox._createRetryableTicket:
if (AddressUpgradeable.isContract(excessFeeRefundAddress)) {
    excessFeeRefundAddress = AddressAliasHelper.applyL1ToL2Alias(excessFeeRefundAddress);
}
if (AddressUpgradeable.isContract(callValueRefundAddress)) {
    callValueRefundAddress = AddressAliasHelper.applyL1ToL2Alias(callValueRefundAddress);
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/AbsInbox.md` (lines 222-266)

##### Retryable Ticket Lifecycle

**Phase 1 -- Submission:**
1. User calls `Inbox.createRetryableTicket` on L1.
2. System validates deposit is sufficient.
3. A ticket with a unique `TicketID` is created and added to the retryable buffer on L2.
4. Funds (`submissionCost + l2CallValue`) are deducted from the sender and placed into escrow on L2.
5. `ArbRetryableTx` precompile emits a `TicketCreated` event with the `ticketId`.

**Phase 2 -- Automatic Redemption:**
After ticket creation, the system checks two conditions:
- User's L2 balance >= `maxFeePerGas * gasLimit` **AND**
- `maxFeePerGas` >= current `l2BaseFee`

If both are met, an auto-redeem is attempted:

- **On success:** The ticket executes with the original sender, destination, callvalue, and calldata. The submission fee is refunded to `excessFeeRefundAddress`. Unused gas refunded as `(gasLimit - gasUsed) * gasPrice` to `callValueRefundAddress`.
- **On failure:** The submission fee is collected to cover temporary storage for **one week**, and manual redemption is required.

**Phase 3 -- Manual Redemption (if auto-redeem fails):**
- Anyone can call `ArbRetryableTx.redeem(ticketId)` on L2 (precompile at `0x000000000000000000000000000000000000006E`).
- The redeem call's gas is donated to the execution attempt. The gas is **not** limited by the original `gasLimit`.
- ArbOS enqueues the redeem before moving on to the next non-redeem transaction in the block.
- If the 7-day period elapses without a successful redeem, the ticket **expires** and is automatically discarded, unless someone pays a fee to keep the ticket alive for another period via `keepalive`.

**Phase 4 -- Expiration/Cancellation:**
- If expired or cancelled without successful execution, the escrowed `callValue` is refunded to `callValueRefundAddress`.
- **Warning:** Any associated messages and values (excluding the escrowed `callValue`) may be **permanently lost** if a ticket is not redeemed or rescheduled within seven days.

Source: `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 231-356)

##### Receipts

Two types of L2 transaction receipts are emitted during a retryable ticket's lifecycle:

1. **Ticket creation receipt:** Indicates successful ticket creation. Includes a `TicketCreated` event from `ArbRetryableTx` with a `ticketId` field.
2. **Redeem attempt receipt:** Represents the result of an attempted L2 execution (success/failure). Includes a `RedeemScheduled` event with a `ticketId` field. At most one successful redeem receipt exists per ticket.

##### SDK Example: ETH Deposit

```typescript
const childNetwork = await getArbitrumNetwork(42161)
const ethBridger = new EthBridger(childNetwork)

const ethDepositTxResponse = await ethBridger.deposit({
  amount: utils.parseEther('23'),
  parentSigner,  // ethers v5 signer connected to mainnet Ethereum
  childProvider, // ethers v5 provider connected to Arbitrum One
})

const ethDepositTxReceipt = await ethDepositTxResponse.wait()
```

Source: `sdk/index.md` (lines 43-61)

##### SDK Example: Redeeming a Failed Retryable

```typescript
import {
  ParentTransactionReceipt,
  ParentToChildMessageStatus,
} from '@arbitrum/sdk'

const parentTxnReceipt = new ParentTransactionReceipt(txnReceipt)

const parentToChildMessage = (
  await parentTxnReceipt.getParentToChildMessages(childSigner)
)[0]

const res = await parentToChildMessage.waitForStatus()

if (res.status === ParentToChildMessageStatus.Child) {
  // Message wasn't auto-redeemed; redeem it now:
  const response = await parentToChildMessage.redeem()
  const receipt = await response.wait()
} else if (res.status === ParentToChildMessageStatus.REDEEMED) {
  // Message successfully redeemed
}
```

Source: `sdk/index.md` (lines 96-129)

##### Retryable Dashboard

Failed retryable tickets can also be redeemed using the [Arbitrum Retryables Transaction Panel](https://retryable-dashboard.arbitrum.io/tx).

---

### Part 2: Address Aliasing Mechanics

Address aliasing is a critical security mechanism that applies to all unsigned messages crossing from L1 to L2.

#### The Problem

Without aliasing, a malicious actor could deploy a contract on L1 at a specific address, then use cross-chain messaging to impersonate whatever contract exists at that same address on L2. This would break access control on L2 contracts that trust `msg.sender`.

#### The Formula

```
L2_Alias = L1_Contract_Address + 0x1111000000000000000000000000000000001111
```

#### `AddressAliasHelper` Library (Full Solidity Source)

```solidity
// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

library AddressAliasHelper {
    uint160 internal constant OFFSET = uint160(0x1111000000000000000000000000000000001111);

    /// @notice Converts the L1 address that submitted a tx to the inbox
    ///         to the msg.sender viewed on L2
    /// @param l1Address the address on L1 that triggered the tx to L2
    /// @return l2Address L2 address as viewed in msg.sender
    function applyL1ToL2Alias(
        address l1Address
    ) internal pure returns (address l2Address) {
        unchecked {
            l2Address = address(uint160(l1Address) + OFFSET);
        }
    }

    /// @notice Converts the msg.sender viewed on L2 back to the
    ///         original L1 address that submitted a tx to the inbox
    /// @param l2Address L2 address as viewed in msg.sender
    /// @return l1Address the address on L1 that triggered the tx to L2
    function undoL1ToL2Alias(
        address l2Address
    ) internal pure returns (address l1Address) {
        unchecked {
            l1Address = address(uint160(l2Address) - OFFSET);
        }
    }
}
```

Source: `smart-contracts/nitro-contracts/src/libraries/AddressAliasHelper.md`

#### When Aliasing Applies

| Caller Type | Aliased? | Notes |
|---|---|---|
| EOA with signed message | No | Signature proves EOA ownership |
| EOA with unsigned message | Yes | No signature to prove identity |
| Contract (any message) | Yes | Always aliased to prevent impersonation |
| EIP-7702 account | Yes | Has runtime code, treated like contract |

#### Using Aliasing in L2 Contracts

To verify that a cross-chain call came from a specific L1 contract, use `undoL1ToL2Alias`:

```solidity
modifier onlyFromMyL1Contract() override {
    require(
        AddressAliasHelper.undoL1ToL2Alias(msg.sender) == myL1ContractAddress,
        "ONLY_COUNTERPART_CONTRACT"
    );
    _;
}
```

Source: `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 67-88)

#### Where Aliasing Is Applied in the Code

All messages delivered through the Inbox have their sender aliased at the bridge level in `Inbox._deliverToBridge`:

```solidity
function _deliverToBridge(
    uint8 kind,
    address sender,
    bytes32 messageDataHash,
    uint256 amount
) internal override returns (uint256) {
    return IEthBridge(address(bridge)).enqueueDelayedMessage{value: amount}(
        kind, AddressAliasHelper.applyL1ToL2Alias(sender), messageDataHash
    );
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/Inbox.md` (lines 320-329)

---

### Part 3: L2-to-L1 Messaging (Child to Parent Chain)

L2-to-L1 messaging uses Arbitrum's **Outbox** system. Unlike L1-to-L2 retryable tickets (which can auto-execute), L2-to-L1 messages require **manual execution** on L1 because Ethereum does not support scheduled execution.

#### 3.1 Protocol Flow

1. **Message creation on L2:** A user or contract calls `ArbSys.sendTxToL1` on the `ArbSys` precompile.
2. **Inclusion in an assertion:** The message is batched with other transactions and included in a Rollup assertion.
3. **Challenge period (~6.4 days):** The assertion is submitted to the Rollup contract on L1 and enters the dispute window.
4. **Assertion confirmation:** If unchallenged after the dispute window, the Rollup contract finalizes the assertion. The assertion's Merkle root is posted to the Outbox contract on L1.
5. **Execution on L1:** Anyone can execute the message on L1 by proving its inclusion via `Outbox.executeTransaction`.

#### 3.2 Sending a Message from L2 to L1

The `ArbSys` precompile is located at address `0x0000000000000000000000000000000000000064` (decimal: 100).

```solidity
// Send arbitrary L2-to-L1 message
ArbSys(0x0000000000000000000000000000000000000064).sendTxToL1(destAddress, calldataForL1);
```

For ETH withdrawals, use the convenience method:

```solidity
// Withdraw ETH from L2 to L1
ArbSys(0x0000000000000000000000000000000000000064).withdrawEth{value: 2300000}(destAddress);
```

`withdrawEth` is equivalent to calling `sendTxToL1` with empty calldata. Upon withdrawing, the Ether balance is **burned** on the L2 side and will later be made available on the L1 side. In both cases, an additional call to `Outbox.executeTransaction` on L1 is required after the challenge period.

Source: `how-arbitrum-works/deep-dives/l2-to-l1-messaging.md` (lines 30-98)

#### 3.3 Retrieving the Outbox Proof

After the challenge period, call `constructOutboxProof` on the `NodeInterface` virtual contract (address `0x00000000000000000000000000000000000000C8`):

```solidity
interface NodeInterface {
    /// @notice Constructs an outbox proof of an L2->L1 send's existence in the outbox accumulator.
    /// @dev Use eth_call to call.
    /// @param size the number of elements in the accumulator
    /// @param leaf the position of the send in the accumulator
    /// @return send the L2->L1 send's hash
    /// @return root the root of the outbox accumulator
    /// @return proof level-by-level branch hashes constituting a proof of the send's membership
    function constructOutboxProof(
        uint64 size,
        uint64 leaf
    ) external view returns (
        bytes32 send,
        bytes32 root,
        bytes32[] memory proof
    );
}
```

**Important:** `NodeInterface` is a "virtual" contract. It is accessible via RPC calls to `0xC8`, but it does not exist onchain and cannot be called from other contracts. It is not a precompile but uses Geth's `InterceptRPCMessage` hook to detect messages sent to `0xC8` and swap out the message handling.

Source: `smart-contracts/nitro-contracts/src/node-interface/NodeInterface.md` (lines 40-51), `build-decentralized-apps/nodeinterface/01-overview.md`

#### 3.4 Executing on L1 via the Outbox

Call `Outbox.executeTransaction` with the proof data:

```solidity
function executeTransaction(
    bytes32[] calldata proof,    // Merkle proof of message inclusion in send root
    uint256 index,               // Merkle path to message
    address l2Sender,            // Original caller of ArbSys.sendTxToL1
    address to,                  // Destination L1 address for contract call
    uint256 l2Block,             // L2 block number at which sendTxToL1 was called
    uint256 l1Block,             // L1 block number at which sendTxToL1 was called
    uint256 l2Timestamp,         // L2 timestamp at which sendTxToL1 was called
    uint256 value,               // Wei value in L1 message
    bytes calldata data          // ABI-encoded L1 message data
) external;
```

**Execution details:**
- Reverts if the dispute period has not expired (the outbox entry is only created once the rollup confirms the respective assertion).
- It is not possible to execute any L2-to-L1 transaction which contains data to a contract address without any code (enforced by the Bridge contract).
- Messages persist indefinitely on L1 once included in the Outbox (no expiry).
- Each message can only be executed once -- replay protection is enforced via a `spent` bitmap.

Source: `smart-contracts/nitro-contracts/src/bridge/IOutbox.md` (lines 59-85), `smart-contracts/nitro-contracts/src/bridge/AbsOutbox.md` (lines 161-177, 250-261)

The internal execution flow (`executeTransactionImpl`) shows how the Outbox sets context before calling the bridge:

```solidity
function executeTransactionImpl(
    uint256 outputId,
    address l2Sender,
    address to,
    uint256 l2Block,
    uint256 l1Block,
    uint256 l2Timestamp,
    uint256 value,
    bytes calldata data
) internal {
    emit OutBoxTransactionExecuted(to, l2Sender, 0, outputId);
    uint256 amountToUnlock = _getAmountToUnlock(value);

    // Temporarily store previous context for nested call support
    L2ToL1Context memory prevContext = context;
    context = L2ToL1Context({
        sender: l2Sender,
        l2Block: uint128(l2Block),
        l1Block: uint96(l1Block),
        timestamp: uint128(l2Timestamp),
        outputId: bytes32(outputId),
        withdrawalAmount: _amountToSetInContext(amountToUnlock)
    });

    executeBridgeCall(to, amountToUnlock, data);
    context = prevContext;
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/AbsOutbox.md` (lines 194-227)

#### 3.5 Outbox Context Methods

During execution of an L2-to-L1 message, the Outbox provides context about the original L2 transaction. These are callable from the L1 contract receiving the message:

```solidity
interface IOutbox {
    /// @notice Returns nonzero address if message originated from L2; zero for system messages
    /// @dev Behaves as tx.origin. Validate msg.sender separately to protect against reentrancy.
    function l2ToL1Sender() external view returns (address);

    /// @return L2 block number when the L2 tx was initiated (0 if no active L2-to-L1 tx)
    function l2ToL1Block() external view returns (uint256);

    /// @return L1 block number when the L2 tx was initiated (0 if no active L2-to-L1 tx)
    function l2ToL1EthBlock() external view returns (uint256);

    /// @return L2 timestamp when the L2 tx was initiated (0 if no active L2-to-L1 tx)
    function l2ToL1Timestamp() external view returns (uint256);

    /// @return Unique output identifier of the L2-to-L1 tx (0 if no active L2-to-L1 tx)
    function l2ToL1OutputId() external view returns (bytes32);

    /// @param index Merkle path to message
    /// @return true if the message has been spent (already executed)
    function isSpent(uint256 index) external view returns (bool);
}
```

Source: `smart-contracts/nitro-contracts/src/bridge/IOutbox.md` (lines 42-57, 113-115)

#### 3.6 Simulation Support

The Outbox also provides a simulation-only method for gas estimation:

```solidity
function executeTransactionSimulation(
    uint256 index,
    address l2Sender,
    address to,
    uint256 l2Block,
    uint256 l1Block,
    uint256 l2Timestamp,
    uint256 value,
    bytes calldata data
) external;  // Only callable when msg.sender is address(0) -- i.e., in eth_call/eth_estimateGas
```

Source: `smart-contracts/nitro-contracts/src/bridge/AbsOutbox.md` (lines 180-192)

#### 3.7 Why Manual Execution Is Required

Unlike retryable tickets (L1-to-L2) which can execute automatically with pre-funded gas, L2-to-L1 messages **must** undergo manual execution because Ethereum (the parent chain) does not support scheduled execution. However, applications can implement execution markets that allow third parties to execute messages for a fee.

Source: `how-arbitrum-works/deep-dives/l2-to-l1-messaging.md` (lines 67-71)

#### 3.8 Timing (L2-to-L1)

| Phase | Duration |
|---|---|
| Message creation on L2 | Immediate |
| Inclusion in assertion + challenge period | ~6.4 days (~1 week) |
| After confirmation: execution on L1 | Anytime (persists indefinitely) |
| **Total minimum time** | **~7 days** |

#### 3.9 Message Lifecycle States

| Stage | Description |
|---|---|
| **Posted on L2** | Message sent via `ArbSys.sendTxToL1` |
| **Waiting for finalization** | Assertion is in the challenge period (~6.4 days) |
| **Confirmed and executable** | Assertion confirmed; message available for execution in the Outbox |

Source: `how-arbitrum-works/deep-dives/l2-to-l1-messaging.md` (lines 77-84)

#### 3.10 SDK Example: ETH Withdrawal

```typescript
const childNetwork = await getArbitrumNetwork(42161)
const ethBridger = new EthBridger(childNetwork)

const withdrawTx = await ethBridger.withdraw({
  amount: utils.parseEther('23'),
  childSigner,  // ethers v5 signer connected to Arbitrum One
  destinationAddress: childWallet.address,
})
const withdrawRec = await withdrawTx.wait()
```

Source: `sdk/index.md` (lines 64-78)

#### 3.11 SDK Example: Force-Include via Delayed Inbox

If the sequencer is unavailable, you can force-include an L2 transaction (like a withdrawal) via the L1 Delayed Inbox:

```typescript
const childNetwork = await getArbitrumNetwork(await childWallet.getChainId())
const inboxSdk = new InboxTools(parentWallet, childNetwork)

const arbSys = ArbSys__factory.connect(ARB_SYS_ADDRESS, childProvider)
const arbSysIface = arbSys.interface
const childCalldata = arbSysIface.encodeFunctionData('withdrawEth', [
  parentWallet.address,
])

const txChildRequest = {
  data: childCalldata,
  to: ARB_SYS_ADDRESS,
  value: 1,
}

const childSignedTx = await inboxSdk.signChildTx(txChildRequest, childWallet)
const childTxhash = ethers.utils.parseTransaction(childSignedTx).hash
const resultsParent = await inboxSdk.sendChildSignedTx(childSignedTx)
const inboxRec = await resultsParent.wait()
```

Source: `sdk/index.md` (lines 133-160)

---

### Part 4: ERC-20 Token Bridging (Built on Cross-Chain Messaging)

Token bridging is built on top of the cross-chain messaging primitives described above, specifically leveraging retryable tickets for deposits and the outbox for withdrawals.

#### Architecture

Three contract types form the token bridge:
1. **Asset contracts:** ERC-20 on L1 and its counterpart on L2.
2. **Gateways:** Contract pairs (one on L1, one on L2) implementing a particular type of cross-chain asset bridging.
3. **Routers:** Exactly two contracts (`L1GatewayRouter` and `L2GatewayRouter`) that route each asset to its designated gateway.

#### Deposit Flow (L1-to-L2)

1. User calls `L1GatewayRouter.outboundTransferCustomRefund` with the L1 token address.
2. Router looks up the token's gateway (e.g., `L1ERC20Gateway`).
3. Router calls `L1ERC20Gateway.outboundTransferCustomRefund`.
4. Gateway escrows tokens on L1 and creates a **retryable ticket** to trigger `L2ERC20Gateway.finalizeInboundTransfer`.
5. On L2, `L2ERC20Gateway.finalizeInboundTransfer` mints the appropriate token amount.

#### Withdrawal Flow (L2-to-L1)

1. User calls `L2GatewayRouter.outBoundTransfer` on L2.
2. The L2 gateway (e.g., `L2ERC20Gateway`) burns the L2 tokens.
3. The gateway calls `ArbSys.sendTxToL1` with encoded calldata for `L1ERC20Gateway.finalizeInboundTransfer`.
4. After the ~7-day challenge period, call `Outbox.executeTransaction` on L1 to execute the encoded `L1ERC20Gateway.finalizeInboundTransfer` message, releasing escrowed tokens.

Source: `how-arbitrum-works/deep-dives/l2-to-l1-messaging.md` (lines 100-113), `how-arbitrum-works/deep-dives/l1-to-l2-messaging.md` (lines 357-489)

---

### Part 5: Key Contract Addresses Summary

| Contract | Chain | Address |
|---|---|---|
| **ArbSys** | L2 (Arbitrum) | `0x0000000000000000000000000000000000000064` |
| **ArbRetryableTx** | L2 (Arbitrum) | `0x000000000000000000000000000000000000006E` |
| **ArbGasInfo** | L2 (Arbitrum) | `0x000000000000000000000000000000000000006C` |
| **NodeInterface** (virtual, not onchain) | L2 (Arbitrum) | `0x00000000000000000000000000000000000000C8` |
| **Inbox** | L1 (Ethereum) | Deployment-specific |
| **Outbox** | L1 (Ethereum) | Deployment-specific |
| **Bridge** | L1 (Ethereum) | Deployment-specific |

Source: `build-decentralized-apps/precompiles/02-reference.md`

---

### Part 6: Comparison Summary

| Aspect | L1-to-L2 (Retryable Tickets) | L2-to-L1 (Outbox) |
|---|---|---|
| **Initiation** | `Inbox.createRetryableTicket` on L1 | `ArbSys.sendTxToL1` on L2 |
| **Execution** | Auto-redeemed or manually via `ArbRetryableTx.redeem` | Manual via `Outbox.executeTransaction` |
| **Typical Timing** | Minutes (auto-redeem) | ~7 days (challenge period) |
| **Auto-Execution** | Yes, if conditions met | No -- Ethereum does not support scheduled execution |
| **Expiry** | 7 days if not redeemed (renewable via `keepalive`) | Never expires once confirmed |
| **Gas Payment** | Pre-funded on L1 at submission | Executor pays L1 gas at execution time |
| **Address Aliasing** | Applied to contract senders (unsigned messages) | Not applicable (L2 sender preserved as-is in `l2ToL1Sender()`) |
| **Persistence** | Ticket expires after 7 days if not redeemed | Message persists indefinitely in Outbox |
| **Who Can Execute** | Auto by system, or anyone manually | Anyone on L1 after challenge period |
| **Cost of Failure** | Ticket may expire; `callValue` refunded to `callValueRefundAddress`, but other data/value may be lost | Message persists; can retry execution anytime |

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md`
2. `.claude/skills/arbitrum-skills/NAV-docs.md`
3. `.claude/skills/arbitrum-skills/NAV-nitro-contracts.md`
4. `.claude/skills/arbitrum-skills/build-decentralized-apps/04-cross-chain-messaging.md`
5. `.claude/skills/arbitrum-skills/how-arbitrum-works/deep-dives/l1-to-l2-messaging.md`
6. `.claude/skills/arbitrum-skills/how-arbitrum-works/deep-dives/l2-to-l1-messaging.md`
7. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/libraries/AddressAliasHelper.md`
8. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/bridge/Inbox.md`
9. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/bridge/AbsInbox.md`
10. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/bridge/Outbox.md`
11. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/bridge/AbsOutbox.md`
12. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/bridge/IOutbox.md`
13. `.claude/skills/arbitrum-skills/smart-contracts/nitro-contracts/src/node-interface/NodeInterface.md`
14. `.claude/skills/arbitrum-skills/build-decentralized-apps/precompiles/02-reference.md`
15. `.claude/skills/arbitrum-skills/build-decentralized-apps/nodeinterface/01-overview.md`
16. `.claude/skills/arbitrum-skills/build-decentralized-apps/nodeinterface/02-reference.md`
17. `.claude/skills/arbitrum-skills/sdk/index.md`
