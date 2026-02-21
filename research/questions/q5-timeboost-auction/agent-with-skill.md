# Q5 With Skill: Arbitrum Timeboost

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 10
**Question:** "What is Timeboost in Arbitrum? Explain the auction mechanism, how to participate as a bidder/searcher, the express lane system, exact timing parameters, and provide code examples for bidding and submitting express lane transactions."

---

## Answer

### What is Timeboost?

Arbitrum Timeboost is a novel **transaction ordering policy** for Arbitrum chains that modifies the default First-Come, First-Serve (FCFS) mechanism. It enables chain owners to capture a portion of Maximal Extractable Value (MEV) on their chain, reduces latency-based spam from searchers, and preserves fast block times -- all while protecting users from harmful MEV types such as sandwich attacks and front-running.

Timeboost is the result of over a year of [research and development](https://arxiv.org/abs/2306.02179) by Offchain Labs. It is currently **live on Arbitrum One and Arbitrum Nova** (since April 17, 2025) and on **Arbitrum Sepolia** (since February 12, 2025).

> Source: `how-arbitrum-works/timeboost/gentle-introduction.md`, `launch-arbitrum-chain/02-configure-your-chain/common/mev/timeboost-for-arbitrum-chains.md`

### Why Timeboost Exists

Under pure FCFS ordering, searchers engage in **latency races** -- investing in offchain hardware to submit transactions faster than competitors. This creates:

1. **Spam and congestion** from repeated transaction attempts
2. **Zero MEV revenue** for the chain owner (all captured MEV goes to searchers)
3. **Infrastructure stress** from competitive speed optimization

Timeboost addresses these by introducing an auction-based time advantage, diverting competition from hardware investment to bidding.

> Source: `how-arbitrum-works/timeboost/gentle-introduction.md`

---

### The Three Components of Timeboost

Timeboost uses three components that work together:

#### 1. The Express Lane

A special sequencer endpoint (`timeboost_sendExpressLaneTransaction`) where transactions submitted by the current round's **express lane controller** are sequenced **immediately** with zero delay. Transactions submitted through the normal path receive a **200ms artificial delay** added to their arrival timestamp.

Key properties of the express lane controller:
- Does **NOT** have the right to reorder transactions
- Does **NOT** guarantee their transactions are always first ("top-of-block")
- Does **NOT** guarantee a profit
- **Cannot** see other users' transactions (mempool remains private)

Express lane transactions are ordered by their `sequenceNumber` field. Transactions with `sequenceNumber = n` can only be sequenced after all transactions from `0` to `n-1` have been processed. There is a special **"dontcare" sequence number** (`2^64 - 1`) that bypasses ordering requirements relative to other express lane submissions (though normal per-account nonce ordering is still respected).

> Source: `how-arbitrum-works/timeboost/gentle-introduction.md`, `how-arbitrum-works/timeboost/troubleshoot-timeboost.md`

#### 2. The Offchain Auction

A **sealed-bid, second-price auction** run by an autonomous auctioneer every round. The winner pays the **second-highest bid** amount. Key details:

- Bids use a configurable `ERC-20` token (default: `WETH` on Arbitrum One and Nova)
- Must meet the minimum reserve price (default: **0.001 WETH**)
- Maximum of **5 bids per address per round** (DDoS mitigation)
- The auctioneer considers only an address's **most recent bid** (resubmit to update; bid below reserve price to cancel)

#### 3. The Auction Contract

An on-chain smart contract deployed on the target chain that serves as the canonical source of truth for auction results and handling of proceeds. It manages:

- **Deposits** (fully withdrawable after a 2-round / ~2-minute delay)
- **Bid resolution** (winner determination and second-price deduction)
- **Proceeds transfer** to a beneficiary address via `flushBeneficiaryBalance()`

> Source: `how-arbitrum-works/timeboost/gentle-introduction.md`, `launch-arbitrum-chain/features/common/mev/choose-timeboost.md`

---

### Exact Timing Parameters

| Parameter | Default Value | Description |
|---|---|---|
| `roundDurationSeconds` | **60 seconds** | Duration that the sequencer honors express lane privileges for the current round's controller |
| `auctionClosingSeconds` | **15 seconds** | Time before round start when new bids are no longer accepted |
| `nonExpressDelayMsec` | **200 milliseconds** | Artificial delay applied to non-express lane transaction arrival timestamps |
| Block time | **250 milliseconds** | Unchanged by Timeboost (can be adjusted to 100ms) |
| `_biddingToken` | **WETH** | ERC-20 token used for bidding (configurable) |
| `_minReservePrice` | **0.001 WETH** | Floor minimum for bids enforced by the auction contract |
| `reservePrice` | **None (unset)** | Minimum bid; can be raised by chain owner up to 30 seconds before next round |
| Withdrawal delay | **2 rounds (~2 minutes)** | Delay before deposited funds can be withdrawn |
| Bidding window | **45 seconds** | Effective time to submit bids (60s round - 15s closing = 45s) |
| Block-based timeout | **5 blocks (1250ms)** | Express lane transactions not sequenced within 5 blocks are dropped |
| Block gas limit | **32 million gas** | Per Arbitrum block |
| Reserve price update window | **30 seconds before round start** | Reserve price changes are locked in at least 30s before round |

**Timing flow for a round:**

```
|-- 45 seconds (bidding open) --|-- 15 seconds (auction closes, winner resolved) --|-- 60 seconds (express lane active) --|
```

**Finality impact:**
- Express lane transactions: ~250ms soft finality (unchanged)
- Non-express lane transactions: ~450ms soft finality (250ms block time + 200ms delay)
- Ethereum-equivalent finality: ~13 minutes (unchanged for practical purposes)

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`, `how-arbitrum-works/timeboost/timeboost-faq.md`, `how-arbitrum-works/timeboost/troubleshoot-timeboost.md`

---

### Network Endpoints and Addresses

| Network | Autonomous Auctioneer Endpoint |
|---|---|
| Arbitrum Sepolia | `https://arbsepolia-auctioneer.arbitrum.io/` |
| Arbitrum One | `https://arb1-auctioneer.arbitrum.io/` |
| Arbitrum Nova | `https://nova-auctioneer.arbitrum.io/` |

**Historical bid data (public S3 buckets):**

| Chain | S3 Bucket URL |
|---|---|
| Arbitrum Sepolia | `s3://timeboost-auctioneer-sepolia/ue2/validated-timeboost-bids/` |
| Arbitrum One | `s3://timeboost-auctioneer-arb1/ue2/validated-timeboost-bids/` |
| Arbitrum Nova | `s3://timeboost-auctioneer-nova/ue2/validated-timeboost-bids/` |

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

### How to Participate as a Bidder/Searcher

#### Step 1: Deposit Funds into the Auction Contract

Before bidding, you must deposit the bidding token (e.g., WETH) into the auction contract.

**Check your current balance:**

```tsx
const depositedBalance = await publicClient.readContract({
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'balanceOf',
  args: [userAddress],
});
console.log(`Current balance of ${userAddress} in auction contract: ${depositedBalance}`);
```

**Get the bidding token address:**

```tsx
const biddingTokenContractAddress = await publicClient.readContract({
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'biddingToken',
});
console.log(`biddingToken: ${biddingTokenContractAddress}`);
```

**Approve and deposit funds:**

```tsx
// Approving spending tokens
const approveHash = await walletClient.writeContract({
  account,
  address: biddingTokenContractAddress,
  abi: parseAbi(['function approve(address,uint256)']),
  functionName: 'approve',
  args: [auctionContract, amountToDeposit],
});
console.log(`Approve transaction sent: ${approveHash}`);

// Making the deposit
const depositHash = await walletClient.writeContract({
  account,
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'deposit',
  args: [amountToDeposit],
});
console.log(`Deposit transaction sent: ${depositHash}`);
```

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

#### Step 2: Submit a Bid

**Get the current round and check if the auction is open:**

```tsx
const currentRound = await publicClient.readContract({
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'currentRound',
});
console.log(`Current round: ${currentRound}`);

let currentAuctionRoundIsClosed = await publicClient.readContract({
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'isAuctionRoundClosed',
});
```

**Create the EIP-712 signature for the bid:**

The signature uses the following typed data structure:
- Domain: `Bid(uint64 round, address expressLaneController, uint256 amount)`

```tsx
const currentAuctionRound = currentRound + 1;

const signatureData = hashTypedData({
  domain: {
    name: 'ExpressLaneAuction',
    version: '1',
    chainId: Number(publicClient.chain.id),
    verifyingContract: auctionContractAddress,
  },
  types: {
    Bid: [
      { name: 'round', type: 'uint64' },
      { name: 'expressLaneController', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  primaryType: 'Bid',
  message: {
    round: currentAuctionRound,
    expressLaneController: userAddress,
    amount: amountToBid,
  },
});
const signature = await account.sign({
  hash: signatureData,
});
```

You can also call the function `getBidHash` on the auction contract to obtain the `signatureData`, specifying the `round`, `userAddress`, and `amountToBid`.

**Submit the bid to the autonomous auctioneer:**

```tsx
const currentAuctionRound = currentRound + 1;
const hexChainId: `0x${string}` = `0x${Number(publicClient.chain.id).toString(16)}`;

const res = await fetch(AUCTIONEER_ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'submit-bid',
    method: 'auctioneer_submitBid',
    params: [
      {
        chainId: hexChainId,
        expressLaneController: userAddress,
        auctionContractAddress: auctionContractAddress,
        round: `0x${currentAuctionRound.toString(16)}`,
        amount: `0x${Number(amountToBid).toString(16)}`,
        signature: signature,
      },
    ],
  }),
});
```

A successful submission returns an empty result with HTTP status `200`.

**Bid submission errors:**

| Error | Description |
|---|---|
| `MALFORMED_DATA` | Wrong input data, failed to deserialize, missing fields |
| `NOT_DEPOSITOR` | Address is not an active depositor |
| `WRONG_CHAIN_ID` | Wrong chain id for the target chain |
| `WRONG_SIGNATURE` | Signature failed to verify |
| `BAD_ROUND_NUMBER` | Incorrect round (e.g., from the past) |
| `RESERVE_PRICE_NOT_MET` | Bid amount below minimum reserve price |
| `INSUFFICIENT_BALANCE` | Bid amount exceeds deposited balance |

**Bid management:**
- **Update a bid**: Resubmit a new bid (the auctioneer only considers the most recent bid per address)
- **Cancel a bid**: Place a new bid below the minimum reserve price
- **Maximum 5 bids per round per address** to mitigate DDoS risks

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`, `how-arbitrum-works/timeboost/timeboost-faq.md`

#### Step 3: Determine if You Won the Auction

After the auction closes, the autonomous auctioneer calls the auction contract with the two highest bids. The contract emits a `SetExpressLaneController` event:

```solidity
event SetExpressLaneController(
    uint64 round,
    address indexed previousExpressLaneController,
    address indexed newExpressLaneController,
    address indexed transferor,
    uint64 startTimestamp,
    uint64 endTimestamp
);
```

**Listen for the event:**

```tsx
const fromBlock = <any recent block, for example during the auction>
const logs = await publicClient.getLogs({
  address: auctionContractAddress,
  event: auctionContractAbi.filter(
    (abiEntry) => abiEntry.name === 'SetExpressLaneController'
  )[0],
  fromBlock,
});

const newExpressLaneController = logs[0].args.newExpressLaneController;
console.log(`New express lane controller: ${newExpressLaneController}`);
```

On-chain, the winning bid for each resolved auction is also emitted via the `AuctionResolved` event from the [IExpressLaneAuction interface](https://github.com/OffchainLabs/nitro-contracts/blob/main/src/express-lane-auction/IExpressLaneAuction.sol#L95-L103).

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

### Submitting Express Lane Transactions

Once you are the express lane controller for a round, you can submit transactions via the `timeboost_sendExpressLaneTransaction` RPC method on the **sequencer endpoint** (not the auctioneer endpoint).

**Parameters required:**
- `chainId`: Hex-encoded chain ID
- `round`: Current round number (hex)
- `auctionContractAddress`: Address of the auction contract
- `sequenceNumber`: Per-round nonce (resets to 0 each round), or `2^64 - 1` for "dontcare"
- `transaction`: RLP-encoded, signed transaction payload
- `options`: Conditional options for Arbitrum transactions (can be empty `{}`)
- `signature`: Ethereum signature over concatenated data

**Build the signature for express lane transactions:**

The signature concatenates:
- Hash of `keccak256("TIMEBOOST_BID")`
- Chain id (padded to 32 bytes)
- Auction contract address
- Round number (padded to 8 bytes)
- Sequence number (padded to 8 bytes)
- Serialized transaction

```tsx
const hexChainId: `0x${string}` = `0x${Number(publicClient.chain.id).toString(16)}`;

const transaction = await walletClient.prepareTransactionRequest(...);
const serializedTransaction = await walletClient.signTransaction(transaction);

const signatureData = concat([
  keccak256(toHex('TIMEBOOST_BID')),
  pad(hexChainId),
  auctionContract,
  toHex(numberToBytes(currentRound, { size: 8 })),
  toHex(numberToBytes(sequenceNumber, { size: 8 })),
  serializedTransaction,
]);
const signature = await account.signMessage({
  message: { raw: signatureData },
});
```

**Submit the express lane transaction:**

```tsx
const hexChainId: `0x${string}` = `0x${Number(publicClient.chain.id).toString(16)}`;

const transaction = await walletClient.prepareTransactionRequest(...);
const serializedTransaction = await walletClient.signTransaction(transaction);

const res = await fetch(SEQUENCER_ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'express-lane-tx',
    method: 'timeboost_sendExpressLaneTransaction',
    params: [
      {
        chainId: hexChainId,
        round: `0x${currentRound.toString(16)}`,
        auctionContractAddress: auctionContractAddress,
        sequenceNumber: `0x${sequenceNumber.toString(16)}`,
        transaction: serializedTransaction,
        options: {},
        signature: signature,
      },
    ],
  }),
});
```

**Timeboost-ing third-party transactions:** The express lane controller signs the `timeboost_sendExpressLaneTransaction` request, but **any party can sign the underlying transaction**. This enables use cases like selling express lane access on a per-transaction basis.

**Express lane transaction errors:**

| Error | Description |
|---|---|
| `MALFORMED_DATA` | Wrong input data, failed to deserialize, missing fields |
| `WRONG_CHAIN_ID` | Wrong chain id |
| `WRONG_SIGNATURE` | Signature failed to verify |
| `BAD_ROUND_NUMBER` | Incorrect round |
| `NOT_EXPRESS_LANE_CONTROLLER` | Sender is not the express lane controller |
| `NO_ONCHAIN_CONTROLLER` | No defined on-chain controller for this round |
| `SEQUENCE_NUMBER_ALREADY_SEEN` | Sequence number was already consumed |
| `SEQUENCE_NUMBER_TOO_LOW` | Sequence number is lower than expected |
| `sequence number has reached max allowed limit` | Buffer limit for express lane transactions was reached |

Note: If you receive any of the above errors, the sequence number was **not** consumed.

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`, `how-arbitrum-works/timeboost/troubleshoot-timeboost.md`

