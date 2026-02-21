# Q5 Without Skill: Arbitrum Timeboost

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "What is Timeboost in Arbitrum? Explain the auction mechanism, how to participate as a bidder/searcher, the express lane system, exact timing parameters, and provide code examples for bidding and submitting express lane transactions."

---

## Answer

### What is Timeboost?

Timeboost is a transaction ordering policy for Arbitrum chains that replaces the traditional first-come, first-served (FCFS) ordering with an auction-based mechanism. It was introduced to address MEV (Maximal Extractable Value) concerns on Arbitrum by allowing participants to bid for priority transaction ordering rights. The core idea is that instead of relying purely on network latency (which favors colocated infrastructure and leads to latency wars), Timeboost creates a fair auction where anyone can bid for the right to have their transactions processed with priority.

Timeboost was developed by Offchain Labs and represents a significant shift in how Arbitrum sequences transactions. The revenue from these auctions goes to the Arbitrum DAO (or the chain owner), effectively capturing MEV value that would otherwise go to searchers or validators.

### The Auction Mechanism

Timeboost operates on a round-based auction system:

1. **Auction Rounds**: Time is divided into fixed rounds (typically 60 seconds each). Each round has an auction where bidders compete for the "express lane" rights for the upcoming round.

2. **Sealed-Bid Auction**: The auction uses a sealed-bid format. Bidders submit their bids to an autonomous auctioneer. Bids are denominated in the chain's native currency or a designated ERC-20 token (on Arbitrum One, this is expected to be in ETH or a wrapped equivalent).

3. **Auction Resolution**: At the end of each auction period, the highest bidder wins the express lane controller rights for the next round. I believe this is a second-price (Vickrey) auction, meaning the winner pays the second-highest bid amount, which incentivizes truthful bidding.

4. **Reserve Price**: There is a minimum bid (reserve price) that must be met for anyone to win the express lane. If no bids meet the reserve price, the express lane goes unused for that round, and transactions are ordered in the default FCFS manner.

5. **Two-Phase Structure**: Each round has two key phases:
   - **Bidding phase**: Bidders submit sealed bids to the auctioneer
   - **Resolution phase**: The auctioneer determines the winner and publishes the result

### Express Lane System

The express lane is the core benefit that the auction winner receives:

- **Express Lane Controller**: The auction winner becomes the "express lane controller" for the designated round. They gain the ability to submit transactions through a priority channel.

- **Two-Lane Model**: The sequencer operates two lanes:
  - **Express Lane**: Transactions submitted here are processed immediately.
  - **Normal Lane**: Transactions submitted here experience a small intentional delay (~200ms) before being eligible for sequencing.

- **Priority Ordering**: This means express lane transactions naturally get a ~200ms head start over normal transactions, allowing the controller to effectively front-run or get priority inclusion.

- **Delegation**: The express lane controller can delegate their rights to other addresses, or they can act as a service, accepting transactions from others and submitting them through the express lane on their behalf.

- **Non-Express Transactions**: Transactions not submitted through the express lane are still processed normally but with the small delay. They are ordered in FCFS among themselves after the delay period.

- **Per-Round Rights**: Express lane rights are valid only for the specific round won. A new auction occurs for each subsequent round.

### Timing Parameters

Here are the timing parameters (with noted uncertainty levels):

| Parameter | Value | Confidence |
|-----------|-------|------------|
| Round duration | 60 seconds | Medium-High |
| Normal lane delay | ~200 milliseconds | Medium |
| Auction closing time before round start | ~15 seconds before the round begins | Low-Medium |
| Bid submission window | During the preceding round | Medium |

The sequencer holds non-express-lane transactions in a buffer for approximately 200ms to give express lane transactions their priority window. After this delay, non-express transactions are sequenced in their arrival order.

### How to Participate as a Bidder/Searcher

#### As a Bidder:

1. **Deposit Funds**: Before bidding, you need to deposit funds into the auction contract. This serves as your bidding balance.

2. **Submit Bids**: During the bidding window, submit a bid to the auctioneer specifying:
   - The round number you are bidding for
   - Your bid amount
   - Your express lane controller address (who will control the lane if you win)

