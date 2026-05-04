const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

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

const ANSI_RE = /\x1B[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
function stripAnsi(str) { return str.replace(ANSI_RE, ""); }

function bumpHeaders(md, levels) {
  return md.replace(/^(#{1,6}) /gm, (_, h) =>
    "#".repeat(Math.min(h.length + levels, 6)) + " "
  );
}

function run(cmd, label, { stdoutOnly = false } = {}) {
  console.log(`\n⏳ ${label}...`);
  try {
    const out = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    console.log(`✅ ${label} concluído.`);
    return stripAnsi(out);
  } catch (e) {
    const out = stdoutOnly
      ? stripAnsi(e.stdout || "")
      : stripAnsi((e.stdout || "") + (e.stderr || ""));
    console.log(`⚠️  ${label} encerrado (pode conter achados).`);
    return out;
  }
}

function toolExists(cmd) {
  try { execSync(cmd, { stdio: "ignore" }); return true; }
  catch { return false; }
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function save(filename, content) {
  ensureReportsDir();
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, content, "utf-8");
  console.log(`   → ${filepath}`);
  return filepath;
}

function detectMythril() {
  if (toolExists("myth version"))                          return { mode: "native" };
  if (toolExists(`wsl bash -lc "myth version"`))          return { mode: "wsl" };
  if (toolExists("docker run --rm mythril/myth version")) return { mode: "docker" };
  return null;
}

function toWslPath(winPath) {
  return winPath
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
}

function parseSlitherJson(jsonPath) {
  try {
    const data   = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const counts = { High: 0, Medium: 0, Low: 0, Informational: 0, Optimization: 0 };
    const byContract = {};

    for (const d of (data.results?.detectors ?? [])) {
      const impact = d.impact in counts ? d.impact : "Informational";
      counts[impact]++;

      const contractNames = new Set();
      for (const el of (d.elements ?? [])) {
        const name = el.type === "contract"
          ? el.name
          : (el.type_specific_fields?.parent?.type === "contract"
              ? el.type_specific_fields.parent.name
              : null);
        if (name) contractNames.add(name);
      }
      for (const cname of contractNames) {
        if (!byContract[cname])
          byContract[cname] = { High: 0, Medium: 0, Low: 0, Informational: 0, Optimization: 0 };
        byContract[cname][impact]++;
      }
    }

    return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), byContract };
  } catch { return null; }
}

function parseHardhatSummary(out) {
  return {
    passing: out.match(/(\d+) passing/)?.[1] ?? "?",
    failing: out.match(/(\d+) failing/)?.[1]  ?? "0",
    pending: out.match(/(\d+) pending/)?.[1]  ?? "0",
  };
}

function parseCoverageTable(text) {
  const lines = text.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/File\s*\|\s*%\s*Stmts/.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;

  const headers = lines[headerIdx].split("|").map(s => s.trim()).filter(Boolean);
  const mdLines = [
    "| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
  ];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("|")) break;
    if (/^[-\s|]+$/.test(line)) continue;
    const cells = line.split("|").map(s => s.trim()).filter(Boolean);
    if (cells.length < 5) continue;

    const isTotal = /all files/i.test(cells[0]);
    for (let j = 1; j <= 4; j++) {
      const pct = parseFloat(cells[j]);
      if (!isNaN(pct)) {
        if (pct < 80)      cells[j] = `⚠️ ${cells[j]}`;
        else if (pct < 90) cells[j] = `🟡 ${cells[j]}`;
      }
    }
    if (isTotal) {
      cells[0] = `**${cells[0]}**`;
      for (let j = 1; j < cells.length; j++) cells[j] = `**${cells[j]}**`;
    }
    mdLines.push("| " + cells.join(" | ") + " |");
  }

  return mdLines.length > 2 ? mdLines.join("\n") : null;
}

