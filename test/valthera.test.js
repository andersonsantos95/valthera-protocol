const { expect } = require("chai");
const { ethers } = require("hardhat");

// Preços simulados (8 decimais, padrão Chainlink)
const GOLD_PRICE   = 200000000000n; // $2.000
const SILVER_PRICE =   3000000000n; // $30

async function deploy() {
  const [owner, user1, user2] = await ethers.getSigners();

  const MockV3   = await ethers.getContractFactory("MockV3Aggregator");
  const Assets   = await ethers.getContractFactory("ValtheraAssets");
  const NFT      = await ethers.getContractFactory("ValtheraNFT");
  const DeFi     = await ethers.getContractFactory("ValtheraDeFi");
  const DAO      = await ethers.getContractFactory("ValtheraDAO");
  const Market   = await ethers.getContractFactory("ValtheraMarket");

  const mockGold   = await MockV3.deploy(GOLD_PRICE);
  const mockSilver = await MockV3.deploy(SILVER_PRICE);
  const valt       = await Assets.deploy("Valthera Token", "VALT", owner.address);
  const nft        = await NFT.deploy(owner.address);
  const defi       = await DeFi.deploy(await valt.getAddress(), await nft.getAddress());

  const defiAddr = await defi.getAddress();
  const vGold    = await Assets.deploy("Valthera Gold",      "vGOLD",     defiAddr);
  const vSilver  = await Assets.deploy("Valthera Silver",    "vSILVER",   defiAddr);
  const lpGold   = await Assets.deploy("Valthera LP-GOLD",   "vLP-GOLD",  defiAddr);
  const lpSilver = await Assets.deploy("Valthera LP-SILVER", "vLP-SILVER",defiAddr);

  await valt.transferOwnership(defiAddr);
  await nft.transferOwnership(defiAddr);

  await defi.setupAsset(await vGold.getAddress(),   await lpGold.getAddress());
  await defi.setupAsset(await vSilver.getAddress(), await lpSilver.getAddress());
  await defi.setOracleFeed(await vGold.getAddress(),   await mockGold.getAddress());
  await defi.setOracleFeed(await vSilver.getAddress(), await mockSilver.getAddress());

  const dao = await DAO.deploy(await valt.getAddress(), defiAddr);
  await defi.setDaoContract(await dao.getAddress());

  const market = await Market.deploy(await nft.getAddress(), defiAddr);

  return { owner, user1, user2, mockGold, mockSilver, valt, nft, defi, dao, market, vGold, vSilver, lpGold, lpSilver };
}

// ─── MockV3Aggregator ────────────────────────────────────────────────────────
describe("MockV3Aggregator", () => {
  it("retorna o preço configurado no construtor", async () => {
    const MockV3 = await ethers.getContractFactory("MockV3Aggregator");
    const mock = await MockV3.deploy(GOLD_PRICE);
    const [, answer] = await mock.latestRoundData();
    expect(answer).to.equal(GOLD_PRICE);
  });
});

// ─── ValtheraAssets ──────────────────────────────────────────────────────────
describe("ValtheraAssets", () => {
  it("owner pode cunhar tokens", async () => {
    const [owner, user] = await ethers.getSigners();
    const Assets = await ethers.getContractFactory("ValtheraAssets");
    const token = await Assets.deploy("Test", "TST", owner.address);
    await token.mint(user.address, 100n);
    expect(await token.balanceOf(user.address)).to.equal(100n);
  });

  it("owner pode queimar tokens", async () => {
    const [owner, user] = await ethers.getSigners();
    const Assets = await ethers.getContractFactory("ValtheraAssets");
    const token = await Assets.deploy("Test", "TST", owner.address);
    await token.mint(user.address, 100n);
    await token.burn(user.address, 40n);
    expect(await token.balanceOf(user.address)).to.equal(60n);
  });

  it("não-owner não pode cunhar", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const Assets = await ethers.getContractFactory("ValtheraAssets");
    const token = await Assets.deploy("Test", "TST", owner.address);
    await expect(token.connect(attacker).mint(attacker.address, 100n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });
});

// ─── ValtheraNFT ─────────────────────────────────────────────────────────────
describe("ValtheraNFT", () => {
  it("owner pode cunhar NFT com descrição", async () => {
    const [owner, user] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("ValtheraNFT");
    const nft = await NFT.deploy(owner.address);
    await nft.mintNFT(user.address, "Imóvel SP");
    expect(await nft.ownerOf(0)).to.equal(user.address);
    expect(await nft.descriptions(0)).to.equal("Imóvel SP");
    expect(await nft.totalSupply()).to.equal(1n);
  });

  it("não-owner não pode cunhar NFT", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const NFT = await ethers.getContractFactory("ValtheraNFT");
    const nft = await NFT.deploy(owner.address);
    await expect(nft.connect(attacker).mintNFT(attacker.address, "Fraude"))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });
});