3. **Win and Use**: If you win, you (or your designated controller address) can submit transactions through the express lane RPC endpoint during the won round.

4. **Losing Bids**: If you lose, your deposited funds remain in the contract for future bids.

#### As a Searcher:

Searchers (MEV searchers) can participate by:
- Bidding directly in the auction to win express lane rights
- Partnering with express lane controllers who may offer to include their transactions for a fee
- Monitoring the auction results to understand who controls the express lane each round

#### Who Would Bid:
- **MEV searchers** who profit from being first to execute certain transactions (arbitrage, liquidations, etc.)
- **Market makers** and **trading firms** who benefit from lower latency
- **Protocols or services** that want to guarantee fast inclusion for their users

### Code Examples

#### Depositing into the Auction Contract

```typescript
import { ethers } from 'ethers';

// Auction contract ABI (simplified - actual ABI may differ)
const auctionContractABI = [
  "function deposit(uint256 amount) external",
  "function submitBid(uint64 round, uint256 amount, address expressLaneController) external",
  "function currentRound() external view returns (uint64)",
  "function resolvedRound() external view returns (uint64)",
  "function balanceOf(address bidder) external view returns (uint256)",
  "function withdraw(uint256 amount) external"
];

const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

// The auction contract address (placeholder - check official Arbitrum docs for actual address)
const AUCTION_CONTRACT_ADDRESS = '0x...'; // Replace with actual address

const auctionContract = new ethers.Contract(
  AUCTION_CONTRACT_ADDRESS,
  auctionContractABI,
  wallet
);

async function depositForBidding(amountInWei: bigint) {
  // If using ERC-20 token for bids, approve first
  // const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);
  // await token.approve(AUCTION_CONTRACT_ADDRESS, amountInWei);

  const tx = await auctionContract.deposit(amountInWei);
  await tx.wait();
  console.log(`Deposited ${ethers.formatEther(amountInWei)} for bidding`);
}
```

#### Submitting a Bid

```typescript
async function submitBid(
  roundNumber: number,
  bidAmountWei: bigint,
  expressLaneControllerAddress: string
) {
  try {
    const tx = await auctionContract.submitBid(
      roundNumber,
      bidAmountWei,
      expressLaneControllerAddress
    );
    const receipt = await tx.wait();
    console.log(`Bid submitted for round ${roundNumber}`);
    console.log(`Bid amount: ${ethers.formatEther(bidAmountWei)} ETH`);
    console.log(`Tx hash: ${receipt.hash}`);
  } catch (error) {
    console.error('Bid submission failed:', error);
  }
}

// Example: Bid for the next round
async function bidForNextRound() {
  const currentRound = await auctionContract.currentRound();
  const nextRound = currentRound + 1n;
  const bidAmount = ethers.parseEther('0.01'); // Example bid

  await submitBid(Number(nextRound), bidAmount, wallet.address);
}
```

#### Submitting Express Lane Transactions

Once you have won the auction for a round, you can submit transactions through the express lane. The express lane uses a special RPC endpoint or method:

