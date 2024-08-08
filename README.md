# CBDCToken Project

## Overview

CBDCToken is a smart contract implementation of a Central Bank Digital Currency (CBDC) token on the Ethereum blockchain. This project demonstrates key features that a CBDC might require, including:

- ERC20 token functionality
- Know Your Customer (KYC) verification
- Blacklisting capabilities
- Transaction limits and cool-down periods
- Offline transaction processing
- Role-based access control

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Contract Details](#contract-details)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Usage](#usage)
7. [Security Considerations](#security-considerations)
8. [Contributing](#contributing)
9. [License](#license)

## Prerequisites

- Node.js (v12.0.0 or later)
- npm (v6.0.0 or later)
- Hardhat

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/cbdc-token.git
   cd cbdc-token
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Contract Details

The CBDCToken contract (`contracts/CBDCToken.sol`) implements the following key features:

### ERC20 Functionality
- Standard ERC20 token features (transfer, approve, transferFrom)
- Minting and burning capabilities

### Access Control
- MINTER_ROLE: Can mint new tokens
- PAUSER_ROLE: Can pause/unpause the contract
- BURNER_ROLE: Can burn tokens
- POLICY_SETTER_ROLE: Can modify transaction policies
- KYC_ADMIN_ROLE: Can set KYC status for addresses

### KYC (Know Your Customer)
- KYC verification status for each address
- Transactions restricted to KYC-verified addresses

### Blacklisting
- Ability to blacklist/unblacklist addresses
- Blacklisted addresses cannot send or receive tokens

### Transaction Limits
- Maximum transaction amount
- Cool-down period between transactions

### Offline Transactions
- Support for processing signed offline transactions
- Nonce-based replay protection

### Pausability
- Ability to pause all token transfers in case of emergencies

## Testing

The project includes a comprehensive test suite (`test/CBDCToken.test.js`) covering all major functionalities of the contract. To run the tests:

```
npx hardhat test
```

The test suite includes:
- Deployment tests
- Minting and burning tests
- KYC functionality tests
- Blacklisting tests
- Transaction limit tests
- Offline transaction tests
- Pausing functionality tests
- Policy setting tests

## Deployment

To deploy the contract to a network:

1. Set up your network configuration in `hardhat.config.js`
2. Run the deployment script:
   ```
   npx hardhat run scripts/deploy.js --network <your-network>
   ```

## Usage

After deployment, interact with the contract using ethers.js or web3.js. Here are some example operations:

```javascript
// Minting tokens (requires MINTER_ROLE)
await cbdcToken.mint(recipientAddress, amount);

// Setting KYC status (requires KYC_ADMIN_ROLE)
await cbdcToken.setKYCStatus(userAddress, true, verificationLevel);

// Transferring tokens (sender and recipient must be KYC verified)
await cbdcToken.transfer(recipientAddress, amount);

// Processing offline transaction
await cbdcToken.processOfflineTransaction(from, to, amount, nonce, expirationTimestamp, signature);
```

## Security Considerations

- Ensure proper key management for addresses with special roles (MINTER_ROLE, KYC_ADMIN_ROLE, etc.)
- Regularly audit and update the KYC and blacklist status of addresses
- Monitor large transactions and unusual activity patterns
- Implement additional security measures like multi-sig wallets for critical operations
- Regularly update the contract to address potential vulnerabilities

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to your branch
5. Create a pull request

Please ensure your code adheres to the existing style and passes all tests.

License

This project is proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without the express permission of Databun.
All rights reserved.
This software is intended for authorized use only. It may be subject to export control laws and regulations. By accessing or using this software, you agree to comply with all applicable laws and regulations.
For licensing inquiries, please contact sourav@databun.co .
