// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ValtheraAssets
 * @notice Token ERC-20 genérico utilizado para representar ativos reais tokenizados
 *         e tokens de liquidez (LP) dentro do ecossistema Valthera.
 * @dev Este contrato é instanciado múltiplas vezes para cada ativo suportado pelo protocolo.
 *      Exemplos de instâncias: VALT, vGOLD, vSILVER, vLP-GOLD, vLP-SILVER.
 *      As operações de mint e burn são restritas ao contrato ValtheraDeFi (owner).
 */
contract ValtheraAssets is ERC20, Ownable {
    /**
     * @notice Inicializa o token com nome, símbolo e proprietário definidos.
     * @param name         Nome completo do token (ex: "Valthera Gold").
     * @param symbol       Símbolo do token (ex: "vGOLD").
     * @param initialOwner Endereço que receberá ownership inicial do contrato.
     */
    constructor(string memory name, string memory symbol, address initialOwner)
        ERC20(name, symbol)
        Ownable(initialOwner)
    {}

    /**
     * @notice Cria novos tokens e os atribui ao endereço informado.
     * @dev Restrito ao owner (ValtheraDeFi). Chamado em depósitos de ativos reais
     *      e na distribuição de tokens LP ao fornecer liquidez.
     * @param to     Endereço que receberá os tokens cunhados.
     * @param amount Quantidade de tokens a cunhar (18 casas decimais).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Destrói tokens do endereço informado, reduzindo o supply total.
     * @dev Restrito ao owner (ValtheraDeFi). Chamado em retiradas de ativos reais
     *      e na queima de tokens LP ao remover liquidez.
     * @param from   Endereço de onde os tokens serão queimados.
     * @param amount Quantidade de tokens a queimar (18 casas decimais).
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}