```typescript
// Express lane transactions are submitted via a special sequencer endpoint
// The express lane controller signs a message authorizing the transaction

interface ExpressLaneSubmission {
  chainId: number;
  round: number;
  sequenceNumber: number;  // Ordering within the express lane
  transaction: string;     // RLP-encoded signed transaction
  signature: string;       // Controller's signature authorizing this submission
}

async function submitExpressLaneTransaction(
  round: number,
  sequenceNumber: number,
  targetTransaction: ethers.TransactionRequest
) {
  // 1. Serialize the target transaction
  const populatedTx = await wallet.populateTransaction(targetTransaction);
  const signedTx = await wallet.signTransaction(populatedTx);

  // 2. Create the express lane submission message
  // Note: The actual message format may use EIP-712 typed data
  const message = ethers.solidityPacked(
    ['uint64', 'uint64', 'bytes'],
    [round, sequenceNumber, signedTx]
  );

  // 3. Sign the submission as the express lane controller
  const controllerSignature = await wallet.signMessage(
    ethers.getBytes(ethers.keccak256(message))
  );

  // 4. Submit to the sequencer's express lane endpoint
  // Note: The actual RPC method name may differ
  const expressLaneRpcUrl = 'https://arb1-sequencer.arbitrum.io/timeboost';
  const response = await fetch(expressLaneRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'timeboost_sendExpressLaneTransaction',
      params: [{
        chainId: 42161,
        round: round,
        sequenceNumber: sequenceNumber,
        transaction: signedTx,
        signature: controllerSignature
      }],
      id: 1
    })
  });

  const result = await response.json();
  console.log('Express lane submission result:', result);
  return result;
}

// Example usage
async function executeExpressLaneTrade() {
  const currentRound = await auctionContract.currentRound();

  // Submit a swap transaction through the express lane
  const swapTx = {
    to: '0x...DEX_ROUTER_ADDRESS',
    data: '0x...SWAP_CALLDATA',
    value: 0n,
    gasLimit: 300000n
  };

  await submitExpressLaneTransaction(
    Number(currentRound),
    0,  // First transaction in sequence
    swapTx
  );
}
```

#### Monitoring Auction Results

```typescript
// Listen for auction resolution events
async function monitorAuctions() {
  const auctionResolvedFilter = auctionContract.filters.AuctionResolved();

  auctionContract.on(auctionResolvedFilter, (round, winner, winningBid, event) => {
    console.log(`Round ${round} auction resolved:`);
    console.log(`  Winner: ${winner}`);
    console.log(`  Winning bid: ${ethers.formatEther(winningBid)} ETH`);
  });

  console.log('Monitoring auction results...');
}
```

#### Complete Bidder Bot Example

```typescript
import { ethers } from 'ethers';

class TimeboostBidder {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private auctionContract: ethers.Contract;

  constructor(rpcUrl: string, privateKey: string, auctionAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.auctionContract = new ethers.Contract(
      auctionAddress,
      [
        "function deposit(uint256 amount) external",
        "function submitBid(uint64 round, uint256 amount, address expressLaneController) external",
        "function currentRound() external view returns (uint64)",
        "function balanceOf(address) external view returns (uint256)",
        "event AuctionResolved(uint64 round, address winner, uint256 amount)"
      ],
      this.wallet
    );
  }

  async ensureDeposit(minBalance: bigint) {
    const balance = await this.auctionContract.balanceOf(this.wallet.address);
    if (balance < minBalance) {
      const depositAmount = minBalance - balance;
      console.log(`Depositing ${ethers.formatEther(depositAmount)}...`);
      const tx = await this.auctionContract.deposit(depositAmount);
      await tx.wait();
    }
  }

  async getOptimalBid(): Promise<bigint> {
    // Implement your bidding strategy here
    // Could be based on historical winning bids, expected MEV, etc.
    return ethers.parseEther('0.005');
  }

  async run() {
    console.log('Starting Timeboost bidder...');
    await this.ensureDeposit(ethers.parseEther('0.1'));

    // Monitor rounds and bid
    setInterval(async () => {
      try {
        const currentRound = await this.auctionContract.currentRound();
        const targetRound = currentRound + 1n;
        const bidAmount = await this.getOptimalBid();

        console.log(`Bidding ${ethers.formatEther(bidAmount)} for round ${targetRound}`);
        const tx = await this.auctionContract.submitBid(
          targetRound,
          bidAmount,
          this.wallet.address
        );
        await tx.wait();
        console.log('Bid submitted successfully');
      } catch (err) {
        console.error('Bidding error:', err);
      }
    }, 55000); // Bid every ~55 seconds (just before round ends)
  }
}

// Usage
const bidder = new TimeboostBidder(
  'https://arb1.arbitrum.io/rpc',
  process.env.PRIVATE_KEY!,
  '0x...' // Auction contract address
);
bidder.run();
```

### Architecture Overview

