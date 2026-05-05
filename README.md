# Valthera Protocol

MVP de protocolo DeFi para tokenização de ativos do mundo real (RWA). Desenvolvido como entrega da **Residência em TIC 29 — Unidade 1, Capítulo 5**.

## Sobre o Protocolo

O Valthera Protocol converte bens físicos (ouro, prata, imóveis) em tokens na blockchain Ethereum, permitindo staking com recompensas calculadas pelo preço real do ativo via oráculo Chainlink, governança descentralizada e compra/venda de NFTs de ativos físicos.

## Componentes Implementados

| Requisito | Contrato | Descrição |
| :--- | :--- | :--- |
| Token ERC-20 | `ValtheraAssets` | VALT (recompensa), vGOLD, vSILVER e tokens LP |
| NFT ERC-721 | `ValtheraNFT` | Representa ativos físicos únicos (imóveis, propriedades) |
| Staking | `ValtheraDeFi` | Liquidez com recompensas em VALT proporcionais ao valor USD do ativo |
| Governança DAO | `ValtheraDAO` | Propostas e votação ponderada por saldo VALT |
| Oráculo | `ValtheraDeFi` | Integração Chainlink `AggregatorV3Interface` para preço USD |
| Integração Web3 | `scripts/deploy.js` | Deploy automatizado via ethers.js (Hardhat) |
| Marketplace | `ValtheraMarket` | Compra e venda de NFTs com liquidação atômica |

## Stack

- **Smart Contracts:** Solidity ^0.8.20 + OpenZeppelin
- **Oráculos:** Chainlink AggregatorV3Interface
- **Testes:** Hardhat + Chai (27 testes, cobertura 94%)
- **Frontend:** HTML5 + ethers.js
- **Rede:** Ethereum Sepolia Testnet

## Deploy (Sepolia)

| Contrato | Endereço |
| :--- | :--- |
| ValtheraDeFi | `0x18d5BceEd7892fA2Cd70646f66C032dd5A418bA1` |
| ValtheraDAO | `0xa0EeE290cB5E631AfC105b070CfB158e9A588513` |
| ValtheraMarket | `0x8a0bAC194E61651EBda6cb058D78929578391f7B` |
| ValtheraNFT | `0x757e723717024bd1f0361aC3d6C3BBF2bd5a7a51` |
| VALT | `0x38234e7c982c9174DbFB40716D460AA74C855163` |
| vGOLD | `0xb8B5104783416eCb1e40988F6f31e0b3A4d9b044` |
| vSILVER | `0xE0f68624eD441E77CB5579320fF2B074B3BBfD44` |
| vLP-GOLD | `0xD42a5B700d52a0dbD9dCC9AE6609577c3c1d2068` |
| vLP-SILVER | `0x851AB4FE368144801f45e8DE17B57A2543ad4EFd` |
| Oracle vGOLD | `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea` |
| Oracle vSILVER | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |

Verificação: [sepolia.etherscan.io](https://sepolia.etherscan.io/)

## Como Executar Localmente

```bash
npm install
npx hardhat test           # roda os 27 testes
npx hardhat run scripts/deploy.js --network localhost
```

Para o frontend, abra `frontend/index.html` com a extensão Live Server e conecte a MetaMask na rede Sepolia.

## Segurança

- `ReentrancyGuard` (OpenZeppelin) em todas as funções com chamadas externas
- `Ownable` com controle de acesso explícito em funções críticas
- Solidity 0.8.20 com proteção nativa contra overflow/underflow
- Auditoria executada com Slither, Mythril e Hardhat Coverage — sem vulnerabilidades críticas

---
**Autor:** Anderson Santos da Silva · Residência em TIC 29