---

### How Express Lane Transactions are Ordered into Blocks

The express lane time advantage is **200ms**, while the block creation time is **250ms**. Both express lane and regular transactions are processed together in a single queue after accounting for the time advantage and artificial delay.

If an express lane transaction and a normal transaction arrive at the sequencer at the same time, but **before 50ms have passed since the last block was produced**, both may appear in the same block -- though the express lane transaction would be sequenced first (assuming block gas limit is not reached).

**Block-based timeout**: Express lane transactions that are accepted (sequence number consumed) but not sequenced into a block within **5 blocks (1250ms)** will be **dropped**. This can occur if cumulative gas usage fills 5 blocks worth of transactions before all buffered express lane transactions are sequenced. No timeout error is returned; check transaction receipts for confirmation.

**Response times**: The response for an express lane submission is returned immediately once received by the sequencer. If a transaction is sent at `t=0ms` and takes 50ms to arrive, the expected response time is at `t=50ms`.

> Source: `how-arbitrum-works/timeboost/troubleshoot-timeboost.md`

---

### Identifying Timeboosted Transactions

Transaction receipts include a new `timeboosted` field:

```shell
transactionHash     0x62ea458ad2bb408fab57d1a31aa282fe3324b2711e0d73f4777db6e34bc1bef5
status              1 (success)
timeboosted         true
```

