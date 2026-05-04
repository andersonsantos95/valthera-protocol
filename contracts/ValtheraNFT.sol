// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ValtheraNFT
 * @notice Contrato ERC-721 para representação de ativos físicos como NFTs no protocolo Valthera.
 * @dev Cada token representa um ativo do mundo real (imóvel, fazenda, galpão, etc.)
 *      registrado pelo usuário via ValtheraDeFi. A cunhagem é restrita ao contrato
 *      ValtheraDeFi (owner), que atua como ponto de entrada para o registro.
 *      O token é identificado por um ID sequencial e acompanha uma descrição textual.
 */
contract ValtheraNFT is ERC721, Ownable {
    /// @notice Quantidade total de NFTs cunhados até o momento. Também serve como próximo tokenId.
    uint256 public totalSupply;

    /// @notice Mapeia cada tokenId à descrição textual do ativo físico correspondente.
    mapping(uint256 => string) public descriptions;

    /**
     * @notice Inicializa o contrato com nome "Valthera Real Assets" e símbolo "vNFT".
     * @param initialOwner Endereço que receberá ownership inicial (deve ser ValtheraDeFi).
     */
    constructor(address initialOwner)
        ERC721("Valthera Real Assets", "vNFT")
        Ownable(initialOwner)
    {}

    /**
     * @notice Cria um novo NFT representando um ativo físico e o atribui ao destinatário.
     * @dev Restrito ao owner (ValtheraDeFi). O tokenId é gerado automaticamente de forma
     *      sequencial a partir do valor atual de `totalSupply`. Utiliza `_safeMint` para
     *      garantir compatibilidade com contratos receptores (ERC721Receiver).
     * @param to          Endereço que receberá o NFT cunhado.
     * @param description Descrição textual do ativo físico (ex: "Imóvel - São Paulo, SP").
     * @return tokenId    Identificador único do NFT recém-criado.
     */
    function mintNFT(address to, string memory description) external onlyOwner returns (uint256) {
        uint256 tokenId = totalSupply++;
        descriptions[tokenId] = description;
        _safeMint(to, tokenId);
        return tokenId;
    }
}