// ─── ValtheraDeFi ────────────────────────────────────────────────────────────
describe("ValtheraDeFi", () => {
  describe("Configuração", () => {
    it("ativos são registrados corretamente", async () => {
      const { defi, vGold } = await deploy();
      expect(await defi.supportedAssets(await vGold.getAddress())).to.be.true;
    });

    it("oráculo retorna preço correto em 18 decimais", async () => {
      const { defi, vGold } = await deploy();
      const price = await defi.getAssetPriceUSD(await vGold.getAddress());
      // $2000 com 8 dec × 1e10 = 2000e18
      expect(price).to.equal(GOLD_PRICE * 10n ** 10n);
    });

    it("rejeita oráculo para ativo não suportado", async () => {
      const { defi, mockGold } = await deploy();
      const [, , , randomAddr] = await ethers.getSigners();
      await expect(
        defi.setOracleFeed(randomAddr.address, await mockGold.getAddress())
      ).to.be.revertedWith("Ativo nao suportado");
    });
  });

  describe("Depósito e Retirada", () => {
    it("depositRealAsset cunha vGOLD para o usuário", async () => {
      const { defi, vGold, user1 } = await deploy();
      const amount = ethers.parseEther("10");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      expect(await vGold.balanceOf(user1.address)).to.equal(amount);
    });

    it("withdrawRealAsset queima vGOLD do usuário", async () => {
      const { defi, vGold, user1 } = await deploy();
      const amount = ethers.parseEther("10");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      await defi.connect(user1).withdrawRealAsset(await vGold.getAddress(), amount);
      expect(await vGold.balanceOf(user1.address)).to.equal(0n);
    });

    it("rejeita depósito de ativo não suportado", async () => {
      const { defi, user1 } = await deploy();
      const [, , , random] = await ethers.getSigners();
      await expect(
        defi.connect(user1).depositRealAsset(random.address, 1n)
      ).to.be.revertedWith("Ativo nao suportado");
    });
  });

  describe("Registro de NFT", () => {
    it("registerRealAssetNFT cunha NFT para o chamador", async () => {
      const { defi, nft, user1 } = await deploy();
      await defi.connect(user1).registerRealAssetNFT("Fazenda MG");
      expect(await nft.ownerOf(0)).to.equal(user1.address);
      expect(await nft.descriptions(0)).to.equal("Fazenda MG");
    });
  });

  describe("Liquidez e Recompensas", () => {
    it("provideLiquidity transfere tokens e cunha LP", async () => {
      const { defi, vGold, lpGold, user1 } = await deploy();
      const amount = ethers.parseEther("100");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      await vGold.connect(user1).approve(await defi.getAddress(), amount);

      await defi.connect(user1).provideLiquidity(await vGold.getAddress(), amount);

      expect(await vGold.balanceOf(user1.address)).to.equal(0n);
      expect(await lpGold.balanceOf(user1.address)).to.equal(amount);
      expect(await defi.userStakedBalance(await vGold.getAddress(), user1.address)).to.equal(amount);
    });

    it("removeLiquidity devolve tokens e queima LP", async () => {
      const { defi, vGold, lpGold, user1 } = await deploy();
      const amount = ethers.parseEther("100");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      await vGold.connect(user1).approve(await defi.getAddress(), amount);
      await defi.connect(user1).provideLiquidity(await vGold.getAddress(), amount);

      await defi.connect(user1).removeLiquidity(await vGold.getAddress(), amount);

      expect(await vGold.balanceOf(user1.address)).to.equal(amount);
      expect(await lpGold.balanceOf(user1.address)).to.equal(0n);
    });

    it("recompensa acumula após intervalo de tempo", async () => {
      const { defi, vGold, user1 } = await deploy();
      const amount = ethers.parseEther("100");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      await vGold.connect(user1).approve(await defi.getAddress(), amount);
      await defi.connect(user1).provideLiquidity(await vGold.getAddress(), amount);

      // Avança 120 segundos (2 intervalos de 60s)
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");

      const pending = await defi.getPendingReward(user1.address, await vGold.getAddress());
      expect(pending).to.be.gt(0n);
    });

    it("claimGlobalRewards cunha VALT para o usuário", async () => {
      const { defi, valt, vGold, user1 } = await deploy();
      const amount = ethers.parseEther("100");
      await defi.connect(user1).depositRealAsset(await vGold.getAddress(), amount);
      await vGold.connect(user1).approve(await defi.getAddress(), amount);
      await defi.connect(user1).provideLiquidity(await vGold.getAddress(), amount);

      // Avança tempo suficiente para superar minClaimAmount (5 VALT)
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      const balanceAntes = await valt.balanceOf(user1.address);
      await defi.connect(user1).claimGlobalRewards();
      expect(await valt.balanceOf(user1.address)).to.be.gt(balanceAntes);
    });

    it("removeLiquidity abaixo do saldo reverte", async () => {
      const { defi, vGold, user1 } = await deploy();
      await expect(
        defi.connect(user1).removeLiquidity(await vGold.getAddress(), 1n)
      ).to.be.revertedWith("Saldo insuficiente");
    });
  });
});

