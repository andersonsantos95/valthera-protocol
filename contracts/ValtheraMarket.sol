// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IDeFi {
    function supportedAssets(address token) external view returns (bool);
}

contract ValtheraMarket is ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
        address paymentToken;
        bool isActive;
    }

    IERC721 public nftContract;
    IDeFi public defiContract;
    mapping(uint256 => Listing) public listings;

    constructor(address _nftContract, address _defiContract) {
        nftContract = IERC721(_nftContract);
        defiContract = IDeFi(_defiContract);
    }

    function listNFT(uint256 tokenId, uint256 price, address paymentToken) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Nao e o dono");
        require(defiContract.supportedAssets(paymentToken), "Token de pagamento invalido");
        require(nftContract.getApproved(tokenId) == address(this) || nftContract.isApprovedForAll(msg.sender, address(this)), "Contrato nao aprovado");

        listings[tokenId] = Listing(msg.sender, price, paymentToken, true);
    }

    function buyNFT(uint256 tokenId) external nonReentrant {
        Listing memory item = listings[tokenId];
        require(item.isActive, "Nao listado");

        IERC20(item.paymentToken).transferFrom(msg.sender, item.seller, item.price);
        nftContract.safeTransferFrom(item.seller, msg.sender, tokenId);
        
        listings[tokenId].isActive = false; 
    }
}