In the sequencer feed, the `BroadcastFeedMessage` struct contains a `blockMetadata` field -- a byte array starting with version byte `0`, followed by `ceil(N/8)` bytes where `N` is the number of transactions in the block. If bit position `i` is set to `1`, the `i`-th transaction was timeboosted. For example, if `blockmetadata` bits are `00000000 01100000`, the 2nd and 3rd transactions were timeboosted.

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

### Withdrawing Funds from the Auction Contract

Withdrawals are a two-step process with a **2-round (~2-minute) delay**:

**Step 1: Initiate withdrawal:**

```tsx
const initWithdrawalTransaction = await walletClient.writeContract({
  account,
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'initiateWithdrawal',
});
console.log(`Initiate withdrawal transaction sent: ${initWithdrawalTransaction}`);
```

This emits a `WithdrawalInitiated` event:

```solidity
event WithdrawalInitiated(
    address indexed account,
    uint256 withdrawalAmount,
    uint256 roundWithdrawable
);
```

**Step 2: Finalize withdrawal (after 2 rounds):**

```tsx
const finalizeWithdrawalTransaction = await walletClient.writeContract({
  account,
  address: auctionContractAddress,
  abi: auctionContractAbi,
  functionName: 'finalizeWithdrawal',
});
console.log(`Finalize withdrawal transaction sent: ${finalizeWithdrawalTransaction}`);
```

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