// ─── ValtheraDAO ─────────────────────────────────────────────────────────────
describe("ValtheraDAO", () => {
  async function deployWithValt() {
    const ctx = await deploy();
    const amount = ethers.parseEther("1000");
    // Dá VALT para user1 e user2 via depósito+claim simulado
    await ctx.defi.connect(ctx.user1).depositRealAsset(await ctx.vGold.getAddress(), ethers.parseEther("500"));
    await ctx.vGold.connect(ctx.user1).approve(await ctx.defi.getAddress(), ethers.parseEther("500"));
    await ctx.defi.connect(ctx.user1).provideLiquidity(await ctx.vGold.getAddress(), ethers.parseEther("500"));
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");
    await ctx.defi.connect(ctx.user1).claimGlobalRewards();
    return ctx;
  }

  it("cria proposta com saldo VALT", async () => {
    const { dao, user1 } = await deployWithValt();
    await dao.connect(user1).createProposal("Aumentar reward", 0, ethers.parseEther("2"));
    const [desc] = await dao.getProposalDetails(0);
    expect(desc).to.equal("Aumentar reward");
  });

  it("vota em proposta aberta", async () => {
    const { dao, user1 } = await deployWithValt();
    await dao.connect(user1).createProposal("Aumentar reward", 0, ethers.parseEther("2"));
    await dao.connect(user1).vote(0, true);
    const [, , , , votesFor] = await dao.getProposalDetails(0);
    expect(votesFor).to.be.gt(0n);
  });

  it("executa proposta aprovada e atualiza parâmetro no DeFi", async () => {
    const { dao, defi, user1 } = await deployWithValt();
    const novoValor = ethers.parseEther("2");
    await dao.connect(user1).createProposal("Dobrar reward", 0, novoValor);
    await dao.connect(user1).vote(0, true);

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine");

    await dao.executeProposal(0);
    expect(await defi.rewardRateX()).to.equal(novoValor);
  });

  it("não vota duas vezes", async () => {
    const { dao, user1 } = await deployWithValt();
    await dao.connect(user1).createProposal("Teste", 1, 30n);
    await dao.connect(user1).vote(0, true);
    await expect(dao.connect(user1).vote(0, true)).to.be.revertedWith("Ja votou");
  });

  it("não cria proposta sem VALT", async () => {
    const { dao, user2 } = await deploy();
    await expect(
      dao.connect(user2).createProposal("Sem saldo", 0, 1n)
    ).to.be.revertedWith("Sem VALT");
  });
});

// ─── ValtheraMarket ──────────────────────────────────────────────────────────
describe("ValtheraMarket", () => {
  async function deployWithNFT() {
    const ctx = await deploy();
    // Registra NFT para user1 via DeFi
    await ctx.defi.connect(ctx.user1).registerRealAssetNFT("Galpão RJ");
    // Dá vGOLD para user2 (comprador)
    await ctx.defi.connect(ctx.user2).depositRealAsset(
      await ctx.vGold.getAddress(), ethers.parseEther("500")
    );
    return ctx;
  }

  it("lista NFT para venda", async () => {
    const { market, nft, vGold, user1 } = await deployWithNFT();
    await nft.connect(user1).approve(await market.getAddress(), 0);
    await market.connect(user1).listNFT(0, ethers.parseEther("100"), await vGold.getAddress());
    const [seller, , , isActive] = await market.listings(0);
    expect(seller).to.equal(user1.address);
    expect(isActive).to.be.true;
  });

  it("compra NFT e transfere tokens", async () => {
    const { market, nft, vGold, user1, user2 } = await deployWithNFT();
    const price = ethers.parseEther("100");
    await nft.connect(user1).approve(await market.getAddress(), 0);
    await market.connect(user1).listNFT(0, price, await vGold.getAddress());

    await vGold.connect(user2).approve(await market.getAddress(), price);
    await market.connect(user2).buyNFT(0);

    expect(await nft.ownerOf(0)).to.equal(user2.address);
    expect(await vGold.balanceOf(user1.address)).to.equal(price);
  });

  it("rejeita compra de NFT não listado", async () => {
    const { market, user2 } = await deploy();
    await expect(market.connect(user2).buyNFT(99)).to.be.revertedWith("Nao listado");
  });

  it("rejeita listagem com token de pagamento inválido", async () => {
    const { market, nft, user1, user2 } = await deployWithNFT();
    await nft.connect(user1).approve(await market.getAddress(), 0);
    await expect(
      market.connect(user1).listNFT(0, 100n, user2.address)
    ).to.be.revertedWith("Token de pagamento invalido");
  });
});