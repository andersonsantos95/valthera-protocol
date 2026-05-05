# Valthera Protocol

MVP de protocolo DeFi para tokenização de ativos do mundo real (RWA). Desenvolvido como entrega da **Residência em TIC 29 — Unidade 1, Capítulo 5**.

## Sobre o Protocolo

O Valthera Protocol resolve o problema de liquidez e acessibilidade de ativos físicos. Hoje, investir em ouro, prata ou imóveis exige alto capital inicial e processos lentos de compra e venda. O protocolo tokeniza esses ativos na blockchain Ethereum, permitindo:

- Representar frações de ouro e prata como tokens fungíveis (`vGOLD`, `vSILVER`)
- Registrar imóveis e propriedades físicas como NFTs únicos (`vNFT`)
- Gerar recompensas em VALT proporcionais ao **preço real do ativo em USD** via oráculo Chainlink
- Negociar NFTs de ativos físicos em um marketplace on-chain
- Alterar parâmetros do protocolo via governança descentralizada (DAO)

## Componentes

| Requisito | Contrato | Descrição |
| :--- | :--- | :--- |
| Token ERC-20 | `ValtheraAssets` | VALT (recompensa), vGOLD, vSILVER e tokens LP |
| NFT ERC-721 | `ValtheraNFT` | Representa ativos físicos únicos com descrição textual |
| Staking | `ValtheraDeFi` | Liquidez com recompensas em VALT calculadas por intervalo |
| Governança DAO | `ValtheraDAO` | Propostas e votação ponderada por saldo VALT |
| Oráculo | `ValtheraDeFi` | Integração Chainlink `AggregatorV3Interface` para preço USD |
| Integração Web3 | `scripts/deploy.js` | Deploy automatizado via ethers.js (Hardhat) |
| Marketplace | `ValtheraMarket` | Compra e venda de NFTs com liquidação atômica |

## Como Funciona o Staking

1. O usuário deposita um ativo (`depositRealAsset`) e recebe tokens `vGOLD` ou `vSILVER`
2. Fornece liquidez (`provideLiquidity`) — deposita os tokens e recebe LP tokens
3. Recompensas em VALT acumulam a cada intervalo de 60 segundos, calculadas como:
   ```
   recompensa = (saldo × preço USD × rewardRate × intervalos) / 1e18
   ```
4. O usuário resgata com `claimGlobalRewards` ou ao remover liquidez (`removeLiquidity`)

Os parâmetros `rewardRate` e duração do intervalo são ajustáveis pela DAO.

## Stack

- **Smart Contracts:** Solidity ^0.8.20 + OpenZeppelin
- **Oráculos:** Chainlink AggregatorV3Interface (Sepolia)
- **Testes:** Hardhat + Chai · 27 testes · cobertura 94% em statements
- **Auditoria:** Slither, Mythril · sem vulnerabilidades críticas
- **Frontend:** HTML5 + ethers.js (Vanilla JS)
- **Rede:** Ethereum Sepolia Testnet

## Estrutura do Projeto

```
valthera-protocol/
├── contracts/
│   ├── ValtheraAssets.sol      # ERC-20 genérico (VALT, vGOLD, vSILVER, LPs)
│   ├── ValtheraNFT.sol         # ERC-721 para ativos físicos
│   ├── ValtheraDeFi.sol        # Motor central: staking, liquidez, recompensas
│   ├── ValtheraDAO.sol         # Governança descentralizada
│   ├── ValtheraMarket.sol      # Marketplace de NFTs
│   └── MockV3Aggregator.sol    # Mock do oráculo Chainlink para testes
├── scripts/
│   ├── deploy.js               # Deploy sequencial de todos os contratos
│   └── audit.js                # Script de auditoria (Slither + Mythril + Hardhat)
├── test/
│   └── valthera.test.js        # 27 testes automatizados
└── frontend/
    └── index.html              # Interface Web3 com ethers.js
```

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

**Pré-requisitos:** Node.js 18+, npm

```bash
# Instalar dependências
npm install

# Rodar os testes
npx hardhat test

# Ver cobertura de código
npx hardhat coverage

# Deploy na rede local
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

Para o frontend, abra `frontend/index.html` com Live Server (VS Code) e conecte a MetaMask na rede **Sepolia**.

## Segurança

- `ReentrancyGuard` (OpenZeppelin) nas funções com chamadas externas: `provideLiquidity`, `removeLiquidity`, `claimGlobalRewards`, `buyNFT`
- `Ownable` com restrição de acesso em funções críticas (`mint`, `burn`, `setupAsset`, `setDaoContract`)
- `updateDaoParams` restrito ao endereço da DAO via verificação explícita de `msg.sender`
- Validação de dados do oráculo Chainlink: preço positivo, rodada completa e dados não desatualizados
- Solidity 0.8.20 — proteção nativa contra overflow e underflow

---
**Autor:** Anderson Santos da Silva · Residência em TIC 29
