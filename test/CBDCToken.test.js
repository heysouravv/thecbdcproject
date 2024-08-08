const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CBDCToken", function () {
  let CBDCToken, cbdcToken, owner, addr1, addr2, addr3, addr4;
  let MINTER_ROLE, PAUSER_ROLE, BURNER_ROLE, POLICY_SETTER_ROLE;

  beforeEach(async function () {
    CBDCToken = await ethers.getContractFactory("CBDCToken");
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    cbdcToken = await CBDCToken.deploy();
    await cbdcToken.deployed();

    MINTER_ROLE = await cbdcToken.MINTER_ROLE();
    PAUSER_ROLE = await cbdcToken.PAUSER_ROLE();
    BURNER_ROLE = await cbdcToken.BURNER_ROLE();
    POLICY_SETTER_ROLE = await cbdcToken.POLICY_SETTER_ROLE();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(
        await cbdcToken.hasRole(
          await cbdcToken.DEFAULT_ADMIN_ROLE(),
          owner.address
        )
      ).to.equal(true);
    });

    it("Should assign the minter role to the owner", async function () {
      expect(await cbdcToken.hasRole(MINTER_ROLE, owner.address)).to.equal(
        true
      );
    });

    it("Should have correct name and symbol", async function () {
      expect(await cbdcToken.name()).to.equal("CBDC Token");
      expect(await cbdcToken.symbol()).to.equal("CBDC");
    });
  });

  describe("Minting", function () {
    it("Should allow minting by minter role", async function () {
      await cbdcToken.mint(addr1.address, 100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(100);
    });

    it("Should fail if minting by non-minter", async function () {
      await expect(cbdcToken.connect(addr1).mint(addr2.address, 100)).to.be
        .reverted;
    });

    it("Should not allow minting beyond max supply", async function () {
      const maxSupply = await cbdcToken.MAX_SUPPLY();
      await expect(
        cbdcToken.mint(addr1.address, maxSupply.add(1))
      ).to.be.revertedWith("Exceeds maximum supply");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await cbdcToken.mint(addr1.address, 1000);
    });

    it("Should allow burning by burner role", async function () {
      await cbdcToken.burn(addr1.address, 100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(900);
    });

    it("Should fail if burning by non-burner", async function () {
      await expect(cbdcToken.connect(addr1).burn(addr1.address, 100)).to.be
        .reverted;
    });
  });

  describe("Blacklisting", function () {
    beforeEach(async function () {
      await cbdcToken.mint(owner.address, 1000);
    });

    it("Should allow blacklisting by admin", async function () {
      await cbdcToken.setBlacklistStatus(addr1.address, true);
      expect(await cbdcToken.isBlacklisted(addr1.address)).to.equal(true);
    });

    it("Should prevent transfers to/from blacklisted addresses", async function () {
      await cbdcToken.setBlacklistStatus(addr1.address, true);
      await expect(cbdcToken.transfer(addr1.address, 100)).to.be.revertedWith(
        "Blacklisted address"
      );
    });

    it("Should allow transfers after removing from blacklist", async function () {
      await cbdcToken.setBlacklistStatus(addr1.address, true);
      await cbdcToken.setBlacklistStatus(addr1.address, false);
      await cbdcToken.transfer(addr1.address, 100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(100);
    });
  });

  describe("Pausing", function () {
    beforeEach(async function () {
      await cbdcToken.mint(owner.address, 1000);
    });

    it("Should allow pausing by pauser role", async function () {
      await cbdcToken.pause();
      expect(await cbdcToken.paused()).to.equal(true);
    });

    it("Should prevent transfers when paused", async function () {
      await cbdcToken.pause();
      await expect(cbdcToken.transfer(addr1.address, 100)).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("Should allow unpausing by pauser role", async function () {
      await cbdcToken.pause();
      await cbdcToken.unpause();
      expect(await cbdcToken.paused()).to.equal(false);
    });

    it("Should allow transfers after unpausing", async function () {
      await cbdcToken.pause();
      await cbdcToken.unpause();
      await cbdcToken.transfer(addr1.address, 100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(100);
    });
  });

  describe("Transaction Policies", function () {
    beforeEach(async function () {
      await cbdcToken.mint(owner.address, 1000000);
    });

    it("Should enforce transaction cool down", async function () {
      await cbdcToken.transfer(addr1.address, 100);
      await expect(cbdcToken.transfer(addr1.address, 100)).to.be.revertedWith(
        "Transaction too soon"
      );
    });

    it("Should enforce max transaction amount", async function () {
      const maxAmount = await cbdcToken.maxTransactionAmount();
      await expect(
        cbdcToken.transfer(addr1.address, maxAmount.add(1))
      ).to.be.revertedWith("Exceeds maximum transaction amount");
    });

    it("Should allow policy setter to update cool down period", async function () {
      await cbdcToken.setTransactionCoolDown(2 * 60); // 2 minutes
      expect(await cbdcToken.transactionCoolDown()).to.equal(2 * 60);
    });

    it("Should allow policy setter to update max transaction amount", async function () {
      await cbdcToken.setMaxTransactionAmount(2000000);
      expect(await cbdcToken.maxTransactionAmount()).to.equal(2000000);
    });

    it("Should not allow non-policy setter to update policies", async function () {
      await expect(cbdcToken.connect(addr1).setTransactionCoolDown(2 * 60)).to
        .be.reverted;
      await expect(cbdcToken.connect(addr1).setMaxTransactionAmount(2000000)).to
        .be.reverted;
    });
  });

  describe("Offline Transactions", function () {
    beforeEach(async function () {
      await cbdcToken.mint(addr1.address, 1000);
    });

    it("Should process valid offline transaction", async function () {
      const value = {
        from: addr1.address,
        to: addr2.address,
        amount: 100,
        nonce: 1,
        expirationTimestamp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "address", "uint256", "uint256", "uint256", "address"],
        [
          value.from,
          value.to,
          value.amount,
          value.nonce,
          value.expirationTimestamp,
          cbdcToken.address,
        ]
      );
      const signature = await addr1.signMessage(
        ethers.utils.arrayify(messageHash)
      );

      await cbdcToken.processOfflineTransaction(
        value.from,
        value.to,
        value.amount,
        value.nonce,
        value.expirationTimestamp,
        signature
      );

      expect(await cbdcToken.balanceOf(addr2.address)).to.equal(100);
    });

    it("Should reject expired offline transaction", async function () {
      const value = {
        from: addr1.address,
        to: addr2.address,
        amount: 100,
        nonce: 1,
        expirationTimestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "address", "uint256", "uint256", "uint256", "address"],
        [
          value.from,
          value.to,
          value.amount,
          value.nonce,
          value.expirationTimestamp,
          cbdcToken.address,
        ]
      );
      const signature = await addr1.signMessage(
        ethers.utils.arrayify(messageHash)
      );

      await expect(
        cbdcToken.processOfflineTransaction(
          value.from,
          value.to,
          value.amount,
          value.nonce,
          value.expirationTimestamp,
          signature
        )
      ).to.be.revertedWith("Transaction expired");
    });

    it("Should reject offline transaction with invalid signature", async function () {
      const value = {
        from: addr1.address,
        to: addr2.address,
        amount: 100,
        nonce: 1,
        expirationTimestamp: Math.floor(Date.now() / 1000) + 3600,
      };

      const messageHash = ethers.utils.solidityKeccak256(
        ["address", "address", "uint256", "uint256", "uint256", "address"],
        [
          value.from,
          value.to,
          value.amount,
          value.nonce,
          value.expirationTimestamp,
          cbdcToken.address,
        ]
      );
      const signature = await addr2.signMessage(
        ethers.utils.arrayify(messageHash)
      ); // Wrong signer

      await expect(
        cbdcToken.processOfflineTransaction(
          value.from,
          value.to,
          value.amount,
          value.nonce,
          value.expirationTimestamp,
          signature
        )
      ).to.be.revertedWith("Invalid signature");
    });
  });

  describe("Bulk Offline Transactions", function () {
    beforeEach(async function () {
      await cbdcToken.mint(addr1.address, 1000);
      await cbdcToken.mint(addr2.address, 1000);
    });

    it("Should process valid bulk offline transactions", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const transactions = [
        {
          from: addr1.address,
          to: addr3.address,
          amount: 100,
          nonce: 1,
          expirationTimestamp: currentTimestamp + 3600,
        },
        {
          from: addr2.address,
          to: addr4.address,
          amount: 200,
          nonce: 2,
          expirationTimestamp: currentTimestamp + 3600,
        },
      ];

      const signatures = await Promise.all(
        transactions.map(async (tx, index) => {
          const signer = index === 0 ? addr1 : addr2;
          const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "uint256", "uint256", "address"],
            [
              tx.from,
              tx.to,
              tx.amount,
              tx.nonce,
              tx.expirationTimestamp,
              cbdcToken.address,
            ]
          );
          return signer.signMessage(ethers.utils.arrayify(messageHash));
        })
      );

      await cbdcToken.processBulkOfflineTransactions(
        transactions.map((tx) => tx.from),
        transactions.map((tx) => tx.to),
        transactions.map((tx) => tx.amount),
        transactions.map((tx) => tx.nonce),
        transactions.map((tx) => tx.expirationTimestamp),
        signatures
      );

      expect(await cbdcToken.balanceOf(addr3.address)).to.equal(100);
      expect(await cbdcToken.balanceOf(addr4.address)).to.equal(200);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(900);
      expect(await cbdcToken.balanceOf(addr2.address)).to.equal(800);
    });

    it("Should reject bulk transaction if one transaction is invalid", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const transactions = [
        {
          from: addr1.address,
          to: addr3.address,
          amount: 100,
          nonce: 1,
          expirationTimestamp: currentTimestamp + 3600,
        },
        {
          from: addr2.address,
          to: addr4.address,
          amount: 2000, // Exceeds balance
          nonce: 2,
          expirationTimestamp: currentTimestamp + 3600,
        },
      ];

      const signatures = await Promise.all(
        transactions.map(async (tx, index) => {
          const signer = index === 0 ? addr1 : addr2;
          const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "uint256", "uint256", "address"],
            [
              tx.from,
              tx.to,
              tx.amount,
              tx.nonce,
              tx.expirationTimestamp,
              cbdcToken.address,
            ]
          );
          return signer.signMessage(ethers.utils.arrayify(messageHash));
        })
      );

      await expect(
        cbdcToken.processBulkOfflineTransactions(
          transactions.map((tx) => tx.from),
          transactions.map((tx) => tx.to),
          transactions.map((tx) => tx.amount),
          transactions.map((tx) => tx.nonce),
          transactions.map((tx) => tx.expirationTimestamp),
          signatures
        )
      ).to.be.reverted;

      // Check that no transfers occurred
      expect(await cbdcToken.balanceOf(addr3.address)).to.equal(0);
      expect(await cbdcToken.balanceOf(addr4.address)).to.equal(0);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(1000);
      expect(await cbdcToken.balanceOf(addr2.address)).to.equal(1000);
    });

    it("Should reject bulk transaction with mismatched array lengths", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const transactions = [
        {
          from: addr1.address,
          to: addr3.address,
          amount: 100,
          nonce: 1,
          expirationTimestamp: currentTimestamp + 3600,
        },
      ];

      const signatures = await Promise.all(
        transactions.map(async (tx) => {
          const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "uint256", "uint256", "address"],
            [
              tx.from,
              tx.to,
              tx.amount,
              tx.nonce,
              tx.expirationTimestamp,
              cbdcToken.address,
            ]
          );
          return addr1.signMessage(ethers.utils.arrayify(messageHash));
        })
      );

      await expect(
        cbdcToken.processBulkOfflineTransactions(
          transactions.map((tx) => tx.from),
          transactions.map((tx) => tx.to),
          transactions.map((tx) => tx.amount),
          transactions.map((tx) => tx.nonce),
          transactions.map((tx) => tx.expirationTimestamp),
          [...signatures, "0x"] // Add an extra signature
        )
      ).to.be.revertedWith("Input arrays length mismatch");
    });

    it("Should reject bulk transaction if one signature is invalid", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const transactions = [
        {
          from: addr1.address,
          to: addr3.address,
          amount: 100,
          nonce: 1,
          expirationTimestamp: currentTimestamp + 3600,
        },
        {
          from: addr2.address,
          to: addr4.address,
          amount: 200,
          nonce: 2,
          expirationTimestamp: currentTimestamp + 3600,
        },
      ];

      const signatures = await Promise.all(
        transactions.map(async (tx) => {
          const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "uint256", "uint256", "address"],
            [
              tx.from,
              tx.to,
              tx.amount,
              tx.nonce,
              tx.expirationTimestamp,
              cbdcToken.address,
            ]
          );
          return addr1.signMessage(ethers.utils.arrayify(messageHash)); // Both signed by addr1
        })
      );

      await expect(
        cbdcToken.processBulkOfflineTransactions(
          transactions.map((tx) => tx.from),
          transactions.map((tx) => tx.to),
          transactions.map((tx) => tx.amount),
          transactions.map((tx) => tx.nonce),
          transactions.map((tx) => tx.expirationTimestamp),
          signatures
        )
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should reject bulk transaction if one transaction is expired", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const transactions = [
        {
          from: addr1.address,
          to: addr3.address,
          amount: 100,
          nonce: 1,
          expirationTimestamp: currentTimestamp + 3600,
        },
        {
          from: addr2.address,
          to: addr4.address,
          amount: 200,
          nonce: 2,
          expirationTimestamp: currentTimestamp - 3600, // Expired
        },
      ];

      const signatures = await Promise.all(
        transactions.map(async (tx, index) => {
          const signer = index === 0 ? addr1 : addr2;
          const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "uint256", "uint256", "address"],
            [
              tx.from,
              tx.to,
              tx.amount,
              tx.nonce,
              tx.expirationTimestamp,
              cbdcToken.address,
            ]
          );
          return signer.signMessage(ethers.utils.arrayify(messageHash));
        })
      );

      await expect(
        cbdcToken.processBulkOfflineTransactions(
          transactions.map((tx) => tx.from),
          transactions.map((tx) => tx.to),
          transactions.map((tx) => tx.amount),
          transactions.map((tx) => tx.nonce),
          transactions.map((tx) => tx.expirationTimestamp),
          signatures
        )
      ).to.be.revertedWith("Transaction expired");
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant roles", async function () {
      await cbdcToken.grantRole(MINTER_ROLE, addr1.address);
      expect(await cbdcToken.hasRole(MINTER_ROLE, addr1.address)).to.equal(
        true
      );
    });

    it("Should allow admin to revoke roles", async function () {
      await cbdcToken.grantRole(MINTER_ROLE, addr1.address);
      await cbdcToken.revokeRole(MINTER_ROLE, addr1.address);
      expect(await cbdcToken.hasRole(MINTER_ROLE, addr1.address)).to.equal(
        false
      );
    });

    it("Should not allow non-admin to grant roles", async function () {
      await expect(
        cbdcToken.connect(addr1).grantRole(MINTER_ROLE, addr2.address)
      ).to.be.reverted;
    });

    it("Should not allow non-admin to revoke roles", async function () {
      await cbdcToken.grantRole(MINTER_ROLE, addr1.address);
      await expect(
        cbdcToken.connect(addr2).revokeRole(MINTER_ROLE, addr1.address)
      ).to.be.reverted;
    });
  });

  describe("ERC20 Functionality", function () {
    beforeEach(async function () {
      await cbdcToken.mint(addr1.address, 1000);
    });

    it("Should allow token transfers", async function () {
      await cbdcToken.connect(addr1).transfer(addr2.address, 100);
      expect(await cbdcToken.balanceOf(addr2.address)).to.equal(100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(900);
    });

    it("Should allow token approvals and transferFrom", async function () {
      await cbdcToken.connect(addr1).approve(addr2.address, 100);
      await cbdcToken
        .connect(addr2)
        .transferFrom(addr1.address, addr3.address, 100);
      expect(await cbdcToken.balanceOf(addr3.address)).to.equal(100);
      expect(await cbdcToken.balanceOf(addr1.address)).to.equal(900);
    });

    it("Should emit Transfer event on transfer", async function () {
      const tx = await cbdcToken.connect(addr1).transfer(addr2.address, 100);
      const receipt = await tx.wait();
      const transferEvent = receipt.events?.find((e) => e.event === "Transfer");
      expect(transferEvent).to.not.be.undefined;
      expect(transferEvent?.args?.from).to.equal(addr1.address);
      expect(transferEvent?.args?.to).to.equal(addr2.address);
      expect(transferEvent?.args?.value).to.equal(100);
    });

    it("Should emit Approval event on approval", async function () {
      const tx = await cbdcToken.connect(addr1).approve(addr2.address, 100);
      const receipt = await tx.wait();
      const approvalEvent = receipt.events?.find((e) => e.event === "Approval");
      expect(approvalEvent).to.not.be.undefined;
      expect(approvalEvent?.args?.owner).to.equal(addr1.address);
      expect(approvalEvent?.args?.spender).to.equal(addr2.address);
      expect(approvalEvent?.args?.value).to.equal(100);
    });
  });
});
