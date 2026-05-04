const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

// Garante que o diretório Scripts do Python está no PATH (necessário no Windows)
const PYTHON_SCRIPTS = "C:\\Users\\ander\\AppData\\Local\\Programs\\Python\\Python312\\Scripts";
if (!process.env.PATH.includes(PYTHON_SCRIPTS)) {
  process.env.PATH = PYTHON_SCRIPTS + path.delimiter + process.env.PATH;
}

const CRITICAL_CONTRACTS = [
  "contracts/ValtheraDeFi.sol",
  "contracts/ValtheraDAO.sol",
  "contracts/ValtheraMarket.sol",
];
const ALL_CONTRACTS = [
  ...CRITICAL_CONTRACTS,
  "contracts/ValtheraNFT.sol",
  "contracts/ValtheraAssets.sol",
];
const REPORTS_DIR  = "reports";
const SOLC_VERSION = "0.8.20";
const TIMESTAMP    = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const DATE_LABEL   = new Date().toLocaleString("pt-BR");

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, label) {
  console.log(`\n⏳ ${label}...`);
  try {
    const out = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    console.log(`✅ ${label} concluído.`);
    return out;
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    console.log(`⚠️  ${label} encerrado (pode conter achados).`);
    return out;
  }
}

function toolExists(cmd) {
  try { execSync(cmd, { stdio: "ignore" }); return true; }
  catch { return false; }
}

function save(filename, content) {
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  console.log(`   → ${filepath}`);
  return filepath;
}

// Detecta se o Mythril está disponível: nativo, via WSL ou via Docker
function detectMythril() {
  if (toolExists("myth version"))          return { mode: "native",  cmd: "myth" };
  if (toolExists("wsl myth version"))      return { mode: "wsl",     cmd: "wsl myth" };
  if (toolExists("docker run --rm mythril/myth version")) return { mode: "docker", cmd: null };
  return null;
}

// ── Cabeçalho ─────────────────────────────────────────────────────────────────
let md = `# Relatório de Auditoria — Valthera Protocol\n\n`;
md += `**Data:** ${DATE_LABEL}\n\n`;
md += `**Contratos analisados:**\n${ALL_CONTRACTS.map(c => `- \`${c}\``).join("\n")}\n\n`;
md += `| Ferramenta | Função |\n|---|---|\n`;
md += `| Hardhat | Testes unitários + cobertura de código |\n`;
md += `| Slither | Análise estática de vulnerabilidades |\n`;
md += `| Mythril | Execução simbólica — vulnerabilidades de execução |\n\n`;
md += `---\n\n`;

// ── 1. Hardhat: Testes + Cobertura ────────────────────────────────────────────
console.log("\n=== 1/3  Hardhat: Testes e Cobertura ===");

const testOut     = run("npx hardhat test", "Hardhat Tests");
const coverageOut = run("npx hardhat coverage --reporter min", "Hardhat Coverage");

save(`hardhat-tests-${TIMESTAMP}.txt`,    testOut);
save(`hardhat-coverage-${TIMESTAMP}.txt`, coverageOut);

md += `## 1. Hardhat — Testes e Cobertura\n\n`;
md += `### Resultados dos Testes\n\n\`\`\`\n${testOut.trim()}\n\`\`\`\n\n`;
md += `### Cobertura de Código\n\n\`\`\`\n${coverageOut.trim()}\n\`\`\`\n\n`;
md += `> Relatório HTML interativo: \`coverage/index.html\`\n\n---\n\n`;

// ── 2. Slither ────────────────────────────────────────────────────────────────
console.log("\n=== 2/3  Slither: Análise Estática ===");

