// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title IToken
 * @notice Interface mínima para interação com tokens ERC-20 do protocolo Valthera.
 * @dev Implementada por ValtheraAssets. Inclui operações de mint, burn e transferência
 *      necessárias para o fluxo de depósito, retirada e staking.
 */
interface IToken {
    /// @notice Cria tokens e os atribui ao endereço `to`.
    function mint(address to, uint256 amount) external;

    /// @notice Destrói tokens do endereço `from`.
    function burn(address from, uint256 amount) external;

    /// @notice Transfere tokens de `sender` para `recipient` usando allowance.
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /// @notice Transfere tokens do contrato para `recipient`.
    function transfer(address recipient, uint256 amount) external returns (bool);

    /// @notice Retorna o saldo de tokens do endereço `account`.
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title INFT
 * @notice Interface para cunhagem de NFTs de ativos reais.
 * @dev Implementada por ValtheraNFT.
 */
interface INFT {
    /// @notice Cria um NFT representando um ativo físico e o atribui ao endereço `to`.
    function mintNFT(address to, string memory description) external returns (uint256);
}

/**
 * @title ValtheraDeFi
 * @notice Motor central do protocolo Valthera: gerencia depósitos, retiradas, staking,
 *         liquidez, recompensas em VALT e registro de ativos físicos como NFTs.
 * @dev Integra oráculos Chainlink para precificação em USD dos ativos tokenizados.
 *      Parâmetros de recompensa podem ser ajustados via ValtheraDAO.
 *      Protegido contra reentrância pelo ReentrancyGuard da OpenZeppelin.
 *
 *      Fórmula de recompensa:
 *        reward = (valorUSD * rewardRateX * intervalosCompletos) / 1e18
 *        onde intervalosCompletos = tempoDecorrido / rewardIntervalY  (divisão inteira)
 */
contract ValtheraDeFi is ReentrancyGuard, Ownable {
    /// @notice Endereço do token VALT, utilizado para distribuição de recompensas.
    address public immutable valtToken;

    /// @notice Endereço do contrato ValtheraNFT, utilizado para registro de ativos físicos.
    address public immutable nftContract;

    /// @notice Endereço do contrato ValtheraDAO, único autorizado a alterar parâmetros via `updateDaoParams`.
    address public daoContract;

    /// @notice Taxa de recompensa base: VALT por USD por intervalo (18 casas decimais). Padrão: 1 VALT/USD.
    uint256 public rewardRateX = 1 * 10**18;

    /// @notice Duração de cada intervalo de recompensa em segundos. Padrão: 60 segundos.
    uint256 public rewardIntervalY = 60;

    /// @notice Quantidade mínima de VALT (18 dec) acumulada para acionar `claimGlobalRewards`. Padrão: 5 VALT.
    uint256 public minClaimAmount = 5 * 10**18;

    /// @notice Indica se um token ERC-20 é suportado como ativo no protocolo.
    mapping(address => bool) public supportedAssets;

    /// @notice Mapeia cada ativo ao seu respectivo token de liquidez (LP token).
    mapping(address => address) public assetToLpToken;

    /// @notice Mapeia cada ativo ao endereço do feed Chainlink para precificação em USD.
    mapping(address => address) public assetPriceFeeds;

    /// @notice Saldo em staking de cada usuário por ativo. [ativo][usuário] => quantidade.
    mapping(address => mapping(address => uint256)) public userStakedBalance;

    /// @notice Timestamp do último cálculo de recompensa de cada usuário por ativo. [ativo][usuário] => timestamp.
    mapping(address => mapping(address => uint256)) public lastStakeTime;

    /// @notice Lista de todos os ativos suportados, utilizada para iteração em `claimGlobalRewards`.
    address[] public supportedAssetList;

    /**
     * @notice Emitido quando a DAO atualiza um parâmetro do protocolo via `updateDaoParams`.
     * @param target    Índice do parâmetro alterado (0=rewardRateX, 1=rewardIntervalY, 2=minClaimAmount).
     * @param novoValor Novo valor aplicado ao parâmetro.
     */
    event ParamAtualizado(uint8 indexed target, uint256 novoValor);

    /**
     * @notice Inicializa o contrato com os endereços do token VALT e do contrato NFT.
     * @param _valtToken   Endereço do token VALT (ValtheraAssets com símbolo VALT).
     * @param _nftContract Endereço do contrato ValtheraNFT.
     */
    constructor(address _valtToken, address _nftContract) Ownable(msg.sender) {
        require(_valtToken   != address(0), "valtToken invalido");
        require(_nftContract != address(0), "nftContract invalido");
        valtToken   = _valtToken;
        nftContract = _nftContract;
    }

    /**
     * @notice Define o endereço do contrato ValtheraDAO.
     * @dev Restrito ao owner. Deve ser chamado após o deploy da DAO.
     *      Somente o endereço aqui definido poderá invocar `updateDaoParams`.
     * @param _dao Endereço do contrato ValtheraDAO.
     */
    function setDaoContract(address _dao) external onlyOwner {
        require(_dao != address(0), "DAO invalida");
        daoContract = _dao;
    }

    /**
     * @notice Atualiza um parâmetro interno do protocolo por decisão da DAO.
     * @dev Restrito ao endereço `daoContract`. Índices válidos: 0, 1, 2.
     *      Valores inválidos de `target` são silenciosamente ignorados.
     * @param target   Índice do parâmetro (0=rewardRateX, 1=rewardIntervalY, 2=minClaimAmount).
     * @param newValue Novo valor a ser aplicado.
     */
    function updateDaoParams(uint8 target, uint256 newValue) external {
        require(msg.sender == daoContract, "Apenas a DAO pode alterar");
        if (target == 0)      rewardRateX     = newValue;
        else if (target == 1) rewardIntervalY = newValue;
        else if (target == 2) minClaimAmount  = newValue;
        emit ParamAtualizado(target, newValue);
    }

    /**
     * @notice Registra um novo ativo suportado e associa seu token LP correspondente.
     * @dev Restrito ao owner. Se o ativo já estiver registrado, apenas o LP token é atualizado.
     *      O feed de oráculo deve ser configurado separadamente via `setOracleFeed`.
     * @param tokenAddress   Endereço do token ERC-20 do ativo (ex: vGOLD).
     * @param lpTokenAddress Endereço do token LP correspondente (ex: vLP-GOLD).
     */
    function setupAsset(address tokenAddress, address lpTokenAddress) external onlyOwner {
        if (!supportedAssets[tokenAddress]) {
            supportedAssets[tokenAddress] = true;
            supportedAssetList.push(tokenAddress);
        }
        assetToLpToken[tokenAddress] = lpTokenAddress;
    }

    /**
     * @notice Associa um feed Chainlink ao ativo para consulta de preço em USD.
     * @dev Restrito ao owner. O ativo deve ter sido registrado previamente via `setupAsset`.
     * @param tokenAddress Endereço do token ERC-20 do ativo.
     * @param feedAddress  Endereço do contrato AggregatorV3Interface (Chainlink ou mock).
     */
    function setOracleFeed(address tokenAddress, address feedAddress) external onlyOwner {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        assetPriceFeeds[tokenAddress] = feedAddress;
    }

    /**
     * @notice Consulta o preço atual do ativo em USD via oráculo Chainlink.
     * @dev Converte o preço de 8 casas decimais (padrão Chainlink) para 18 casas decimais.
     *      Valida integridade dos dados: preço positivo, rodada completa e dados atualizados.
     * @param tokenAddress Endereço do token ERC-20 cujo preço será consultado.
     * @return Preço do ativo em USD com 18 casas decimais.
     */
    function getAssetPriceUSD(address tokenAddress) public view returns (uint256) {
        address feed = assetPriceFeeds[tokenAddress];
        require(feed != address(0), "Oraculo nao configurado");
        (uint80 roundId, int price, , uint256 updatedAt, uint80 answeredInRound) =
            AggregatorV3Interface(feed).latestRoundData();
        require(price > 0,                  "Preco invalido");
        require(updatedAt != 0,             "Rodada incompleta");
        require(answeredInRound >= roundId, "Dados desatualizados");
        return uint256(price) * 1e10;
    }

    /**
     * @notice Registra um ativo físico do mundo real como NFT no protocolo.
     * @dev Delega a cunhagem ao contrato ValtheraNFT. O NFT é atribuído ao chamador.
     * @param description Descrição textual do ativo físico (ex: "Fazenda - Minas Gerais, 50ha").
     * @return tokenId    ID do NFT recém-criado.
     */
    function registerRealAssetNFT(string memory description) external returns (uint256) {
        return INFT(nftContract).mintNFT(msg.sender, description);
    }

    /**
     * @notice Cunha tokens de um ativo suportado diretamente para o chamador (representa depósito).
     * @dev O chamador recebe os tokens sem transferir nenhum ativo real — o depósito é simbólico
     *      no contexto deste MVP. O ativo deve estar registrado via `setupAsset`.
     * @param tokenAddress Endereço do token ERC-20 do ativo a depositar.
     * @param amount       Quantidade de tokens a cunhar (18 casas decimais).
     */
    function depositRealAsset(address tokenAddress, uint256 amount) external {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        IToken(tokenAddress).mint(msg.sender, amount);
    }

    /**
     * @notice Queima tokens de um ativo suportado do chamador (representa retirada).
     * @dev Operação inversa ao `depositRealAsset`. O ativo deve estar registrado.
     * @param tokenAddress Endereço do token ERC-20 do ativo a retirar.
     * @param amount       Quantidade de tokens a queimar (18 casas decimais).
     */
    function withdrawRealAsset(address tokenAddress, uint256 amount) external {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        IToken(tokenAddress).burn(msg.sender, amount);
    }

    /**
     * @notice Calcula a recompensa em VALT pendente para um usuário em um ativo específico.
     * @dev Fórmula: reward = (valorUSD * rewardRateX * intervalos) / 1e18
     *      onde valorUSD = (staked * precoUSD) / 1e18  e  intervalos = timeDiff / rewardIntervalY.
     *      A divisão de intervalos é inteira (floor), garantindo recompensa apenas por períodos completos.
     *      Retorna zero se o usuário não tiver saldo em staking ou não tiver iniciado posição.
     * @param user  Endereço do usuário a consultar.
     * @param token Endereço do token ERC-20 do ativo em staking.
     * @return Quantidade de VALT pendente de resgate (18 casas decimais).
     */
    function getPendingReward(address user, address token) public view returns (uint256) {
        uint256 staked = userStakedBalance[token][user];
        if (staked == 0 || lastStakeTime[token][user] == 0) return 0;
        uint256 timeDiff  = block.timestamp - lastStakeTime[token][user];
        uint256 priceUSD  = getAssetPriceUSD(token);
        uint256 valueUSD  = (staked * priceUSD) / 1e18;
        uint256 intervals = timeDiff / rewardIntervalY;
        return (valueUSD * rewardRateX * intervals) / 1e18;
    }

    /**
     * @notice Processa automaticamente as recompensas acumuladas antes de alterações de posição.
     * @dev Uso interno em `provideLiquidity` e `removeLiquidity`. Atualiza `lastStakeTime`
     *      antes de realizar o mint para seguir o padrão Checks-Effects-Interactions.
     * @param user  Endereço do usuário.
     * @param token Endereço do token ERC-20 do ativo.
     */
    function _autoClaim(address user, address token) internal {
        uint256 reward = getPendingReward(user, token);
        lastStakeTime[token][user] = block.timestamp;
        if (reward > 0) {
            IToken(valtToken).mint(user, reward);
        }
    }

    /**
     * @notice Deposita tokens em staking, inicia acúmulo de recompensas VALT e recebe tokens LP.
     * @dev Requer aprovação prévia (ERC-20 approve) do token do ativo para este contrato.
     *      Se o usuário já possuir posição aberta, as recompensas pendentes são resgatadas
     *      automaticamente antes do novo depósito.
     *      Protegido contra reentrância pelo modificador `nonReentrant`.
     * @param tokenAddress Endereço do token ERC-20 do ativo a depositar em staking.
     * @param amount       Quantidade de tokens a depositar (18 casas decimais).
     */
    function provideLiquidity(address tokenAddress, uint256 amount) external nonReentrant {
        require(supportedAssets[tokenAddress], "Ativo nao suportado");
        if (userStakedBalance[tokenAddress][msg.sender] > 0) {
            _autoClaim(msg.sender, tokenAddress);
        } else {
            lastStakeTime[tokenAddress][msg.sender] = block.timestamp;
        }
        userStakedBalance[tokenAddress][msg.sender] += amount;
        bool ok = IToken(tokenAddress).transferFrom(msg.sender, address(this), amount);
        require(ok, "Transfer falhou");
        IToken(assetToLpToken[tokenAddress]).mint(msg.sender, amount);
    }

    /**
     * @notice Remove tokens do staking, resgata recompensas pendentes e queima os tokens LP.
     * @dev As recompensas acumuladas são processadas automaticamente antes da retirada.
     *      Protegido contra reentrância pelo modificador `nonReentrant`.
     * @param tokenAddress Endereço do token ERC-20 do ativo a retirar do staking.
     * @param amount       Quantidade de tokens a retirar (18 casas decimais).
     */
    function removeLiquidity(address tokenAddress, uint256 amount) external nonReentrant {
        require(userStakedBalance[tokenAddress][msg.sender] >= amount, "Saldo insuficiente");
        _autoClaim(msg.sender, tokenAddress);
        userStakedBalance[tokenAddress][msg.sender] -= amount;
        if (userStakedBalance[tokenAddress][msg.sender] == 0) {
            lastStakeTime[tokenAddress][msg.sender] = 0;
        }
        IToken(assetToLpToken[tokenAddress]).burn(msg.sender, amount);
        bool ok = IToken(tokenAddress).transfer(msg.sender, amount);
        require(ok, "Transfer falhou");
    }

    /**
     * @notice Resgata em uma única transação todas as recompensas VALT acumuladas em todos os ativos.
     * @dev Itera sobre todos os ativos suportados, soma as recompensas pendentes e emite um único
     *      mint de VALT ao final. O total acumulado deve ser maior ou igual a `minClaimAmount`.
     *      Protegido contra reentrância pelo modificador `nonReentrant`.
     */
    function claimGlobalRewards() external nonReentrant {
        uint256 totalToMint = 0;
        uint256 len = supportedAssetList.length;
        for (uint i = 0; i < len; i++) {
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

    /**
     * @notice Retorna a lista completa de endereços de ativos suportados pelo protocolo.
     * @return Array de endereços ERC-20 de todos os ativos registrados.
     */
    function getSupportedAssets() external view returns (address[] memory) {
        return supportedAssetList;
    }
}