### Querying Historical Bid Data

Historical bid data is published to public S3 buckets:

```shell
# List historical bids
aws s3 ls s3://timeboost-auctioneer-arb1/ue2/validated-timeboost-bids/2025/06/10/ \
  --no-sign-request --recursive

# Download a specific file
aws s3 cp s3://timeboost-auctioneer-arb1/ue2/validated-timeboost-bids/2025/06/09/0130304-0130343.csv.gzip \
  local.csv.gzip --no-sign-request
```

Note: Data before June 9, 2025 17:27 ET for Arbitrum One is at the old path: `s3://timeboost-auctioneer-arb1/uw2/validated-timeboost-bids/`.

> Source: `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

### Deploying Timeboost for Orbit Chains

For Orbit chain owners who want to enable Timeboost, three steps are required:

**1. Deploy the `ExpressLaneAuction` contract** using the `orbit-actions` repository with Foundry:

```shell
git clone https://github.com/OffchainLabs/orbit-actions.git
cd orbit-actions/scripts/foundry/timeboost
cp .env.sample .env
# Configure .env with addresses and parameters (see below)
forge script --sender $DEPLOYER --rpc-url $CHILD_CHAIN_RPC --slow \
  ./DeployExpressLaneAuction.s.sol -vvv --verify --broadcast
