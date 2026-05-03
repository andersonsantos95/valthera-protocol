// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockV3Aggregator {
    int256 public currentPrice;

    constructor(int256 _initialPrice) {
        currentPrice = _initialPrice;
    }

    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
    ) {
        return (0, currentPrice, 0, block.timestamp, 0);
    }
}