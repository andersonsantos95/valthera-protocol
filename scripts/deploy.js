const { ethers } = require("hardhat");

const GOLD_PRICE_USD   = 200000000000n;
const SILVER_PRICE_USD =   3000000000n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n=== Valthera Protocol — Deploy Local ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Saldo:    ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  console.log("1/9  Deployando oráculos simulados...");
  const MockV3 = await ethers.getContractFactory("MockV3Aggregator");
  const mockGold   = await MockV3.deploy(GOLD_PRICE_USD);
  const mockSilver = await MockV3.deploy(SILVER_PRICE_USD);
  await mockGold.waitForDeployment();
  await mockSilver.waitForDeployment();
  console.log(`     MockGold:   ${await mockGold.getAddress()}`);
  console.log(`     MockSilver: ${await mockSilver.getAddress()}`);

  console.log("\n2/9  Deployando VALT token...");
  const Assets = await ethers.getContractFactory("ValtheraAssets");
  const valt = await Assets.deploy("Valthera Token", "VALT", deployer.address);
  await valt.waitForDeployment();
  console.log(`     VALT: ${await valt.getAddress()}`);

  console.log("\n3/9  Deployando ValtheraNFT...");
  const NFT = await ethers.getContractFactory("ValtheraNFT");
  const nft = await NFT.deploy(deployer.address);
  await nft.waitForDeployment();
  console.log(`     ValtheraNFT: ${await nft.getAddress()}`);

  console.log("\n4/9  Deployando ValtheraDeFi...");
  const DeFi = await ethers.getContractFactory("ValtheraDeFi");
  const defi = await DeFi.deploy(await valt.getAddress(), await nft.getAddress());
  await defi.waitForDeployment();
  console.log(`     ValtheraDeFi: ${await defi.getAddress()}`);

  console.log("\n5/9  Deployando tokens vGOLD, vSILVER e LPs...");
  const defiAddr = await defi.getAddress();
  const vGold    = await Assets.deploy("Valthera Gold",     "vGOLD",    defiAddr);
  const vSilver  = await Assets.deploy("Valthera Silver",   "vSILVER",  defiAddr);
  const lpGold   = await Assets.deploy("Valthera LP-GOLD",  "vLP-GOLD", defiAddr);
  const lpSilver = await Assets.deploy("Valthera LP-SILVER","vLP-SILVER",defiAddr);
  await Promise.all([
    vGold.waitForDeployment(), vSilver.waitForDeployment(),
    lpGold.waitForDeployment(), lpSilver.waitForDeployment()
  ]);
  console.log(`     vGOLD:     ${await vGold.getAddress()}`);
  console.log(`     vSILVER:   ${await vSilver.getAddress()}`);
  console.log(`     vLP-GOLD:  ${await lpGold.getAddress()}`);
  console.log(`     vLP-SILVER:${await lpSilver.getAddress()}`);

  console.log("\n6/9  Transferindo ownership de VALT e NFT para DeFi...");
  await (await valt.transferOwnership(defiAddr)).wait();
  await (await nft.transferOwnership(defiAddr)).wait();
  console.log("     Concluído.");

  console.log("\n7/9  Configurando ativos e oráculos no DeFi...");
  await (await defi.setupAsset(await vGold.getAddress(), await lpGold.getAddress())).wait();
  await (await defi.setupAsset(await vSilver.getAddress(), await lpSilver.getAddress())).wait();
  await (await defi.setOracleFeed(await vGold.getAddress(), await mockGold.getAddress())).wait();
  await (await defi.setOracleFeed(await vSilver.getAddress(), await mockSilver.getAddress())).wait();
  console.log("     Concluído.");

  console.log("\n8/9  Deployando ValtheraDAO...");
  const DAO = await ethers.getContractFactory("ValtheraDAO");
  const dao = await DAO.deploy(await valt.getAddress(), defiAddr);
  await dao.waitForDeployment();
  console.log(`     ValtheraDAO: ${await dao.getAddress()}`);
  await (await defi.setDaoContract(await dao.getAddress())).wait();
  console.log("     DAO vinculada ao DeFi.");

  console.log("\n9/9  Deployando ValtheraMarket...");
  const Market = await ethers.getContractFactory("ValtheraMarket");
  const market = await Market.deploy(await nft.getAddress(), defiAddr);
  await market.waitForDeployment();
  console.log(`     ValtheraMarket: ${await market.getAddress()}`);

  console.log("\n=== Deploy concluído ===\n");
  console.log("Copie estes endereços na aba Configuração do frontend:\n");
  const summary = {
    "ValtheraDeFi":   defiAddr,
    "ValtheraDAO":    await dao.getAddress(),
    "ValtheraMarket": await market.getAddress(),
    "VALT":           await valt.getAddress(),
    "vGOLD":          await vGold.getAddress(),
    "vSILVER":        await vSilver.getAddress(),
    "vLP-GOLD":       await lpGold.getAddress(),
    "vLP-SILVER":     await lpSilver.getAddress(),
    "ValtheraNFT":    await nft.getAddress(),
    "MockGold":       await mockGold.getAddress(),
    "MockSilver":     await mockSilver.getAddress(),
  };
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});