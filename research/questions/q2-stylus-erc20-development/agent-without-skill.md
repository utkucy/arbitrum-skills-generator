# Q2 Without Skill: Writing and Deploying an ERC-20 Token with Stylus (Rust)

**Agent:** General-purpose agent (training knowledge only)
**Tool calls:** 0
**Question:** "How do I write and deploy an ERC-20 token using Stylus (Rust)? Show me the complete workflow including the contract code structure, required dependencies, and deployment steps."

---

## Answer

### Overview

Arbitrum Stylus allows you to write smart contracts in Rust (and other languages that compile to WASM) and deploy them on Arbitrum chains. These contracts run on a WASM virtual machine alongside the EVM and can interoperate seamlessly with Solidity contracts. Below is the complete workflow for building and deploying an ERC-20 token using Stylus with Rust.

---

### Step 1: Prerequisites

You need the following installed:

- **Rust** (with `rustup`): Install from https://rustup.rs
- **The `wasm32-unknown-unknown` target**: Required for compiling to WASM
- **cargo-stylus**: The Stylus CLI tool for building, checking, and deploying contracts
- **A funded wallet**: You need an Arbitrum Sepolia (testnet) or Arbitrum One wallet with ETH for gas

```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add the WASM target
rustup target add wasm32-unknown-unknown

# Install cargo-stylus
cargo install cargo-stylus
```

---

### Step 2: Create a New Stylus Project

```bash
cargo stylus new my-erc20-token
cd my-erc20-token
```

This scaffolds a new Stylus project with the basic structure.

---

### Step 3: Dependencies (Cargo.toml)

The key dependency is `stylus-sdk`, which provides the macros, storage types, and ABI generation needed for Stylus contracts. For an ERC-20, you can either use the `openzeppelin-stylus` library (if available) or implement it from scratch using the SDK.

```toml
[package]
name = "my-erc20-token"
version = "0.1.0"
edition = "2021"

[dependencies]
stylus-sdk = "0.6.0"
alloy-primitives = "0.7"
alloy-sol-types = "0.7"

# If using OpenZeppelin's Stylus contracts (community/official library):
# openzeppelin-stylus = "0.1.0"

[features]
export-abi = ["stylus-sdk/export-abi"]

[profile.release]
codegen-units = 1
strip = true
lto = true
panic = "abort"
opt-level = "s"

[lib]
crate-type = ["lib", "cdylib"]
```

**Note:** The exact version numbers for `stylus-sdk`, `alloy-primitives`, and `alloy-sol-types` may differ. The Stylus SDK has gone through several iterations. Check the official docs or crates.io for the latest compatible versions.

---

### Step 4: Contract Code Structure

Here is a from-scratch ERC-20 implementation using the Stylus SDK:

```rust
// src/lib.rs

#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    evm, msg,
    prelude::*,
};

// Define Solidity-compatible events and errors
sol! {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance(address from, uint256 have, uint256 want);
    error InsufficientAllowance(address owner, address spender, uint256 have, uint256 want);
}

// Define the contract's persistent storage layout
sol_storage! {
    #[entrypoint]
    pub struct Erc20 {
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
        uint256 total_supply;
        string name;
        string symbol;
        uint8 decimals;
        bool initialized;
    }
}

// Custom error enum
#[derive(SolidityError)]
pub enum Erc20Error {
    InsufficientBalance(InsufficientBalance),
    InsufficientAllowance(InsufficientAllowance),
}

#[public]
impl Erc20 {
    /// Initialize the token (acts as constructor since Stylus contracts
    /// don't have traditional constructors)
    pub fn initialize(
        &mut self,
        name: String,
        symbol: String,
        decimals: u8,
        initial_supply: U256,
    ) -> Result<(), Erc20Error> {
        // In production, add an "already initialized" check here
        self.name.set_str(&name);
        self.symbol.set_str(&symbol);
        self.decimals.set(decimals);

        let caller = msg::sender();
        self.total_supply.set(initial_supply);
        self.balances.setter(caller).set(initial_supply);

        evm::log(Transfer {
            from: Address::ZERO,
            to: caller,
            value: initial_supply,
        });

        Ok(())
    }

    /// Returns the name of the token
    pub fn name(&self) -> String {
        self.name.get_string()
    }

    /// Returns the symbol of the token
    pub fn symbol(&self) -> String {
        self.symbol.get_string()
    }

    /// Returns the number of decimals
    pub fn decimals(&self) -> u8 {
        self.decimals.get()
    }

    /// Returns the total supply
    pub fn total_supply(&self) -> U256 {
        self.total_supply.get()
    }

    /// Returns the balance of the given address
    pub fn balance_of(&self, owner: Address) -> U256 {
        self.balances.get(owner)
    }

    /// Transfer tokens from the caller to `to`
    pub fn transfer(&mut self, to: Address, value: U256) -> Result<bool, Erc20Error> {
        let from = msg::sender();
        self._transfer(from, to, value)?;
        Ok(true)
    }

    /// Returns the allowance of `spender` on behalf of `owner`
    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.allowances.get(owner).get(spender)
    }

    /// Approve `spender` to spend `value` tokens on behalf of the caller
    pub fn approve(&mut self, spender: Address, value: U256) -> Result<bool, Erc20Error> {
        let owner = msg::sender();
        self.allowances.setter(owner).setter(spender).set(value);

        evm::log(Approval {
            owner,
            spender,
            value,
        });

        Ok(true)
    }

    /// Transfer tokens from `from` to `to` using the allowance mechanism
    pub fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<bool, Erc20Error> {
        let spender = msg::sender();
        let current_allowance = self.allowances.get(from).get(spender);

        if current_allowance < value {
            return Err(Erc20Error::InsufficientAllowance(InsufficientAllowance {
                owner: from,
                spender,
                have: current_allowance,
                want: value,
            }));
        }

        self.allowances
            .setter(from)
            .setter(spender)
            .set(current_allowance - value);
        self._transfer(from, to, value)?;

        Ok(true)
    }
}

// Internal (non-public) helper methods
impl Erc20 {
    fn _transfer(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<(), Erc20Error> {
        let from_balance = self.balances.get(from);
        if from_balance < value {
            return Err(Erc20Error::InsufficientBalance(InsufficientBalance {
                from,
                have: from_balance,
                want: value,
            }));
        }

        self.balances.setter(from).set(from_balance - value);
        let to_balance = self.balances.get(to);
        self.balances.setter(to).set(to_balance + value);

        evm::log(Transfer { from, to, value });

        Ok(())
    }
}
```