```
                    +------------------+
                    |   Auctioneer     |
                    | (Autonomous)     |
                    +--------+---------+
                             |
              Receives bids  |  Resolves auction
                             |
        +--------------------+--------------------+
        |                                         |
+-------v--------+                      +---------v-------+
| Bidder/Searcher |                      |   Express Lane  |
| Submits bids    |                      |   Controller    |
+-----------------+                      |  (Winner)       |
                                         +--------+--------+
                                                  |
                                    Submits express lane txs
                                                  |
                                         +--------v--------+
                                         |   Sequencer     |
                                         | Processes express|
                                         | lane txs first,  |
                                         | then regular txs |
                                         +-----------------+
```

### Key Benefits of Timeboost

1. **Reduces spam**: Under pure FCFS, searchers would spam transactions to win priority. Timeboost channels this competition into a clean auction.
2. **Revenue capture**: The protocol captures MEV-related value rather than it going entirely to searchers or validators.
3. **Fairness for regular users**: Normal users experience only a minimal delay (~200ms), which is imperceptible for most use cases.
4. **Reduced network congestion**: Less incentive for latency races and transaction spamming.

### Key Contracts and Endpoints

- **ExpressLaneAuction Contract**: Handles deposits, bid submissions, and auction resolution
- **Express Lane Endpoint**: A special RPC method on the sequencer for submitting priority transactions
- **Autonomous Auctioneer**: The component that manages the sealed-bid auction process

---

## Things I Am Less Certain About

1. **Exact timing parameters**: I stated 60-second rounds and 200ms express lane delay, but these specific numbers may be different in the actual implementation. The round duration could be different (some sources may indicate different values), and the delay window may have been adjusted during development or governance.

2. **Auction type (first-price vs. second-price)**: I described a second-price (Vickrey) sealed-bid auction, which I believe is correct based on the design rationale of encouraging truthful bidding. However, it is possible the final implementation uses a first-price auction instead. This is a critical detail I am not 100% certain about.

3. **Bid denomination**: I am not 100% certain whether bids on Arbitrum One are in ETH, WETH, or another token. The implementation may use a specific ERC-20 token.

4. **Contract ABIs and method signatures**: The function signatures I used in code examples (e.g., `submitBid`, `deposit`, `expressLaneControllerByRound`) are approximations. The actual contract interface may have different method names, parameters, or require additional fields. The real ABI should be obtained from the verified contract source.

5. **Express lane RPC method name**: I used `timeboost_sendExpressLaneTransaction` as a placeholder. The actual JSON-RPC method name is very likely different.

6. **Express lane submission format**: The exact format of express lane submissions (the message structure, what needs to be signed, the encoding) is something I am reconstructing from general understanding. The actual implementation likely has a more specific EIP-712 typed data structure or a different signing scheme.

7. **Sequence numbers**: I mentioned sequence numbers for ordering within the express lane, but I am not fully certain this is how intra-round ordering works for express lane transactions.

8. **Deployment status and contract addresses**: I believe Timeboost was approved through Arbitrum governance (AIP) and was being deployed, but I cannot confirm the exact deployment date, specific contract addresses, or whether the parameters I described match the production configuration.

9. **Reserve price mechanism**: I mentioned a reserve price but am not certain about how it is set or adjusted (fixed vs. dynamic).

10. **Delegation mechanics**: I mentioned the ability to delegate express lane rights but am not confident about the exact mechanism or API for doing so.

11. **Revenue distribution**: I stated proceeds go to the Arbitrum DAO, but the exact distribution mechanism may differ based on governance decisions.

12. **Auctioneer implementation details**: Whether the auctioneer is fully on-chain, fully off-chain, or a hybrid system is something I am not fully certain about. If bids are submitted to an off-chain auctioneer service rather than directly to an on-chain contract, the code examples for bid submission would need to be significantly different (HTTP requests to an auctioneer API rather than contract calls).

13. **The code examples are illustrative, not production-ready**: The signing scheme, message format, RPC endpoints, and contract interfaces shown are best-effort reconstructions. Real implementations should reference the official Arbitrum SDK, documentation, and verified contract ABIs.
