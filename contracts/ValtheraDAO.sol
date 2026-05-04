// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IDeFi
 * @notice Interface para atualização de parâmetros do contrato ValtheraDeFi pela DAO.
 */
interface IDeFi {
    /**
     * @notice Atualiza um parâmetro interno do protocolo.
     * @param target   Índice do parâmetro (0=rewardRateX, 1=rewardIntervalY, 2=minClaimAmount).
     * @param newValue Novo valor a ser aplicado.
     */
    function updateDaoParams(uint8 target, uint256 newValue) external;
}

/**
 * @title ValtheraDAO
 * @notice Contrato de governança descentralizada do protocolo Valthera.
 * @dev Permite que detentores de VALT criem propostas para alterar parâmetros do ValtheraDeFi,
 *      votem com peso proporcional ao saldo e executem propostas aprovadas após o período de votação.
 *
 *      Parâmetros alteráveis via DAO:
 *        - REWARD_X (0): taxa de recompensa por USD por intervalo (rewardRateX).
 *        - REWARD_Y (1): duração do intervalo de recompensa em segundos (rewardIntervalY).
 *        - MIN_CLAIM (2): quantidade mínima de VALT para acionar claimGlobalRewards (minClaimAmount).
 *        - VOTE_TIME (3): duração do período de votação em segundos (votingDuration).
 *
 *      Regras de votação:
 *        - Apenas um endereço com saldo VALT > 0 pode criar propostas.
 *        - Apenas uma proposta ativa por parâmetro ao mesmo tempo.
 *        - Peso do voto = saldo VALT do votante no momento do voto.
 *        - Proposta aprovada se votesFor > votesAgainst após encerramento.
 */
