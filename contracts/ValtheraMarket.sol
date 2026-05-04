// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IDeFi
 * @notice Interface para verificação de ativos suportados pelo ValtheraDeFi.
 */
interface IDeFi {
    /**
     * @notice Verifica se um token ERC-20 é um ativo suportado pelo protocolo.
     * @param token Endereço do token a verificar.
     * @return `true` se o token estiver registrado como ativo suportado.
     */
    function supportedAssets(address token) external view returns (bool);
}

/**
 * @title ValtheraMarket
 * @notice Marketplace descentralizado para compra e venda de NFTs de ativos reais (ValtheraNFT).
 * @dev Permite que proprietários de NFTs listem seus tokens para venda em qualquer token ERC-20
 *      suportado pelo protocolo Valthera (ex: vGOLD, vSILVER).
 *      A liquidação é atômica: pagamento e transferência do NFT ocorrem na mesma transação.
 *      Protegido contra reentrância pelo ReentrancyGuard da OpenZeppelin.
 */
contract ValtheraMarket is ReentrancyGuard {
    /**
     * @notice Representa uma oferta de venda de um NFT no marketplace.
     */
    struct Listing {
        /// @notice Endereço do proprietário que criou a oferta.
        address seller;

        /// @notice Preço de venda em tokens ERC-20 (com 18 casas decimais).
        uint256 price;

        /// @notice Token ERC-20 aceito como pagamento (deve ser ativo suportado pelo DeFi).
        address paymentToken;

        /// @notice Indica se a oferta está ativa e disponível para compra.
        bool isActive;
    }

    /// @notice Contrato ERC-721 dos NFTs de ativos reais (ValtheraNFT).
    IERC721 public immutable nftContract;

    /// @notice Contrato ValtheraDeFi usado para validar tokens de pagamento aceitos.
    IDeFi public immutable defiContract;

    /// @notice Mapeia o tokenId do NFT à sua oferta de venda ativa.
    mapping(uint256 => Listing) public listings;

    /**
     * @notice Inicializa o marketplace com os contratos NFT e DeFi.
     * @param _nftContract   Endereço do contrato ValtheraNFT.
     * @param _defiContract  Endereço do contrato ValtheraDeFi.
     */
    constructor(address _nftContract, address _defiContract) {
        nftContract  = IERC721(_nftContract);
        defiContract = IDeFi(_defiContract);
    }

    /**
     * @notice Lista um NFT para venda no marketplace.
     * @dev O chamador deve ser o proprietário do NFT e ter aprovado este contrato
     *      via `approve(address(this), tokenId)` ou `setApprovalForAll(address(this), true)`.
     *      O token de pagamento deve ser um ativo suportado pelo ValtheraDeFi.
     * @param tokenId      ID do NFT a listar.
     * @param price        Preço de venda em unidades do token de pagamento (18 casas decimais).
     * @param paymentToken Endereço do token ERC-20 aceito como pagamento.
     */
    function listNFT(uint256 tokenId, uint256 price, address paymentToken) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Nao e o dono");
        require(defiContract.supportedAssets(paymentToken), "Token de pagamento invalido");
        require(
            nftContract.getApproved(tokenId) == address(this) ||
            nftContract.isApprovedForAll(msg.sender, address(this)),
            "Contrato nao aprovado"
        );
        listings[tokenId] = Listing(msg.sender, price, paymentToken, true);
    }

    /**
     * @notice Compra um NFT listado, transferindo o pagamento ao vendedor e o NFT ao comprador.
     * @dev O comprador deve ter aprovado este contrato para gastar o token de pagamento
     *      via `IERC20.approve(address(this), price)`.
     *      A listagem é desativada antes das transferências (padrão Checks-Effects-Interactions).
     *      Protegido contra reentrância pelo modificador `nonReentrant`.
     * @param tokenId ID do NFT a comprar.
     */
    function buyNFT(uint256 tokenId) external nonReentrant {
        Listing memory item = listings[tokenId];
        require(item.isActive, "Nao listado");
        listings[tokenId].isActive = false;
        bool ok = IERC20(item.paymentToken).transferFrom(msg.sender, item.seller, item.price);
        require(ok, "Pagamento falhou");
        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);
    }
}