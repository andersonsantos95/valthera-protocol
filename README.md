# Valthera Protocol - RWA Tokenization & DeFi Ecosystem

O **Valthera Protocol** é um MVP de um ecossistema Web3 focado na tokenização de ativos do mundo real (RWA - Real World Assets). O protocolo permite a conversão de bens físicos (como ouro, prata e imóveis) em representações digitais na blockchain, habilitando liquidez imediata, segurança institucional e rendimentos automáticos via Staking.

Este projeto foi desenvolvido como parte da **Residência em TIC 29 (Unidade 1 | Capítulo 5)**.

## 🚀 Funcionalidades

- **Tokenização RWA:** Emissão de ativos fungíveis (ERC-20) e não fungíveis (ERC-721).
- **Staking de Ativos:** Bloqueio de vAssets para recebimento de recompensas em tokens VALT.
- **Oráculos Chainlink:** Precificação em tempo real (USD) diretamente da rede Sepolia para garantir integridade financeira.
- **Governança (DAO):** Controle descentralizado de parâmetros do protocolo pelos detentores do token VALT.
- **Marketplace:** Compra e venda atômica de NFTs de bens físicos.

## 🛠️ Stack Técnica

- **Smart Contracts:** Solidity ^0.8.20, OpenZeppelin.
- **Oráculos:** Chainlink (AggregatorV3Interface).
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla) e **ethers.js**.
- **Rede:** Ethereum Sepolia Testnet.

## 📄 Contratos e Deploy (Sepolia)

Abaixo estão os endereços dos contratos implantados para verificação no [Sepolia Etherscan](https://sepolia.etherscan.io/):

| Contrato | Tipo | Endereço |
| :--- | :--- | :--- |
| **Valthera DeFi (Core)** | Motor / Staking | `0xffA8AC77466c88a29c2Fd9708DC474B244d9DE3e` |
| **Valthera DAO** | Governança | `0x3B2cBB61F8AB0A69a6CD779043564b316Fe90f7d` |
| **Valthera Market** | Marketplace | `0xbDEEdF35BC59247F8954F639d8a440e7F9792C36` |
| **VALT Token** | ERC-20 (Gov/Reward) | `0x86213B5Ac175adf816Ba3faAE1BE0012b1fc6b68` |
| **vGOLD** | ERC-20 (Asset) | `0x8C4AbD79234D51886278f0AA418376df481858f9` |
| **vSILVER** | ERC-20 (Asset) | `0x8E879cC8F4a6fBE1a2b0CF64a13996E4D79dE708` |
| **vLP-GOLD** | ERC-20 (Asset) | `0xcb67B041bf3bdcC63d8124DccBd6a26F5F27777A` |
| **vLP-SILVER** | ERC-20 (Asset) | `0xfbD854EE30bE45fA098B17D7AaD68c00FEf77C4B` |
| **Valthera NFT** | ERC-721 (RWA) | `0x5221533fabdd65Ce3681C52a9b75969974E86aF2` |

## 💻 Como Rodar o Frontend

1. Clone este repositório.
2. Certifique-se de ter a extensão **MetaMask** instalada no seu navegador.
3. Configure a MetaMask para a rede **Sepolia Testnet**.
4. Abra o arquivo `frontend/index.html` em seu navegador (ou utilize a extensão *Live Server* do VS Code).
5. Na aba **Configurações**, insira os endereços dos contratos listados acima (caso não estejam pré-carregados).
6. Clique em **Sincronizar Protocolo** e comece a interagir!

## 🛡️ Segurança e Auditoria

O protocolo foi desenvolvido seguindo as melhores práticas de segurança Web3:
- Proteção contra ataques de reentrância utilizando `ReentrancyGuard`.
- Controle de acesso rigoroso via padrão `Ownable`.

---
**Desenvolvido por:** Anderson Santos da Silva  
**Disciplina:** Desenvolvimento de Protocolo Web3 - Residência em TIC 29