function parseMythrilMarkdown(text) {
  if (!text || /no issues were detected/i.test(text)) return { issues: [], safe: true };
  const parts = text.split(/\n## (SWC-\d+)\n/);
  const issues = [];
  for (let i = 1; i < parts.length; i += 2) {
    const content = parts[i + 1] ?? "";
    issues.push({
      swc:      parts[i],
      title:    content.match(/- Title:\s*(.+)/)?.[1]?.trim()    ?? "Unknown",
      severity: content.match(/- Severity:\s*(.+)/)?.[1]?.trim() ?? "Unknown",
      contract: content.match(/- Contract:\s*(.+)/)?.[1]?.trim() ?? "Unknown",
    });
  }
  return { issues, safe: issues.length === 0 };
}

console.log("\n═══════════════════════════════════════════");
console.log("  1/3  Hardhat: Testes e Cobertura");
console.log("═══════════════════════════════════════════");

const testOut       = run("npx hardhat test", "Hardhat Tests");
const coverageOut   = run("npx hardhat coverage", "Hardhat Coverage");
const hardhatStats  = parseHardhatSummary(testOut);
const coverageTable = parseCoverageTable(coverageOut);

save(`hardhat-tests-${TIMESTAMP}.txt`,    testOut);
save(`hardhat-coverage-${TIMESTAMP}.txt`, coverageOut);

console.log("\n═══════════════════════════════════════════");
console.log("  2/3  Slither: Análise Estática");
console.log("═══════════════════════════════════════════");

const slitherOk = toolExists("slither --version");
let slitherChecklist = "";
let slitherJsonPath  = "";
let slitherStats     = null;

if (slitherOk) {
  ensureReportsDir();
  slitherJsonPath = path.join(REPORTS_DIR, `slither-${TIMESTAMP}.json`);

  run(
    `slither . --filter-paths "node_modules" --json "${slitherJsonPath}"`,
    "Slither JSON"
  );
  slitherStats = parseSlitherJson(slitherJsonPath);

  slitherChecklist = run(
    `slither . --filter-paths "node_modules" --checklist`,
    "Slither Checklist",
    { stdoutOnly: true }
  );
  save(`slither-${TIMESTAMP}.md`, slitherChecklist);
}

console.log("\n═══════════════════════════════════════════");
console.log("  3/3  Mythril: Execução Simbólica");
console.log("═══════════════════════════════════════════");

const mythril          = detectMythril();
const mythrilResults   = {};
const mythrilParsed    = {};
let   mythrilTotalIssues = 0;

if (mythril) {
  console.log(`   Modo: ${mythril.mode}`);

  let mythBaseCmd;
  if (mythril.mode === "wsl") {
    const wslCwd = toWslPath(process.cwd());
    const settingsObj = {
      remappings: [
        `@openzeppelin/=${wslCwd}/node_modules/@openzeppelin/`,
        `@chainlink/=${wslCwd}/node_modules/@chainlink/`,
      ],
    };
    const winSettingsPath = path.join(process.env.TEMP ?? "C:\\Temp", "myth-solc-settings.json");
    fs.writeFileSync(winSettingsPath, JSON.stringify(settingsObj), "utf-8");
    mythBaseCmd = { wslCwd, wslSettingsPath: toWslPath(winSettingsPath) };
  }

  for (const contract of ALL_CONTRACTS) {
    const name = path.basename(contract, ".sol");
    console.log(`   Analisando ${name} (pode demorar minutos)...`);

    let mythCmd;
    if (mythril.mode === "wsl") {
      const { wslCwd, wslSettingsPath } = mythBaseCmd;
      const wslContract = contract.replace(/\\/g, "/");
      mythCmd = `wsl bash -lc "cd ${wslCwd} && myth analyze ${wslContract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown --solc-args '--allow-paths ${wslCwd}' --solc-json ${wslSettingsPath}"`;
    } else if (mythril.mode === "docker") {
      mythCmd = `docker run --rm -v "${process.cwd()}:/project" mythril/myth analyze /project/${contract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`;
    } else {
      mythCmd = `myth analyze ${contract} --solv ${SOLC_VERSION} --execution-timeout 120 -o markdown`;
    }

    const output = run(mythCmd, `Mythril: ${name}`);
    mythrilResults[name]  = output;
    mythrilParsed[name]   = parseMythrilMarkdown(output);
    mythrilTotalIssues   += mythrilParsed[name].issues.length;
    save(`mythril-${name}-${TIMESTAMP}.md`, output);
  }
}

const hardhatStatus = hardhatStats.failing === "0"
  ? `✅ ${hardhatStats.passing} passing`
  : `❌ ${hardhatStats.passing} passing / ${hardhatStats.failing} failing`;

const slitherStatus = slitherOk
  ? (slitherStats ? `✅ ${slitherStats.total} achado(s)` : "✅ Executado")
  : "⚠️ Não disponível";

const mythrilStatus = mythril
  ? `✅ ${mythrilTotalIssues} achado(s) — modo \`${mythril.mode}\``
  : "⚠️ Não disponível";

let md = "";

md += `# Relatório de Auditoria de Segurança — Valthera Protocol\n\n`;
md += `| | |\n|---|---|\n`;
md += `| **Data** | ${DATE_LABEL} |\n`;
md += `| **Compilador** | Solidity ${SOLC_VERSION} |\n`;
md += `| **Ferramentas** | Hardhat · Slither · Mythril |\n\n`;

md += `## Contratos Analisados\n\n`;
for (const c of ALL_CONTRACTS) md += `- \`${c}\`\n`;
md += "\n";

md += `## Sumário Executivo\n\n`;
md += `| Ferramenta | Função | Status |\n|---|---|---|\n`;
md += `| Hardhat | Testes unitários e cobertura | ${hardhatStatus} |\n`;
md += `| Slither | Análise estática de vulnerabilidades | ${slitherStatus} |\n`;
md += `| Mythril | Execução simbólica | ${mythrilStatus} |\n\n`;

if (slitherOk && slitherStats) {
  md += `### Achados Slither por Severidade\n\n`;
  md += `| Severidade | Qtd |\n|---|---|\n`;
  md += `| 🔴 High          | ${slitherStats.counts.High} |\n`;
  md += `| 🟠 Medium        | ${slitherStats.counts.Medium} |\n`;
  md += `| 🟡 Low           | ${slitherStats.counts.Low} |\n`;
  md += `| 🔵 Informational | ${slitherStats.counts.Informational} |\n`;
  md += `| ⚪ Optimization   | ${slitherStats.counts.Optimization} |\n`;
  md += `| **Total**        | **${slitherStats.total}** |\n\n`;
}

if (mythril && mythrilTotalIssues > 0) {
  md += `### Achados Mythril por Contrato\n\n`;
  md += `| Contrato | Achados |\n|---|---|\n`;
  for (const [name, parsed] of Object.entries(mythrilParsed)) {
    md += `| ${name} | ${parsed.issues.length} |\n`;
  }
  md += `| **Total** | **${mythrilTotalIssues}** |\n\n`;
}

md += `---\n\n`;

md += `## 1. Hardhat — Testes Unitários e Cobertura\n\n`;

md += `### 1.1 Resultados dos Testes\n\n`;
const pendingNote = hardhatStats.pending !== "0" ? ` | ${hardhatStats.pending} pending` : "";
md += `> **${hardhatStats.passing} passing** | **${hardhatStats.failing} failing**${pendingNote}\n\n`;
md += `\`\`\`\n${testOut.trim()}\n\`\`\`\n\n`;

md += `### 1.2 Cobertura de Código\n\n`;
md += `> Relatório HTML interativo: \`coverage/index.html\`\n\n`;
if (coverageTable) {
  md += `> **Legenda:** ⚠️ < 80% · 🟡 80–89% · sem marca ≥ 90%\n\n`;
  md += coverageTable + "\n\n";
  md += `<details><summary>Saída completa do coverage</summary>\n\n`;
  md += `\`\`\`\n${coverageOut.trim()}\n\`\`\`\n\n`;
  md += `</details>\n\n`;
} else {
  md += `\`\`\`\n${coverageOut.trim()}\n\`\`\`\n\n`;
}

md += `---\n\n`;

md += `## 2. Slither — Análise Estática\n\n`;

if (slitherOk) {
  if (slitherStats) {
    md += `### 2.1 Resumo de Severidade\n\n`;
    md += `| Severidade | Qtd |\n|---|---|\n`;
    md += `| 🔴 High          | ${slitherStats.counts.High} |\n`;
    md += `| 🟠 Medium        | ${slitherStats.counts.Medium} |\n`;
    md += `| 🟡 Low           | ${slitherStats.counts.Low} |\n`;
    md += `| 🔵 Informational | ${slitherStats.counts.Informational} |\n`;
    md += `| ⚪ Optimization   | ${slitherStats.counts.Optimization} |\n`;
    md += `| **Total**        | **${slitherStats.total}** |\n\n`;

    const byContract = slitherStats.byContract;
    if (Object.keys(byContract).length > 0) {
      md += `### 2.2 Achados por Contrato\n\n`;
      md += `| Contrato | 🔴 High | 🟠 Medium | 🟡 Low | 🔵 Info | ⚪ Opt | Total |\n`;
      md += `|---|---|---|---|---|---|---|\n`;
      for (const [cname, c] of Object.entries(byContract)) {
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        md += `| ${cname} | ${c.High} | ${c.Medium} | ${c.Low} | ${c.Informational} | ${c.Optimization} | **${total}** |\n`;
      }
      md += "\n";
    }

    md += `### 2.3 Achados Detalhados\n\n`;
  } else {
    md += `### 2.1 Achados Detalhados\n\n`;
  }

  if (slitherChecklist.trim()) {
    const headerOffset = slitherStats ? 3 : 2;
    md += bumpHeaders(slitherChecklist.trim(), headerOffset) + "\n\n";
  } else {
    md += "> Nenhum resultado retornado pelo Slither.\n\n";
  }
  md += `> Relatório JSON completo: \`reports/slither-${TIMESTAMP}.json\`\n\n`;
} else {
  md += `> **Slither não disponível.** Instale com: \`pip install slither-analyzer\`\n\n`;
}

md += `---\n\n`;

md += `## 3. Mythril — Execução Simbólica\n\n`;

if (mythril) {
  md += `> **Modo:** \`${mythril.mode}\` | **Contratos analisados:** ${ALL_CONTRACTS.length} | **Timeout:** 120s por contrato\n\n`;

  const allIssues = Object.values(mythrilParsed).flatMap(p => p.issues);
  if (allIssues.length > 0) {
    md += `### 3.0 Resumo de Achados\n\n`;
    md += `| Contrato | SWC | Título | Severidade |\n|---|---|---|---|\n`;
    for (const [name, parsed] of Object.entries(mythrilParsed)) {
      for (const issue of parsed.issues) {
        md += `| ${name} | ${issue.swc} | ${issue.title} | ${issue.severity} |\n`;
      }
    }
    md += "\n";
  }

  let idx = 1;
  for (const [name, output] of Object.entries(mythrilResults)) {
    const parsed = mythrilParsed[name];
    const statusIcon = parsed.safe ? "✅" : `⚠️ ${parsed.issues.length} achado(s)`;
    md += `### 3.${idx++} ${name} — ${statusIcon}\n\n`;
    if (output.trim()) {
      const fixedOutput = output.trim().replace(
        /^# Analysis results for None$/m,
        `# Analysis results for ${name}`
      );
      md += bumpHeaders(fixedOutput, 3) + "\n\n";
    } else {
      md += "> Nenhum resultado retornado pelo Mythril para este contrato.\n\n";
    }
    md += `> Relatório individual: \`reports/mythril-${name}-${TIMESTAMP}.md\`\n\n`;
  }
} else {
  md += `> **Indisponível neste ambiente.**\n`;
  md += `> A dependência \`pyethash\` não possui wheel pré-compilado para Windows + Python 3.12.\n\n`;
  md += `### Opção A — WSL (recomendado)\n\n`;
  md += `\`\`\`bash\n`;
  md += `wsl --install\n`;
  md += `wsl pip install mythril\n`;
  md += `npm run audit\n`;
  md += `\`\`\`\n\n`;
  md += `### Opção B — Docker Desktop\n\n`;
  md += `\`\`\`bash\n`;
  md += `npm run audit\n`;
  md += `\`\`\`\n\n`;
}

md += `---\n`;

save(`auditoria-${TIMESTAMP}.md`, md);

console.log("\n═══════════════════════════════════════════");
console.log("  Auditoria concluída!");
console.log(`  Relatório: reports/auditoria-${TIMESTAMP}.md`);
console.log("═══════════════════════════════════════════\n");