### Key Concepts in the Code

1. **`sol_storage!` macro**: Defines the contract's persistent storage layout using Solidity-style type syntax. This generates a Solidity-compatible storage structure behind the scenes.

2. **`#[entrypoint]`**: Marks the main contract struct. This is the entry point for all external calls to the contract.

3. **`#[public]`**: Marks an `impl` block whose methods are exposed as external contract functions. The SDK automatically generates the appropriate ABI selectors (function signatures).

4. **`sol!` macro**: Used to define Solidity-compatible events and custom errors that can be emitted/used from Rust code.

5. **`evm::log()`**: Emits EVM events (logs) that are equivalent to Solidity's `emit`.

6. **`msg::sender()`**: Returns the caller's address, equivalent to Solidity's `msg.sender`.

7. **Storage accessors**: For reading, you use `.get(key)`. For writing, you use `.setter(key).set(value)`. For nested mappings, you chain: `.setter(outer_key).setter(inner_key).set(value)`.

---

### Step 5: Using OpenZeppelin Stylus (Alternative Approach)

OpenZeppelin has been developing Stylus contract libraries. If available, the code becomes significantly simpler:

```rust
#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use openzeppelin_stylus::token::erc20::Erc20;
use stylus_sdk::prelude::*;

sol_storage! {
    #[entrypoint]
    pub struct MyToken {
        #[borrow]
        Erc20 erc20;
    }
}

#[public]
#[inherit(Erc20)]
impl MyToken {
    // Add any custom methods here
    // The standard ERC-20 interface is inherited from OpenZeppelin
}
```

**Note:** I am less certain about the exact API surface of the OpenZeppelin Stylus library, as it was still under active development during my training period. The import paths and struct names may differ.

---

### Step 6: Build and Verify the Contract

```bash
# Check validity against an Arbitrum node (compiles to WASM and verifies)
cargo stylus check --endpoint https://sepolia-rollup.arbitrum.io/rpc

# This command:
# 1. Compiles your Rust code to wasm32-unknown-unknown
# 2. Verifies the WASM is valid for deployment on Stylus
# 3. Estimates the deployment gas cost

# You can also just build without checking against a node:
cargo build --release --target wasm32-unknown-unknown
```

---

### Step 7: Export the ABI

To get a Solidity-compatible ABI (useful for frontends and other contracts):

```bash
cargo stylus export-abi
```

This outputs the ABI in Solidity interface format, which you can use with ethers.js, viem, or any EVM-compatible tooling.

---

### Step 8: Deploy the Contract

```bash
# Deploy to Arbitrum Sepolia testnet
cargo stylus deploy \
  --private-key <YOUR_PRIVATE_KEY> \
  --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

Alternatively, you can use a keystore file or environment variable:

```bash
# Using environment variable
export PRIVATE_KEY=0x...
cargo stylus deploy --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

The deployment process involves two on-chain transactions:
1. **Deploy**: Uploads the WASM bytecode to the chain
2. **Activate**: Compiles the WASM to native code on-chain (this makes execution fast)

Both steps happen automatically during `cargo stylus deploy`. The command outputs:
- The deployment transaction hash
- The contract address
- The activation transaction hash

---

### Step 9: Verify Deployment

