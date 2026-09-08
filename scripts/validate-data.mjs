import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET_MARKETS = new Map([
  ["Mexico", "LATAM"],
  ["Argentina", "LATAM"],
  ["Chile", "LATAM"],
  ["Colombia", "LATAM"],
  ["Nigeria", "WEST AFRICA"],
  ["Ghana", "WEST AFRICA"],
  ["Senegal", "WEST AFRICA"],
  ["Côte d’Ivoire", "WEST AFRICA"],
  ["Togo", "WEST AFRICA"],
  ["Uganda", "WEST AFRICA"],
  ["Benin", "WEST AFRICA"],
  ["India", "INDIA"],
]);

const REQUIRED_COLUMNS = {
  operators: [
    "report_date",
    "country",
    "region",
    "tier",
    "rank",
    "brand",
    "aps",
    "ceb_usd",
    "market_share_pct",
    "source_report",
  ],
  games: ["report_date", "country", "region", "tier", "rank", "game", "provider", "source_report"],
  availability: ["report_date", "country", "region", "operators_available", "games_available"],
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header));
  return {
    headers,
    records: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

function snapshotKey(row) {
  return `${row.country}\u0000${row.report_date}`;
}

function groupCount(records) {
  const counts = new Map();
  records.forEach((row) => counts.set(snapshotKey(row), (counts.get(snapshotKey(row)) ?? 0) + 1));
  return counts;
}

function validateRanks(records, identity, label) {
  const seen = new Set();
  records.forEach((row, index) => {
    const rank = Number(row.rank);
    assert(Number.isInteger(rank) && rank >= 1 && rank <= 15, `${label} row ${index + 2}: rank must be 1–15`);
    const duplicateKey = `${snapshotKey(row)}\u0000${rank}`;
    assert(!seen.has(duplicateKey), `${label}: duplicate country/date/rank ${row.country} ${row.report_date} #${rank}`);
    seen.add(duplicateKey);
    assert(Boolean(row[identity]), `${label} row ${index + 2}: ${identity} is empty`);
    assert(TARGET_MARKETS.has(row.country), `${label} row ${index + 2}: non-target country ${row.country}`);
    assert(TARGET_MARKETS.get(row.country) === row.region, `${label} row ${index + 2}: invalid region for ${row.country}`);
  });
}

const paths = {
  operators: resolve(root, "data", "operators.csv"),
  games: resolve(root, "data", "games.csv"),
  availability: resolve(root, "data", "availability.csv"),
  status: resolve(root, "data", "status.json"),
};

for (const [label, path] of Object.entries(paths)) {
  assert(existsSync(path), `Missing required file: ${label}`);
}

const [operatorsText, gamesText, availabilityText, statusText, indexText] = await Promise.all([
  readFile(paths.operators, "utf8"),
  readFile(paths.games, "utf8"),
  readFile(paths.availability, "utf8"),
  readFile(paths.status, "utf8"),
  readFile(resolve(root, "index.html"), "utf8"),
]);

const operators = parseCSV(operatorsText);
const games = parseCSV(gamesText);
const availability = parseCSV(availabilityText);

for (const [label, parsed] of Object.entries({ operators, games, availability })) {
  REQUIRED_COLUMNS[label].forEach((column) => assert(parsed.headers.includes(column), `${label}.csv: missing column ${column}`));
}

validateRanks(operators.records, "brand", "operators.csv");
validateRanks(games.records, "game", "games.csv");

const operatorCounts = groupCount(operators.records);
const gameCounts = groupCount(games.records);
const availabilityKeys = new Set();

availability.records.forEach((row, index) => {
  const rowKey = snapshotKey(row);
  assert(!availabilityKeys.has(rowKey), `availability.csv: duplicate country/date ${row.country} ${row.report_date}`);
  availabilityKeys.add(rowKey);
  assert(TARGET_MARKETS.has(row.country), `availability row ${index + 2}: non-target country ${row.country}`);
  assert(TARGET_MARKETS.get(row.country) === row.region, `availability row ${index + 2}: invalid region for ${row.country}`);
  assert(["true", "false"].includes(row.operators_available), `availability row ${index + 2}: invalid operators_available`);
  assert(["true", "false"].includes(row.games_available), `availability row ${index + 2}: invalid games_available`);

  const expectedOperators = row.operators_available === "true" ? 15 : 0;
  const expectedGames = row.games_available === "true" ? 15 : 0;
  assert(
    (operatorCounts.get(rowKey) ?? 0) === expectedOperators,
    `${row.country} ${row.report_date}: operators_available=${row.operators_available}, rows=${operatorCounts.get(rowKey) ?? 0}`,
  );
  assert(
    (gameCounts.get(rowKey) ?? 0) === expectedGames,
    `${row.country} ${row.report_date}: games_available=${row.games_available}, rows=${gameCounts.get(rowKey) ?? 0}`,
  );
});

operators.records.forEach((row) => assert(availabilityKeys.has(snapshotKey(row)), `operators.csv: no availability row for ${snapshotKey(row)}`));
games.records.forEach((row) => assert(availabilityKeys.has(snapshotKey(row)), `games.csv: no availability row for ${snapshotKey(row)}`));

let status;
try {
  status = JSON.parse(statusText);
} catch {
  failures.push("status.json is not valid JSON");
}
if (status) {
  ["last_checked", "last_updated", "latest_reports", "status"].forEach((field) =>
    assert(Object.hasOwn(status, field), `status.json: missing ${field}`),
  );
  assert(Array.isArray(status.latest_reports), "status.json: latest_reports must be an array");
}

assert(indexText.includes('href="./assets/styles.css"'), "index.html must use a relative stylesheet path");
assert(indexText.includes('src="./assets/app.js"'), "index.html must use a relative script path");
assert(existsSync(resolve(root, ".nojekyll")), "Missing .nojekyll marker for GitHub Pages");

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Validation passed.");
  console.log(`Operators: ${operators.records.length} rows`);
  console.log(`Games: ${games.records.length} rows`);
  console.log(`Availability: ${availability.records.length} country-period rows`);
}