contract ValtheraDAO {
    /// @notice Token VALT utilizado para verificação de elegibilidade e peso de voto.
    IERC20 public immutable valtToken;

    /// @notice Endereço do contrato ValtheraDeFi cujos parâmetros serão alterados pelas propostas.
    address public immutable defiContract;

    /// @notice Número total de propostas criadas. Também serve como índice da próxima proposta.
    uint256 public proposalCount;

    /// @notice Duração do período de votação em segundos. Pode ser alterada via proposta VOTE_TIME.
    uint256 public votingDuration = 60;

    /**
     * @notice Enumeração dos parâmetros do protocolo que podem ser alterados via governança.
     * @dev Os valores numéricos correspondem ao parâmetro `target` em `updateDaoParams`.
     */
    enum Target {
        REWARD_X,
        REWARD_Y,
        MIN_CLAIM,
        VOTE_TIME
    }

    /// @notice Indica se há uma proposta ativa para cada parâmetro. Impede propostas duplicadas.
    mapping(Target => bool) public pendingProposalFor;

    /**
     * @notice Estrutura que representa uma proposta de governança.
     * @dev O campo `hasVoted` impede que um mesmo endereço vote mais de uma vez.
     */
    struct Proposal {
        /// @notice Texto descritivo da proposta apresentado aos votantes.
        string description;

        /// @notice Parâmetro do protocolo que a proposta visa alterar.
        Target target;

        /// @notice Novo valor proposto para o parâmetro.
        uint256 newValue;

        /// @notice Timestamp de encerramento do período de votação.
        uint256 endTime;

        /// @notice Soma dos pesos dos votos favoráveis (em VALT).
        uint256 votesFor;

        /// @notice Soma dos pesos dos votos contrários (em VALT).
        uint256 votesAgainst;

        /// @notice Indica se a proposta já foi executada.
        bool executed;

        /// @notice Registra quais endereços já votaram nesta proposta.
        mapping(address => bool) hasVoted;
    }

    /// @notice Mapeia cada ID de proposta à sua estrutura de dados.
    mapping(uint256 => Proposal) public proposals;

    /**
     * @notice Inicializa a DAO com os endereços do token VALT e do contrato ValtheraDeFi.
     * @param _valtToken    Endereço do token VALT.
     * @param _defiContract Endereço do contrato ValtheraDeFi.
     */
    constructor(address _valtToken, address _defiContract) {
        require(_defiContract != address(0), "DeFi invalido");
        valtToken    = IERC20(_valtToken);
        defiContract = _defiContract;
    }

    /**
     * @notice Cria uma nova proposta de governança para alterar um parâmetro do protocolo.
     * @dev O chamador deve possuir saldo VALT > 0. Apenas uma proposta pode estar ativa
     *      por parâmetro simultaneamente. O período de votação inicia imediatamente.
     * @param description Texto descritivo da proposta.
     * @param target      Índice do parâmetro a alterar (usar valores do enum Target).
     * @param newValue    Novo valor proposto para o parâmetro.
     */
    function createProposal(string memory description, uint8 target, uint256 newValue) external {
        require(valtToken.balanceOf(msg.sender) > 0, "Sem VALT");
        require(!pendingProposalFor[Target(target)], "Ja existe uma proposta ativa para esta variavel");

        Proposal storage p = proposals[proposalCount++];
        p.description = description;
        p.target      = Target(target);
        p.newValue    = newValue;
        p.endTime     = block.timestamp + votingDuration;

        pendingProposalFor[Target(target)] = true;
    }

    /**
     * @notice Registra o voto do chamador em uma proposta aberta.
     * @dev O peso do voto é igual ao saldo VALT do votante no momento da chamada.
     *      Cada endereço pode votar apenas uma vez por proposta.
     *      A proposta deve estar dentro do período de votação.
     * @param proposalId ID da proposta a votar.
     * @param support    `true` para voto favorável, `false` para voto contrário.
     */
    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp < p.endTime, "Encerrada");
        require(!p.hasVoted[msg.sender],     "Ja votou");

        uint256 weight = valtToken.balanceOf(msg.sender);
        if (support) p.votesFor     += weight;
        else         p.votesAgainst += weight;
        p.hasVoted[msg.sender] = true;
    }

    /**
     * @notice Executa uma proposta encerrada caso tenha sido aprovada pela maioria.
     * @dev Pode ser chamada por qualquer endereço após o término do período de votação.
     *      Se `votesFor > votesAgainst`, a alteração é aplicada no ValtheraDeFi ou na própria DAO
     *      (para propostas do tipo VOTE_TIME). Propostas rejeitadas são marcadas como executadas
     *      sem efeito, liberando o slot para novas propostas do mesmo parâmetro.
     * @param proposalId ID da proposta a executar.
     */
    function executeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp >= p.endTime, "Em andamento");
        require(!p.executed,                  "Executada");

        p.executed = true;
        pendingProposalFor[p.target] = false;

        if (p.votesFor > p.votesAgainst) {
            if (p.target == Target.VOTE_TIME) votingDuration = p.newValue;
            else IDeFi(defiContract).updateDaoParams(uint8(p.target), p.newValue);
        }
    }

    /**
     * @notice Retorna os dados públicos de uma proposta pelo seu ID.
     * @param id ID da proposta a consultar.
     * @return description  Texto descritivo da proposta.
     * @return target       Índice do parâmetro alvo (valor do enum Target).
     * @return newValue     Novo valor proposto.
     * @return endTime      Timestamp de encerramento do período de votação.
     * @return votesFor     Total de votos favoráveis ponderados por VALT.
     * @return votesAgainst Total de votos contrários ponderados por VALT.
     * @return executed     Indica se a proposta já foi executada.
     */
    function getProposalDetails(uint256 id) external view returns (
        string memory description,
        uint8         target,
        uint256       newValue,
        uint256       endTime,
        uint256       votesFor,
        uint256       votesAgainst,
        bool          executed
    ) {
        Proposal storage p = proposals[id];
        return (p.description, uint8(p.target), p.newValue, p.endTime, p.votesFor, p.votesAgainst, p.executed);
    }
}