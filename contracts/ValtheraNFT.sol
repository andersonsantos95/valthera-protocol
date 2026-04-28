// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ValtheraNFT is ERC721, Ownable {
    uint256 public totalSupply;
    mapping(uint256 => string) public descriptions;

    constructor(address initialOwner) ERC721("Valthera Real Assets", "vNFT") Ownable(initialOwner) {}

    function mintNFT(address to, string memory description) external onlyOwner returns (uint256) {
        uint256 tokenId = totalSupply++;
        descriptions[tokenId] = description;
        _safeMint(to, tokenId);
        return tokenId;
    }
}