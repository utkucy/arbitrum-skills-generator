# Q2 With Skill: Writing and Deploying an ERC-20 Token with Stylus (Rust)

**Agent:** Explore agent with access to `/output/arbitrum-skills/`
**Tool calls:** 12
**Question:** "How do I write and deploy an ERC-20 token using Stylus (Rust)? Show me the complete workflow including the contract code structure, required dependencies, and deployment steps."

---

## Answer

### Overview

Stylus is an upgrade to Arbitrum Nitro (ArbOS 32) that adds a second, coequal WASM virtual machine alongside the EVM. It allows you to write smart contracts in Rust (and other WASM-compilable languages) and deploy them on Arbitrum chains. Stylus contracts are fully EVM-compatible and interoperable with Solidity contracts. For ERC-20 tokens, **OpenZeppelin Contracts for Stylus** (`openzeppelin-stylus v0.3.0`) provides production-ready, audited implementations.

This guide covers the complete workflow: environment setup, project creation, writing an ERC-20 token contract, testing, and deploying to the network.

---

### Step 1: Set Up Your Development Environment

#### Prerequisites

1. **Rust toolchain** (v1.81 or newer):

```shell
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Set Rust version and add WASM target
rustup default 1.81
rustup target add wasm32-unknown-unknown --toolchain 1.81
```

2. **cargo-stylus** CLI tool:

```shell
cargo install --force cargo-stylus
```

Verify installation:

```shell
cargo stylus --help
```

This should return the available commands: `new`, `init`, `export-abi`, `activate`, `cache`, `check`, `deploy`, `verify`, `cgen`, `replay`, `trace`.