if (toolExists("slither --version")) {
  const slitherJsonPath = path.join(REPORTS_DIR, `slither-${TIMESTAMP}.json`);
  const slitherJson = run(
    `slither . --filter-paths "node_modules" --json ${slitherJsonPath}`,
    "Slither JSON"
  );
  const slitherMd = run(
    `slither . --filter-paths "node_modules" --checklist`,
    "Slither Checklist"
  );
  save(`slither-${TIMESTAMP}.json`, slitherJsonPath);
  save(`slither-${TIMESTAMP}.md`,   slitherMd);
  md += `## 2. Slither — Análise Estática\n\n\`\`\`\n${slitherMd.trim()}\n\`\`\`\n\n`;
  md += `> Relatório JSON completo: \`reports/slither-${TIMESTAMP}.json\`\n\n---\n\n`;
} else {
  console.warn("⚠️  Slither não encontrado.");
  md += `## 2. Slither — Análise Estática\n\n> Não disponível. Instale com: \`pip install slither-analyzer\`\n\n---\n\n`;
}

// ── 3. Mythril ────────────────────────────────────────────────────────────────
console.log("\n=== 3/3  Mythril: Execução Simbólica ===");

const mythril = detectMythril();

if (mythril) {
  console.log(`   Modo de execução: ${mythril.mode}`);
  md += `## 3. Mythril — Execução Simbólica\n\n> Modo: \`${mythril.mode}\`\n\n`;

  for (const contract of CRITICAL_CONTRACTS) {
    const name = path.basename(contract, ".sol");
    console.log(`   Analisando ${name} (pode demorar alguns minutos)...`);

    let mythCmd;
    if (mythril.mode === "wsl") {
      const wslPath = contract.replace(/\\/g, "/");
      mythCmd = `wsl myth analyze ${wslPath} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`;
    } else if (mythril.mode === "docker") {
      mythCmd = `docker run --rm -v "${process.cwd()}:/project" mythril/myth analyze /project/${contract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`;
    } else {
      mythCmd = `myth analyze ${contract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`;
    }

    const mythOut = run(mythCmd, `Mythril: ${name}`);
    save(`mythril-${name}-${TIMESTAMP}.md`, mythOut);
    md += `### ${name}\n\n\`\`\`\n${mythOut.trim()}\n\`\`\`\n\n`;
  }
} else {
  console.warn("⚠️  Mythril não encontrado (nativo, WSL ou Docker).");
  md += `## 3. Mythril — Execução Simbólica\n\n`;
  md += `> **Indisponível neste ambiente.**\n`;
  md += `> A dependência \`pyethash\` não possui wheel pré-compilado para Windows + Python 3.12.\n\n`;
  md += `> **Para habilitar o Mythril, escolha uma das opções abaixo:**\n\n`;
  md += `> **Opção A — WSL** (recomendado)\n`;
  md += `> \`\`\`\n`;
  md += `> # Execute como Administrador no terminal Windows:\n`;
  md += `> wsl --install\n`;
  md += `> # Reinicie o computador, depois:\n`;
  md += `> wsl pip install mythril\n`;
  md += `> npm run audit\n`;
  md += `> \`\`\`\n\n`;
  md += `> **Opção B — Docker Desktop**\n`;
  md += `> Instale em https://www.docker.com/products/docker-desktop\n`;
  md += `> Após instalar, \`npm run audit\` detecta e usa automaticamente.\n\n`;
}

md += `---\n\n`;

// ── Resumo executivo ──────────────────────────────────────────────────────────
md += `## Resumo Executivo\n\n`;
md += `| Ferramenta | Status |\n|---|---|\n`;
md += `| Hardhat Tests | ${testOut.includes("passing") ? "✅ Passou" : "❌ Falhou"} |\n`;
md += `| Slither | ${toolExists("slither --version") ? "✅ Executado" : "⚠️ Não disponível"} |\n`;
md += `| Mythril | ${mythril ? `✅ Executado (${mythril.mode})` : "⚠️ Não disponível — ver Seção 3"} |\n\n`;

// ── Salva relatório combinado ─────────────────────────────────────────────────
const reportPath = path.join(REPORTS_DIR, `auditoria-${TIMESTAMP}.md`);
fs.writeFileSync(reportPath, md, "utf-8");

console.log(`\n=== Auditoria concluída ===`);
console.log(`Relatório combinado: ${reportPath}`);