```

Key `.env` parameters:
```shell
PROXY_ADMIN_ADDRESS=                # Your proxy admin contract address
AUCTIONEER_ADDRESS=                 # Address that sends resolve auction requests
BIDDING_TOKEN_ADDRESS=              # Your ERC20 bid token address
BENEFICIARY_ADDRESS=                # Address to receive bid proceeds
MIN_RESERVE_PRICE=0                 # Minimum price for bids
ROUND_DURATION_SECONDS=60           # Total duration of each round
AUCTION_CLOSING_SECONDS=15          # Time before round end when bids close
RESERVE_SUBMISSION_SECONDS=15       # Time for reserve price submission
```

**2. Run Auctioneer Services** (bid validator + auction server):

```shell
# Bid validator
./autonomous-auctioneer \
  --bid-validator.auction-contract-address=<address> \
  --bid-validator.rpc-endpoint=<rpc> \
  --auctioneer-server.enable=false \
  --bid-validator.redis-url=<redis_url> \
  --http.addr=0.0.0.0 --http.port=<port>

# Auction server
./autonomous-auctioneer \
  --auctioneer-server.auction-contract-address=<address> \
  --auctioneer-server.db-directory=<dir> \
  --auctioneer-server.redis-url=<redis_url> \
  --auctioneer-server.sequencer-endpoint=<endpoint> \
  --auctioneer-server.wallet.private-key=<key> \
  --bid-validator.enable=false
