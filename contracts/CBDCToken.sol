// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract CBDCToken is ERC20, AccessControl, Pausable {
    using ECDSA for bytes32;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant POLICY_SETTER_ROLE = keccak256("POLICY_SETTER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public transactionCoolDown = 1 minutes; // Adjustable cool-down period
    uint256 public maxTransactionAmount = 1_000_000 * 10**18; // Maximum transaction amount

    mapping(address => bool) private _blacklistedAddresses;
    mapping(address => uint256) private _lastTransactionTimestamp;
    mapping(bytes32 => bool) private _usedNonces;

    event BlacklistStatusChanged(address indexed account, bool blacklisted);
    event OfflineTransactionProcessed(address indexed from, address indexed to, uint256 amount, bytes32 transactionId);
    event PolicyUpdated(string policyName, uint256 newValue);

    constructor() ERC20("CBDC Token", "CBDC") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        _setupRole(PAUSER_ROLE, msg.sender);
        _setupRole(BURNER_ROLE, msg.sender);
        _setupRole(POLICY_SETTER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds maximum supply");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    function setBlacklistStatus(address account, bool blacklisted) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _blacklistedAddresses[account] = blacklisted;
        emit BlacklistStatusChanged(account, blacklisted);
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklistedAddresses[account];
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setTransactionCoolDown(uint256 newCoolDown) public onlyRole(POLICY_SETTER_ROLE) {
        transactionCoolDown = newCoolDown;
        emit PolicyUpdated("TransactionCoolDown", newCoolDown);
    }

    function setMaxTransactionAmount(uint256 newMaxAmount) public onlyRole(POLICY_SETTER_ROLE) {
        maxTransactionAmount = newMaxAmount;
        emit PolicyUpdated("MaxTransactionAmount", newMaxAmount);
    }

    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        require(!_blacklistedAddresses[msg.sender] && !_blacklistedAddresses[to], "Blacklisted address");
        require(_lastTransactionTimestamp[msg.sender] + transactionCoolDown <= block.timestamp, "Transaction too soon");
        require(amount <= maxTransactionAmount, "Exceeds maximum transaction amount");
        _lastTransactionTimestamp[msg.sender] = block.timestamp;
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        require(!_blacklistedAddresses[from] && !_blacklistedAddresses[to], "Blacklisted address");
        require(_lastTransactionTimestamp[from] + transactionCoolDown <= block.timestamp, "Transaction too soon");
        require(amount <= maxTransactionAmount, "Exceeds maximum transaction amount");
        _lastTransactionTimestamp[from] = block.timestamp;
        return super.transferFrom(from, to, amount);
    }

    function processOfflineTransaction(
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 expirationTimestamp,
        bytes memory signature
    ) public whenNotPaused returns (bool) {
        require(block.timestamp <= expirationTimestamp, "Transaction expired");
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(from, to, amount, nonce, expirationTimestamp, address(this)))));
        address signer = messageHash.recover(signature);

        require(signer == from, "Invalid signature");
        require(!_blacklistedAddresses[from] && !_blacklistedAddresses[to], "Blacklisted address");
        require(!_usedNonces[messageHash], "Nonce already used");
        require(_lastTransactionTimestamp[from] + transactionCoolDown <= block.timestamp, "Transaction too soon");
        require(amount <= maxTransactionAmount, "Exceeds maximum transaction amount");

        _usedNonces[messageHash] = true;
        _lastTransactionTimestamp[from] = block.timestamp;
        _transfer(from, to, amount);

        emit OfflineTransactionProcessed(from, to, amount, messageHash);
        return true;
    }

    function processBulkOfflineTransactions(
        address[] memory froms,
        address[] memory tos,
        uint256[] memory amounts,
        uint256[] memory nonces,
        uint256[] memory expirationTimestamps,
        bytes[] memory signatures
    ) public whenNotPaused returns (bool) {
        require(froms.length == tos.length && froms.length == amounts.length && froms.length == nonces.length && froms.length == expirationTimestamps.length && froms.length == signatures.length, "Input arrays length mismatch");

        for (uint i = 0; i < froms.length; i++) {
            bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked(froms[i], tos[i], amounts[i], nonces[i], expirationTimestamps[i], address(this)))));
            address signer = messageHash.recover(signatures[i]);

            require(signer == froms[i], "Invalid signature");
            require(!_blacklistedAddresses[froms[i]] && !_blacklistedAddresses[tos[i]], "Blacklisted address");
            require(!_usedNonces[messageHash], "Nonce already used");
            require(amounts[i] <= maxTransactionAmount, "Exceeds maximum transaction amount");
            require(block.timestamp <= expirationTimestamps[i], "Transaction expired");

            _usedNonces[messageHash] = true;
            _transfer(froms[i], tos[i], amounts[i]);

            emit OfflineTransactionProcessed(froms[i], tos[i], amounts[i], messageHash);
        }

        return true;
    }
}
