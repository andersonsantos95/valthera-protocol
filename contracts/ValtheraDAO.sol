// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDeFi {
    function updateDaoParams(uint8 target, uint256 newValue) external;
}

contract ValtheraDAO {
    IERC20 public valtToken;
    address public defiContract;
    uint256 public proposalCount;
    uint256 public votingDuration = 60;

    enum Target { REWARD_X, REWARD_Y, MIN_CLAIM, VOTE_TIME }
    
    mapping(Target => bool) public pendingProposalFor;

    struct Proposal {
        string description;
        Target target;
        uint256 newValue;
        uint256 endTime;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
        mapping(address => bool) hasVoted;
    }
    
    mapping(uint256 => Proposal) public proposals;

    constructor(address _valtToken, address _defiContract) {
        valtToken = IERC20(_valtToken);
        defiContract = _defiContract;
    }

    function createProposal(string memory description, uint8 target, uint256 newValue) external {
        require(valtToken.balanceOf(msg.sender) > 0, "Sem VALT");
        require(!pendingProposalFor[Target(target)], "Ja existe uma proposta ativa para esta variavel");
        
        Proposal storage p = proposals[proposalCount++];
        p.description = description;
        p.target = Target(target);
        p.newValue = newValue;
        p.endTime = block.timestamp + votingDuration;
        
        pendingProposalFor[Target(target)] = true;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Encerrada");
        require(!p.hasVoted[msg.sender], "Ja votou");
        
        uint256 weight = valtToken.balanceOf(msg.sender);
        if (support) p.votesFor += weight;
        else p.votesAgainst += weight;
        p.hasVoted[msg.sender] = true;
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp >= p.endTime, "Em andamento");
        require(!p.executed, "Executada");
        
        p.executed = true;
        pendingProposalFor[p.target] = false; 

        if (p.votesFor > p.votesAgainst) {
            if (p.target == Target.VOTE_TIME) votingDuration = p.newValue;
            else IDeFi(defiContract).updateDaoParams(uint8(p.target), p.newValue);
        }
    }

    function getProposalDetails(uint256 id) external view returns (string memory, uint8, uint256, uint256, uint256, uint256, bool) {
        Proposal storage p = proposals[id];
        return (p.description, uint8(p.target), p.newValue, p.endTime, p.votesFor, p.votesAgainst, p.executed);
    }
}