3. **Docker** -- required for some `cargo stylus` commands (validation checks). Download from [docker.com](https://www.docker.com/products/docker-desktop).

4. **Foundry's Cast** -- for interacting with deployed contracts. Install from [getfoundry.sh](https://getfoundry.sh).

5. **Nitro devnode** (for local development):

```shell
git clone https://github.com/OffchainLabs/nitro-devnode.git
cd nitro-devnode
./run-dev-node.sh
```

The devnode provides a pre-funded wallet with private key: `0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659` (address: `0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E`).

Stylus is also available on **Arbitrum Sepolia** for testnet deployment.

---

### Step 2: Create the Stylus Project

```shell
cargo stylus new my-erc20-token
cd my-erc20-token
```

This generates a starter template (Counter contract). You will replace the contents with your ERC-20 token implementation. The project structure looks like:

```
my-erc20-token/
  src/
    lib.rs          # Main contract code
    main.rs         # ABI export helper
  Cargo.toml
  rust-toolchain.toml
```

---

### Step 3: Configure Dependencies (`Cargo.toml`)

Replace or update the generated `Cargo.toml` with the following. For a standalone project (not in a workspace), pin exact versions:

```toml
[package]
name = "my-erc20-token"
version = "0.1.0"
edition = "2021"
license = "MIT"
publish = false

[dependencies]
openzeppelin-stylus = "=0.3.0"
alloy-primitives = { version = "=0.8.20", default-features = false }
stylus-sdk = "=0.9.0"

[dev-dependencies]
stylus-sdk = { version = "=0.9.0", features = ["stylus-test"] }

[features]
export-abi = ["openzeppelin-stylus/export-abi"]

[lib]
crate-type = ["lib", "cdylib"]

[[bin]]
name = "my-erc20-token"
path = "src/main.rs"
```

**Key points about dependencies:**

| Dependency | Version | Purpose |
|---|---|---|
| `openzeppelin-stylus` | `0.3.0` | Production-ready ERC-20, ERC-721, access control, etc. |
| `alloy-primitives` | `0.8.20` | `Address`, `U256`, `U8`, `B32` and other EVM types |
| `stylus-sdk` | `0.9.0` | Core SDK: `#[entrypoint]`, `#[storage]`, `#[public]`, `#[constructor]` macros |

- **`alloy-primitives`** must use `default-features = false` to stay `no_std` compatible.
- The **`export-abi`** feature is needed to export a Solidity ABI interface.
- The **`crate-type`** must include `"cdylib"` to produce a WASM binary suitable for deployment.

> **Important:** This library is `no_std`-compatible. Avoid pulling in dependencies that use the standard library, as they typically bloat the WASM binary beyond the **24KB compressed size limit**. Prefer crates tagged as `no_std` on crates.io. Unsupported features include: random numbers, multi-threading, floating point numbers, file I/O, and networking.

---

### Step 4: Write the ERC-20 Contract

#### Option A: Minimal ERC-20 Token (Basic)

This is the simplest ERC-20 implementation with metadata and mint functionality.

**`src/lib.rs`:**

```rust
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;

use openzeppelin_stylus::{
    token::erc20::{
        self,
        extensions::{Erc20Metadata, IErc20Metadata},
        Erc20, IErc20,
    },
    utils::introspection::erc165::IErc165,
};
use stylus_sdk::{
    alloy_primitives::{aliases::B32, Address, U256, U8},
    prelude::*,
};

#[entrypoint]
#[storage]
struct Erc20Example {
    erc20: Erc20,
    metadata: Erc20Metadata,
}

#[public]
#[implements(IErc20<Error = erc20::Error>, IErc20Metadata, IErc165)]
impl Erc20Example {
    #[constructor]
    fn constructor(&mut self, name: String, symbol: String) {
        self.metadata.constructor(name, symbol);
    }

    fn mint(
        &mut self,
        account: Address,
        value: U256,
    ) -> Result<(), erc20::Error> {
        self.erc20._mint(account, value)
    }
}

#[public]
impl IErc20 for Erc20Example {
    type Error = erc20::Error;

    fn total_supply(&self) -> U256 {
        self.erc20.total_supply()
    }

    fn balance_of(&self, account: Address) -> U256 {
        self.erc20.balance_of(account)
    }

    fn transfer(
        &mut self,
        to: Address,
        value: U256,
    ) -> Result<bool, Self::Error> {
        self.erc20.transfer(to, value)
    }

    fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.erc20.allowance(owner, spender)
    }

    fn approve(
        &mut self,
        spender: Address,
        value: U256,
    ) -> Result<bool, Self::Error> {
        self.erc20.approve(spender, value)
    }

    fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<bool, Self::Error> {
        self.erc20.transfer_from(from, to, value)
    }
}

#[public]
impl IErc20Metadata for Erc20Example {
    fn name(&self) -> String {
        self.metadata.name()
    }

    fn symbol(&self) -> String {
        self.metadata.symbol()
    }

    fn decimals(&self) -> U8 {
        self.metadata.decimals()
    }
}

#[public]
impl IErc165 for Erc20Example {
    fn supports_interface(&self, interface_id: B32) -> bool {
        self.erc20.supports_interface(interface_id)
            || self.metadata.supports_interface(interface_id)
    }
}
```

*Source: `smart-contracts/openzeppelin-stylus/examples/basic/token/src/lib.md` and `smart-contracts/openzeppelin-stylus/docs/modules/ROOT/pages/erc20-metadata.md`*

#### Option B: Full-Featured ERC-20 Token (with Capped Supply, Burnable, and Pausable)

This example from the OpenZeppelin Stylus repository shows a feature-rich ERC-20 with capped supply, burn/burnFrom, and pausable transfers.

**`src/lib.rs`:**

```rust
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;

use openzeppelin_stylus::{
    token::erc20::{
        self,
        extensions::{
            capped, Capped, Erc20Metadata, ICapped, IErc20Burnable,
            IErc20Metadata,
        },
        Erc20, IErc20,
    },
    utils::{introspection::erc165::IErc165, pausable, IPausable, Pausable},
};
use stylus_sdk::{
    alloy_primitives::{aliases::B32, uint, Address, U256, U8},
    prelude::*,
};

const DECIMALS: U8 = uint!(10_U8);

#[derive(SolidityError, Debug)]
enum Error {
    ExceededCap(capped::ERC20ExceededCap),
    InvalidCap(capped::ERC20InvalidCap),
    InsufficientBalance(erc20::ERC20InsufficientBalance),
    InvalidSender(erc20::ERC20InvalidSender),
    InvalidReceiver(erc20::ERC20InvalidReceiver),
    InsufficientAllowance(erc20::ERC20InsufficientAllowance),
    InvalidSpender(erc20::ERC20InvalidSpender),
    InvalidApprover(erc20::ERC20InvalidApprover),
    EnforcedPause(pausable::EnforcedPause),
    ExpectedPause(pausable::ExpectedPause),
}

impl From<capped::Error> for Error {
    fn from(value: capped::Error) -> Self {
        match value {
            capped::Error::ExceededCap(e) => Error::ExceededCap(e),
            capped::Error::InvalidCap(e) => Error::InvalidCap(e),
        }
    }
}

impl From<erc20::Error> for Error {
    fn from(value: erc20::Error) -> Self {
        match value {
            erc20::Error::InsufficientBalance(e) => Error::InsufficientBalance(e),
            erc20::Error::InvalidSender(e) => Error::InvalidSender(e),
            erc20::Error::InvalidReceiver(e) => Error::InvalidReceiver(e),
            erc20::Error::InsufficientAllowance(e) => Error::InsufficientAllowance(e),
            erc20::Error::InvalidSpender(e) => Error::InvalidSpender(e),
            erc20::Error::InvalidApprover(e) => Error::InvalidApprover(e),
        }
    }
}

impl From<pausable::Error> for Error {
    fn from(value: pausable::Error) -> Self {
        match value {
            pausable::Error::EnforcedPause(e) => Error::EnforcedPause(e),
            pausable::Error::ExpectedPause(e) => Error::ExpectedPause(e),
        }
    }
}

#[entrypoint]
#[storage]
struct Erc20Example {
    erc20: Erc20,
    metadata: Erc20Metadata,
    capped: Capped,
    pausable: Pausable,
}

#[public]
#[implements(IErc20<Error = Error>, IErc20Burnable<Error = Error>, IErc20Metadata, ICapped, IPausable, IErc165)]
impl Erc20Example {
    #[constructor]
    pub fn constructor(
        &mut self,
        name: String,
        symbol: String,
        cap: U256,
    ) -> Result<(), Error> {
        self.metadata.constructor(name, symbol);
        self.capped.constructor(cap)?;
        Ok(())
    }

    // Mint with cap enforcement.
    // Do NOT call Erc20::_update directly for minting -- it breaks the Capped mechanism.
    fn mint(&mut self, account: Address, value: U256) -> Result<(), Error> {
        self.pausable.when_not_paused()?;
        let max_supply = self.capped.cap();
        let supply = self
            .erc20
            .total_supply()
            .checked_add(value)
            .expect("new supply should not exceed `U256::MAX`");

        if supply > max_supply {
            return Err(capped::Error::ExceededCap(
                capped::ERC20ExceededCap {
                    increased_supply: supply,
                    cap: max_supply,
                },
            ))?;
        }

        self.erc20._mint(account, value)?;
        Ok(())
    }

    fn pause(&mut self) -> Result<(), Error> {
        Ok(self.pausable.pause()?)
    }

    fn unpause(&mut self) -> Result<(), Error> {
        Ok(self.pausable.unpause()?)
    }
}

#[public]
impl IErc20 for Erc20Example {
    type Error = Error;

    fn total_supply(&self) -> U256 {
        self.erc20.total_supply()
    }

    fn balance_of(&self, account: Address) -> U256 {
        self.erc20.balance_of(account)
    }

    fn transfer(&mut self, to: Address, value: U256) -> Result<bool, Self::Error> {
        self.pausable.when_not_paused()?;
        Ok(self.erc20.transfer(to, value)?)
    }

    fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.erc20.allowance(owner, spender)
    }

    fn approve(&mut self, spender: Address, value: U256) -> Result<bool, Self::Error> {
        Ok(self.erc20.approve(spender, value)?)
    }

    fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<bool, Self::Error> {
        self.pausable.when_not_paused()?;
        Ok(self.erc20.transfer_from(from, to, value)?)
    }
}

#[public]
impl IErc20Metadata for Erc20Example {
    fn name(&self) -> String {
        self.metadata.name()
    }

    fn symbol(&self) -> String {
        self.metadata.symbol()
    }

    // Override default (18) with custom decimals (10).
    fn decimals(&self) -> U8 {
        DECIMALS
    }
}

#[public]
impl IErc165 for Erc20Example {
    fn supports_interface(&self, interface_id: B32) -> bool {
        Erc20::supports_interface(&self.erc20, interface_id)
            || Erc20Metadata::supports_interface(&self.metadata, interface_id)
    }
}

#[public]
impl IErc20Burnable for Erc20Example {
    type Error = Error;

    fn burn(&mut self, value: U256) -> Result<(), Self::Error> {
        self.pausable.when_not_paused()?;
        Ok(self.erc20.burn(value)?)
    }

    fn burn_from(&mut self, account: Address, value: U256) -> Result<(), Self::Error> {
        self.pausable.when_not_paused()?;
        Ok(self.erc20.burn_from(account, value)?)
    }
}

#[public]
impl ICapped for Erc20Example {
    fn cap(&self) -> U256 {
        self.capped.cap()
    }
}

#[public]
impl IPausable for Erc20Example {
    fn paused(&self) -> bool {
        self.pausable.paused()
    }
}
```

*Source: `smart-contracts/openzeppelin-stylus/examples/erc20/src/lib.md`*

#### The `src/main.rs` File (for both options)

```rust
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

#[cfg(not(any(test, feature = "export-abi")))]
#[no_mangle]
pub extern "C" fn main() {}

#[cfg(feature = "export-abi")]
fn main() {
    my_erc20_token::print_from_args();
}
```

*Source: `smart-contracts/openzeppelin-stylus/examples/erc20/src/main.md`*

---

### Step 5: Understanding the Contract Architecture

The Stylus ERC-20 contract architecture uses several key macros and patterns:

| Macro/Attribute | Purpose |
|---|---|
| `#[entrypoint]` | Marks the struct as the contract entrypoint (one per contract) |
| `#[storage]` | Declares persistent storage fields |
| `#[public]` | Exposes functions as callable contract methods |
| `#[constructor]` | Marks a function to be called once at deployment time |
| `#[implements(...)]` | Declares which trait interfaces the contract implements |
| `#[derive(SolidityError)]` | Makes Rust enums encode as Solidity error types |

**Storage structure of the core `Erc20` struct:**

```rust
#[storage]
pub struct Erc20 {
    /// Maps users to balances.
    pub(crate) balances: StorageMap<Address, StorageU256>,
    /// Maps users to a mapping of each spender's allowance.
    pub(crate) allowances: StorageMap<Address, StorageMap<Address, StorageU256>>,
    /// The total supply of the token.
    pub(crate) total_supply: StorageU256,
}
```

*Source: `smart-contracts/openzeppelin-stylus/contracts/src/token/erc20/mod.md`*

**Internal functions available on `Erc20`:**

| Method | Purpose |
|---|---|
| `_mint(account, value)` | Creates tokens, emits `Transfer` from `Address::ZERO` |
| `_burn(account, value)` | Destroys tokens, emits `Transfer` to `Address::ZERO` |
| `_transfer(from, to, value)` | Internal transfer logic |
| `_approve(owner, spender, value, emit_event)` | Internal approve logic |
| `_update(from, to, value)` | Core transfer/mint/burn logic |
| `_spend_allowance(owner, spender, value)` | Deducts from allowance |

**Default decimals** is **18** (defined as `DEFAULT_DECIMALS` in `Erc20Metadata`). Override the `decimals()` function to change it:

```rust
fn decimals(&self) -> U8 {
    uint!(16_U8)  // Use 16 decimals instead of 18
}
```

*Source: `smart-contracts/openzeppelin-stylus/contracts/src/token/erc20/extensions/metadata.md`*

---

### Step 6: Test Your Contract

#### Unit Testing with the Stylus Test Framework

Add to your `Cargo.toml` under `[dev-dependencies]`:

```toml
[dev-dependencies]
stylus-sdk = { version = "=0.9.0", features = ["stylus-test"] }
```

Example unit test:

```rust
#[cfg(test)]
mod test {
    use super::*;
    use alloy_primitives::address;
    use stylus_sdk::testing::*;

    #[test]
    fn test_counter_operations() {
        // Set up test environment
        let vm = TestVM::default();
        // Initialize your contract
        let mut contract = Counter::from(&vm);

        // Test initial state
        assert_eq!(contract.number().unwrap(), U256::ZERO);

        // Test increment
        contract.increment().unwrap();
        assert_eq!(contract.number().unwrap(), U256::from(1));

        // Test set number
        contract.set_number(U256::from(5)).unwrap();
        assert_eq!(contract.number().unwrap(), U256::from(5));
    }
}
```

Run tests:

```shell
cargo test
```

*Source: `stylus/quickstart.md`*

---

### Step 7: Validate Your Contract

Before deploying, check that the contract compiles to valid WASM and passes deployment checks:

```shell
cargo stylus check
```

This compiles to WASM and verifies the contract can be deployed and activated onchain. **Ensure Docker is running.**

Successful output:

```
Finished release [optimized] target(s) in 1.88s
Reading WASM file at my-erc20-token/target/wasm32-unknown-unknown/release/my-erc20-token.wasm
Compressed WASM size: 3 KB
Program succeeded Stylus onchain activation checks with Stylus version: 1
```

If the contract fails the check, you will see detailed error information explaining why it was rejected. Refer to the [Invalid Stylus WASM Contracts explainer](https://github.com/OffchainLabs/cargo-stylus/blob/main/main/VALID_WASM.md) for valid WASM requirements.

---

### Step 8: Deploy Your Contract

Two transactions are sent onchain: the contract deployment and its activation.

#### Estimate Gas First

```shell
cargo stylus deploy \
  --endpoint='http://localhost:8547' \
  --private-key="0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659" \
  --estimate-gas
```

Expected output:

```
deployment tx gas: 7123737
gas price: "0.100000000" gwei
deployment tx total cost: "0.000712373700000000" ETH
```

#### Deploy to Local Devnode

```shell
cargo stylus deploy \
  --endpoint='http://localhost:8547' \
  --private-key="0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659"
```

Expected output:

```
deployed code at address: 0x33f54de59419570a9442e788f5dd5cf635b3c7ac
deployment tx hash: 0xa55efc05c45efc63647dff5cc37ad328a47ba5555009d92ad4e297bf4864de36
wasm already activated!
```

**Save the deployed contract address!**

#### Deploy to Arbitrum Sepolia

Replace the endpoint and use your own funded private key:

```shell
cargo stylus deploy \
  --endpoint='https://sepolia-rollup.arbitrum.io/rpc' \
  --private-key="YOUR_PRIVATE_KEY"
```

#### Authentication Options

| Option | Description |
|---|---|
| `--private-key` | Private key as hex string (exposes to shell history) |
| `--private-key-path` | Path to file containing hex-encoded private key |
| `--keystore-path` | Path to Ethereum wallet keystore file |
| `--keystore-password-path` | Keystore password file path |

#### Additional Deploy Options

| Option | Description |
|---|---|
| `--estimate-gas` | Only perform gas estimation |
| `--no-verify` | Skip reproducible container verification |
| `--max-fee-per-gas-gwei <VALUE>` | Set max fee per gas in gwei |
| `--contract-address <ADDR>` | Deploy to a specific address |

*Source: `stylus/quickstart.md` and `stylus/using-cli.md`*

---

### Step 9: Export the Solidity ABI

```shell
cargo stylus export-abi
```

This produces a Solidity interface that can be used by Solidity contracts, frontends, or any Ethereum-compatible tooling:

```solidity
/**
 * This file was automatically generated by Stylus and represents a Rust program.
 * For more information, please see [The Stylus SDK](https://github.com/OffchainLabs/stylus-sdk-rs).
 */

// SPDX-License-Identifier: MIT-OR-APACHE-2.0
pragma solidity ^0.8.23;

interface IErc20Example {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function mint(address account, uint256 value) external;
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
```

For JSON ABI output (using `solc`):

```shell
cargo stylus export-abi --json
```

---

### Step 10: Interact with Your Deployed Contract

Using Foundry's `cast` tool:

#### Read token name

```shell
cast call --rpc-url 'http://localhost:8547' \
  YOUR_CONTRACT_ADDRESS "name()(string)"
```

#### Read total supply

```shell
cast call --rpc-url 'http://localhost:8547' \
  YOUR_CONTRACT_ADDRESS "totalSupply()(uint256)"
```

#### Mint tokens

```shell
cast send --rpc-url 'http://localhost:8547' \
  --private-key 0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659 \
  YOUR_CONTRACT_ADDRESS "mint(address,uint256)" RECIPIENT_ADDRESS 1000000000000000000
```

#### Transfer tokens

```shell
cast send --rpc-url 'http://localhost:8547' \
  --private-key 0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659 \
  YOUR_CONTRACT_ADDRESS "transfer(address,uint256)" RECIPIENT_ADDRESS 500000000000000000
```

#### Check balance

```shell
cast call --rpc-url 'http://localhost:8547' \
  YOUR_CONTRACT_ADDRESS "balanceOf(address)(uint256)" TARGET_ADDRESS
```

*Source: `stylus/quickstart.md`*

---

### Step 11: Verify Your Deployment (Optional)

```shell
cargo stylus verify \
  --deployment-tx YOUR_DEPLOYMENT_TX_HASH \
  --endpoint='http://localhost:8547'
```

---

### Important Notes

- **Reactivation required:** Stylus contracts must be reactivated once per year (365 days) or after any Stylus upgrade. Use `cargo stylus activate --address <CONTRACT_ADDRESS>` or the ArbWasm precompile. If not reactivated, the contract becomes uncallable.
- **Decimals:** The default `decimals` value is **18** (matching Ether/most ERC-20s). Override the `decimals()` function to change it, e.g., `uint!(10_U8)` for 10 decimals.
- **`no_std` compatibility:** Keep all dependencies `no_std`-compatible. The compressed WASM binary must not exceed **24KB**.
- **Interoperability:** Stylus contracts are fully interoperable with Solidity contracts. You can call a Stylus ERC-20 from Solidity and vice versa -- the language a contract was written in does not affect interoperability.
- **ERC-165 interface IDs:** The ERC-20 interface ID is `0x36372b07`, and the ERC-20 Metadata interface ID is `0xa219a025`.
- **Gas efficiency:** WASM programs tend to be more efficient than EVM bytecode for memory-intensive and compute-intensive applications. Stylus uses "ink" internally (thousands of times smaller than gas) for finer-grained pricing.
- **Recommended `no_std` crates** for Stylus: `rust_decimal` (fixed-point math), `hashbrown` (hash maps), `hex` (encoding), `time` (date/time).

### Available ERC-20 Extensions (OpenZeppelin Stylus v0.3.0)

| Extension | Description |
|---|---|
| **ERC-20 Burnable** | `burn()` and `burn_from()` for token destruction |
| **ERC-20 Capped** | Enforces a maximum total supply cap |
| **ERC-20 Metadata** | Token name, symbol, and decimals |
| **ERC-20 Pausable** | Ability to pause/unpause all transfers |
| **ERC-20 Permit** | Gasless approval via EIP-2612 signatures |
| **ERC-20 Flash Mint** | EIP-3156 flash loan support via minting/burning |
| **ERC-20 Wrapper** | Wrap another ERC-20 with deposit/withdraw |
| **ERC-4626** | Tokenized vault standard |

*Source: `smart-contracts/openzeppelin-stylus/docs/modules/ROOT/pages/erc20.md`*

---

### Complete Workflow Summary

1. **Setup**: Install Rust 1.81+, cargo-stylus, Docker, Foundry Cast
2. **Create**: `cargo stylus new my-erc20-token`
3. **Configure**: Set `openzeppelin-stylus = "=0.3.0"`, `stylus-sdk = "=0.9.0"`, `alloy-primitives = "=0.8.20"` in `Cargo.toml`
4. **Implement**: Write ERC-20 contract in `src/lib.rs` using OpenZeppelin components
5. **Test**: `cargo test`
6. **Validate**: `cargo stylus check` (requires Docker)
7. **Estimate**: `cargo stylus deploy --estimate-gas --endpoint=... --private-key=...`
8. **Deploy**: `cargo stylus deploy --endpoint=... --private-key=...`
9. **Export ABI**: `cargo stylus export-abi`
10. **Interact**: Use `cast call` and `cast send` with Foundry

---

## Files Referenced

1. `.claude/skills/arbitrum-skills/SKILL.md` -- Decision guide and topic navigation
2. `.claude/skills/arbitrum-skills/stylus/quickstart.md` -- Stylus quickstart guide (environment setup, project creation, deployment, testing, interaction)
3. `.claude/skills/arbitrum-skills/stylus/overview.md` -- Stylus contract writing overview
4. `.claude/skills/arbitrum-skills/stylus/cli-tools-overview.md` -- cargo-stylus CLI tools overview
5. `.claude/skills/arbitrum-skills/stylus/using-cli.md` -- Detailed cargo-stylus command reference table with all options
6. `.claude/skills/arbitrum-skills/stylus/gentle-introduction.md` -- Stylus architecture (coding, activation, execution, proving stages)
7. `.claude/skills/arbitrum-skills/stylus/recommended-libraries.md` -- Recommended no_std crates for Stylus contracts
8. `.claude/skills/arbitrum-skills/NAV-openzeppelin-stylus.md` -- OpenZeppelin Stylus file index (332 files)
9. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/docs/modules/ROOT/pages/index.md` -- OpenZeppelin Contracts for Stylus overview (version 0.3.0, quick start, compatibility info)
10. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/docs/modules/ROOT/pages/erc20.md` -- ERC-20 documentation with GLDToken example, decimals explanation, extensions list
11. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/docs/modules/ROOT/pages/erc20-metadata.md` -- ERC-20 Metadata extension usage with full code example
12. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/erc20/Cargo.md` -- ERC-20 example Cargo.toml (workspace-based dependencies)
13. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/erc20/src/lib.md` -- Full-featured ERC-20 example with capped, burnable, pausable extensions
14. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/erc20/src/main.md` -- Example main.rs for ABI export binary
15. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/erc20/tests/erc20.md` -- End-to-end integration tests for ERC-20 (constructs, mints, transfers, approves, burns, pauses)
16. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/basic/token/Cargo.md` -- Basic token example Cargo.toml
17. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/examples/basic/token/src/lib.md` -- Basic/minimal ERC-20 token example source code
18. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/contracts/src/token/erc20/mod.md` -- Core Erc20 struct definition (StorageMap-based balances, allowances, total_supply), IErc20 trait, internal methods (_mint, _burn, _update, _transfer, _approve, _spend_allowance), unit tests
19. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/contracts/src/token/erc20/abi.md` -- ERC-20 Solidity ABI interfaces (Erc20Abi, Erc20Interface, Erc20MetadataInterface)
20. `.claude/skills/arbitrum-skills/smart-contracts/openzeppelin-stylus/contracts/src/token/erc20/extensions/metadata.md` -- Erc20Metadata struct, IErc20Metadata trait, DEFAULT_DECIMALS = 18, constructor, unit tests
