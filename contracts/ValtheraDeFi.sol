// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface IToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface INFT {
    function mintNFT(address to, string memory description) external returns (uint256);
}

contract ValtheraDeFi is ReentrancyGuard, Ownable {
    address public valtToken;
    address public nftContract; 
    address public daoContract;

    uint256 public rewardRateX = 1 * 10**18; 
    uint256 public rewardIntervalY = 60;     
    uint256 public minClaimAmount = 5 * 10**18; 
    
    mapping(address => bool) public supportedAssets; 
    mapping(address => address) public assetToLpToken; 
    mapping(address => address) public assetPriceFeeds; 
    
    mapping(address => mapping(address => uint256)) public userStakedBalance;
    mapping(address => mapping(address => uint256)) public lastStakeTime;
    
    address[] public supportedAssetList;
    
    constructor(address _valtToken, address _nftContract) Ownable(msg.sender) {
        valtToken = _valtToken;
        nftContract = _nftContract;
    }

    function setDaoContract(address _dao) external onlyOwner {
        daoContract = _dao;
    }

    function updateDaoParams(uint8 target, uint256 newValue) external {
        require(msg.sender == daoContract, "Apenas a DAO pode alterar");
        if (target == 0) rewardRateX = newValue;
        else if (target == 1) rewardIntervalY = newValue;
        else if (target == 2) minClaimAmount = newValue;
    }

    function setupAsset(address tokenAddress, address lpTokenAddress) external onlyOwner {
        if (!supportedAssets[tokenAddress]) {
            supportedAssets[tokenAddress] = true;
            supportedAssetList.push(tokenAddress);
        }
        assetToLpToken[tokenAddress] = lpTokenAddress;
    }

    function setOracleFeed(address tokenAddress, address feedAddress) external onlyOwner {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        assetPriceFeeds[tokenAddress] = feedAddress;
    }

    function getAssetPriceUSD(address tokenAddress) public view returns (uint256) {
        address feed = assetPriceFeeds[tokenAddress];
        require(feed != address(0), "Oraculo nao configurado");
        (, int price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        require(price > 0, "Preco invalido");
        return uint256(price) * 1e10; 
    }

    function registerRealAssetNFT(string memory description) external {
        INFT(nftContract).mintNFT(msg.sender, description);
    }

    function depositRealAsset(address tokenAddress, uint256 amount) external {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        IToken(tokenAddress).mint(msg.sender, amount);
    }

    function withdrawRealAsset(address tokenAddress, uint256 amount) external {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        IToken(tokenAddress).burn(msg.sender, amount);
    }

    function getPendingReward(address user, address token) public view returns (uint256) {
        uint256 staked = userStakedBalance[token][user];
        if (staked == 0 || lastStakeTime[token][user] == 0) return 0;
        uint256 timeDiff = block.timestamp - lastStakeTime[token][user];
        uint256 priceUSD = getAssetPriceUSD(token);
        uint256 valueUSD = (staked * priceUSD) / 1e18;
        return ((valueUSD * rewardRateX) / 1e18) * (timeDiff / rewardIntervalY);
    }

    function _autoClaim(address user, address token) internal {
        uint256 reward = getPendingReward(user, token);
        if (reward > 0) {
            IToken(valtToken).mint(user, reward);
        }
        lastStakeTime[token][user] = block.timestamp;
    }

    function provideLiquidity(address tokenAddress, uint256 amount) external nonReentrant {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        if (userStakedBalance[tokenAddress][msg.sender] > 0) _autoClaim(msg.sender, tokenAddress);
        else lastStakeTime[tokenAddress][msg.sender] = block.timestamp;
        IToken(tokenAddress).transferFrom(msg.sender, address(this), amount);
        userStakedBalance[tokenAddress][msg.sender] += amount;
        IToken(assetToLpToken[tokenAddress]).mint(msg.sender, amount);
    }

    function removeLiquidity(address tokenAddress, uint256 amount) external nonReentrant {
        require(userStakedBalance[tokenAddress][msg.sender] >= amount, "Saldo insuficiente");
        _autoClaim(msg.sender, tokenAddress);
        IToken(assetToLpToken[tokenAddress]).burn(msg.sender, amount);
        userStakedBalance[tokenAddress][msg.sender] -= amount;
        if (userStakedBalance[tokenAddress][msg.sender] == 0) lastStakeTime[tokenAddress][msg.sender] = 0;
        IToken(tokenAddress).transfer(msg.sender, amount);
    }

    function claimGlobalRewards() external nonReentrant {
        uint256 totalToMint = 0;
        for (uint i = 0; i < supportedAssetList.length; i++) {
            address token = supportedAssetList[i];
            uint256 reward = getPendingReward(msg.sender, token);
            if (reward > 0) {
                totalToMint += reward;
                lastStakeTime[token][msg.sender] = block.timestamp;
            }
        }
        require(totalToMint >= minClaimAmount, "Recompensa abaixo do minimo");
        IToken(valtToken).mint(msg.sender, totalToMint);
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return supportedAssetList;
    }
}