```

**3. Configure the sequencer node** with Timeboost APIs:

```json
{
  "http": {
    "api": ["auctioneer", "timeboost"]
  },
  "execution": {
    "sequencer": {
      "timeboost": {
        "enable": true,
        "auction-contract-address": "<address>",
        "auctioneer-address": "<address>",
        "redis-url": "<redis_url>"
      }
    }
  }
}
```

> Source: `launch-arbitrum-chain/02-configure-your-chain/common/mev/timeboost-for-arbitrum-chains.md`

---

### Key Design Decisions and Security

- **Private mempool preserved**: Users remain protected from front-running and sandwich attacks
- **No transaction reordering**: The express lane controller only gets a time advantage, not reordering power
- **Compatible with future decentralized sequencers**: Full specification at [decentralized-timeboost-spec](https://github.com/OffchainLabs/decentralized-timeboost-spec)
- **Fallback to FCFS**: If no one wins an auction for a round, the chain reverts to pure FCFS ordering with no user impact
- **Timeboost can be paused or disabled**: The ArbitrumDAO has granted the sequencer operator the right to pause acceptance of bids or disable Timeboost entirely in the event of security risks
- **No new MEV vectors**: Timeboost adjusts access to existing MEV; it does not create new types
- **Rate limits**: Per-IP rate limits exist on the sequencer (limits not published), and express lane transactions have a 5-block timeout
- **`eth_sendRawTransactionConditional`**: Not currently supported with Timeboost
- **Transfer of express lane control**: `setTransferor` and `transferExpressLaneController` contract calls will succeed, but the node software will not recognize the rights transfer at launch (may be implemented in a future upgrade)

> Source: `how-arbitrum-works/timeboost/timeboost-faq.md`, `how-arbitrum-works/timeboost/troubleshoot-timeboost.md`, `how-arbitrum-works/timeboost/how-to-use-timeboost.md`

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md`
2. `.claude/skills/arbitrum-skills/how-arbitrum-works/timeboost/gentle-introduction.md`
3. `.claude/skills/arbitrum-skills/how-arbitrum-works/timeboost/how-to-use-timeboost.md`
4. `.claude/skills/arbitrum-skills/how-arbitrum-works/timeboost/timeboost-faq.md`
5. `.claude/skills/arbitrum-skills/how-arbitrum-works/timeboost/troubleshoot-timeboost.md`
6. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/features/common/mev/choose-timeboost.md`
7. `.claude/skills/arbitrum-skills/launch-arbitrum-chain/02-configure-your-chain/common/mev/timeboost-for-arbitrum-chains.md`