```bash
cargo stylus verify \
  --deployment-tx <DEPLOYMENT_TX_HASH> \
  --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

---

### Step 10: Interact with the Deployed Contract

After deployment, you can interact with the contract using any standard Ethereum tooling since the ABI is Solidity-compatible:

**Using cast (Foundry):**
```bash
# Call initialize
cast send <CONTRACT_ADDRESS> \
  "initialize(string,string,uint8,uint256)" \
  "MyToken" "MTK" 18 1000000000000000000000000 \
  --private-key <PRIVATE_KEY> \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Check balance
cast call <CONTRACT_ADDRESS> \
  "balanceOf(address)" <YOUR_ADDRESS> \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# Transfer tokens
cast send <CONTRACT_ADDRESS> \
  "transfer(address,uint256)" <RECIPIENT> 1000000000000000000 \
  --private-key <PRIVATE_KEY> \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

**Using ethers.js / viem:**
The contract works identically to any Solidity ERC-20 from the caller's perspective. You use the same ABI and the same function signatures.

---

### Complete Project Structure

```
my-erc20-token/
├── Cargo.toml
├── Cargo.lock
├── rust-toolchain.toml    # May pin a specific Rust nightly version
└── src/
    └── lib.rs             # Main contract code
```

---

### Summary of CLI Commands (Full Workflow)

| Step | Command |
|------|---------|
| Install CLI | `cargo install cargo-stylus` |
| Add WASM target | `rustup target add wasm32-unknown-unknown` |
| Create project | `cargo stylus new my-erc20-token` |
| Write contract | Edit `src/lib.rs` |
| Export ABI | `cargo stylus export-abi` |
| Check validity | `cargo stylus check --endpoint <RPC_URL>` |
| Deploy | `cargo stylus deploy --private-key <KEY> --endpoint <RPC_URL>` |
| Verify | `cargo stylus verify --deployment-tx <TX_HASH> --endpoint <RPC_URL>` |
| Interact | Use `cast`, ethers.js, viem, or any EVM tool |

---

## Things I Am Less Certain About

1. **Exact `stylus-sdk` version and API**: The Stylus SDK has been evolving rapidly. The version number `0.6.0` is approximate -- the actual latest version at the time of reading may differ. Method names like `set_str`, `get_string`, `get`, `set` on storage types may have changed across versions.

2. **`sol_storage!` macro syntax**: I am fairly confident in the general pattern but the exact macro syntax for defining storage may have evolved. Earlier versions of Stylus used different patterns (e.g., `#[solidity_storage]` attribute instead of `sol_storage!` macro). The Solidity-style type syntax inside `sol_storage!` (e.g., `mapping(address => uint256)`) is what I recall for more recent versions, but earlier versions used Rust-style types like `StorageMap<Address, StorageU256>`.

3. **OpenZeppelin Stylus library**: The `openzeppelin-stylus` crate was under active development. I am not fully certain about the exact crate name, version, import paths, or whether it had reached a stable release by the time of my training cutoff. The `#[inherit(...)]` pattern is what I recall but the details may differ.

4. **Deployment CLI flag names**: The exact CLI flags for `cargo stylus deploy` (e.g., `--private-key` vs `--private-key-path`, the presence of `--endpoint` vs `--rpc-url`) may differ from what I have shown. The tool has gone through CLI changes.

5. **Activation step**: I believe deployment and activation are two separate on-chain transactions, and `cargo stylus deploy` handles both automatically. However, the exact mechanics (whether activation is always automatic or sometimes requires a separate command like `cargo stylus activate`) may have changed.

6. **Storage getter/setter API**: The pattern of using `.setter(key).set(value)` vs `.insert(key, value)` for `StorageMap` operations may not be exactly as shown. The Stylus SDK storage API has been one of the more frequently changing parts of the SDK.

7. **The `alloy-primitives` and `alloy-sol-types` crate versions**: These need to be compatible with the version of `stylus-sdk` used. I listed `0.7` but the actual compatible versions depend on the SDK version.

8. **`rust-toolchain.toml`**: Stylus often requires a specific Rust nightly version. I did not specify which nightly is required, as this changes frequently.

9. **String handling in storage**: How `StorageString` (or `string` in `sol_storage!`) works -- specifically the exact getter/setter method names -- is something I am moderately uncertain about.

10. **Constructor pattern**: Stylus contracts do not have Solidity-style constructors. The `initialize` pattern I showed is one approach, but there may be a more idiomatic way to handle initialization in the latest SDK version (such as a `#[constructor]` attribute or similar).

11. **The `#[entrypoint]` placement**: I placed it inside `sol_storage!` which I believe is correct for recent SDK versions, but earlier versions may have used it differently (e.g., as a separate attribute on the struct outside the macro).

12. **Import paths**: Whether `alloy_primitives` and `alloy_sol_types` are re-exported from `stylus_sdk` or need to be imported from their own crates directly may vary by SDK version.
