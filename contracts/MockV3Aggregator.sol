// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockV3Aggregator
 * @notice Oráculo de preço simulado compatível com a interface Chainlink AggregatorV3.
 * @dev Utilizado exclusivamente em ambiente de desenvolvimento e testes locais.
 *      Retorna um preço fixo definido no construtor, sem consultas externas.
 *      Não deve ser implantado em redes de produção.
 */
contract MockV3Aggregator {
    /// @notice Preço fixo retornado pelo oráculo simulado, com 8 casas decimais (padrão Chainlink).
    int256 public immutable currentPrice;

    /**
     * @notice Inicializa o oráculo com um preço fixo.
     * @param _initialPrice Preço inicial em formato Chainlink (8 casas decimais).
     *                      Exemplo: $2.000,00 = 200000000000.
     */
    constructor(int256 _initialPrice) {
        currentPrice = _initialPrice;
    }

    /**
     * @notice Retorna os dados da última rodada de precificação.
     * @dev Simula a interface `AggregatorV3Interface.latestRoundData()`.
     *      `roundId` e `answeredInRound` são fixados em 1 para satisfazer validações de staleness.
     *      `startedAt` e `updatedAt` refletem o timestamp do bloco atual.
     * @return roundId          Identificador da rodada (sempre 1).
     * @return answer           Preço atual com 8 casas decimais.
     * @return startedAt        Timestamp de início da rodada (block.timestamp).
     * @return updatedAt        Timestamp da última atualização (block.timestamp).
     * @return answeredInRound  Rodada em que o preço foi respondido (sempre 1).
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, currentPrice, block.timestamp, block.timestamp, 1);
    }
}
