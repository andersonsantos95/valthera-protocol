const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Garante que o diretório Scripts do Python está no PATH (necessário no Windows)
const PYTHON_SCRIPTS = "C:\\Users\\ander\\AppData\\Local\\Programs\\Python\\Python312\\Scripts";
if (!process.env.PATH.includes(PYTHON_SCRIPTS)) {
  process.env.PATH = PYTHON_SCRIPTS + path.delimiter + process.env.PATH;
}

const CONTRACTS = [
  "contracts/ValtheraDeFi.sol",
  "contracts/ValtheraDAO.sol",
  "contracts/ValtheraMarket.sol",
  "contracts/ValtheraNFT.sol",
  "contracts/ValtheraAssets.sol",
];
const REPORTS_DIR = "reports";
const SOLC_VERSION = "0.8.20";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

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

function checkTool(cmd, name) {
  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    console.warn(`⚠️  ${name} não encontrado. Pulando.`);
    return false;
  }
}

function writeReport(filename, content) {
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  console.log(`   → ${filepath}`);
}

// ── Cabeçalho do relatório ───────────────────────────────────────────────────
let mdReport = `# Relatório de Auditoria — Valthera Protocol\n\n`;
mdReport += `**Data:** ${new Date().toLocaleString("pt-BR")}\n\n`;
mdReport += `**Contratos analisados:**\n${CONTRACTS.map(c => `- \`${c}\``).join("\n")}\n\n`;
mdReport += `---\n\n`;

// ── 1. Hardhat Tests + Coverage ──────────────────────────────────────────────
console.log("\n=== 1/3  Hardhat: Testes e Cobertura ===");
const testOut = run("npx hardhat test", "Hardhat Tests");
const coverageOut = run("npx hardhat coverage --reporter min", "Hardhat Coverage");

mdReport += `## 1. Cobertura de Testes (Hardhat)\n\n\`\`\`\n${testOut}\n${coverageOut}\n\`\`\`\n\n`;
mdReport += `> Relatório HTML completo: \`coverage/index.html\`\n\n---\n\n`;

// ── 2. Slither ───────────────────────────────────────────────────────────────
console.log("\n=== 2/3  Slither: Análise Estática ===");
const hasSlither = checkTool("slither --version", "Slither");

if (hasSlither) {
  const slitherJson = path.join(REPORTS_DIR, `slither-${TIMESTAMP}.json`);
  const slitherOut = run(
    `slither . --filter-paths "node_modules" --json ${slitherJson}`,
    "Slither"
  );
  const slitherMd = run(
    `slither . --filter-paths "node_modules" --checklist`,
    "Slither Checklist"
  );
  writeReport(`slither-${TIMESTAMP}.json`, slitherJson);
  writeReport(`slither-${TIMESTAMP}.md`, slitherMd);
  mdReport += `## 2. Slither — Análise Estática\n\n\`\`\`\n${slitherMd}\n\`\`\`\n\n---\n\n`;
} else {
  mdReport += `## 2. Slither — Análise Estática\n\n> Slither não instalado. Execute: \`pip install slither-analyzer\`\n\n---\n\n`;
}

// ── 3. Mythril ───────────────────────────────────────────────────────────────
console.log("\n=== 3/3  Mythril: Execução Simbólica ===");
const hasMythril = checkTool("myth version", "Mythril");

mdReport += `## 3. Mythril — Execução Simbólica\n\n`;

if (hasMythril) {
  // Analisa apenas os contratos com lógica crítica (os mais relevantes)
  const critical = [
    "contracts/ValtheraDeFi.sol",
    "contracts/ValtheraDAO.sol",
    "contracts/ValtheraMarket.sol",
  ];
  for (const contract of critical) {
    const name = path.basename(contract, ".sol");
    console.log(`   Analisando ${name} (pode demorar alguns minutos)...`);
    const mythOut = run(
      `myth analyze ${contract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`,
      `Mythril: ${name}`
    );
    writeReport(`mythril-${name}-${TIMESTAMP}.md`, mythOut);
    mdReport += `### ${name}\n\n\`\`\`\n${mythOut}\n\`\`\`\n\n`;
  }
} else {
  mdReport += `> **Mythril indisponível neste ambiente.**\n`;
  mdReport += `> A dependência \`pyethash\` requer compilação C que não está disponível no Windows nativo.\n\n`;
  mdReport += `> **Alternativas para rodar o Mythril:**\n`;
  mdReport += `> - Docker: \`docker run --rm -v \${PWD}:/project mythril/myth analyze /project/contracts/ValtheraDeFi.sol --solv 0.8.20\`\n`;
  mdReport += `> - WSL: \`wsl pip install mythril && wsl myth analyze contracts/ValtheraDeFi.sol --solv 0.8.20\`\n\n`;
}

mdReport += `---\n\n`;

// ── Salva relatório combinado ─────────────────────────────────────────────────
const combinedPath = path.join(REPORTS_DIR, `auditoria-${TIMESTAMP}.md`);
fs.writeFileSync(combinedPath, mdReport, "utf-8");

console.log(`\n=== Auditoria concluída ===`);
console.log(`Relatório combinado: ${combinedPath}`);
console.log(`Pasta de relatórios: ${REPORTS_DIR}/`);
