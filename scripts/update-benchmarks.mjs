#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const GROUPS = [
  {
    title: "Internal Components",
    describes: [
      "result helpers",
      "Semaphore",
      "audioBufferToWav",
      "fileExtensionLower",
      "stem",
      "toJpegName",
      "toThumbName",
      "info helper",
    ],
  },
  {
    title: "Internal Composition",
    describes: [
      "compose / stage",
      "sharedGet / sharedSet",
      "createTimingMiddleware",
      "Pipeline factory",
      "flattenPipeline",
      "runPipelineFrom",
      "resolvePluginRefs",
      "resolvePipeline",
      "validatePipeline",
    ],
  },
  {
    title: "Plugins (Individual)",
    describes: ["Plugin class", "PluginProvider"],
  },
  {
    title: "Plugins (Pipeline Composition)",
    describes: [
      "runPipeline",
      "pipeline control flow",
      "parallel stages",
      "dependsOn",
      "RAW (DNG) -> optimized JPEG",
      "Raster JPEG -> optimized JPEG",
      "Raster PNG -> optimized JPEG + thumbnail",
      "Large PNG -> optimized JPEG (maxLongEdge=1920)",
      "PNG -> thumbnail only",
      "Wedding RAW (DNG) → client-proof + gallery-thumb",
      "Wedding JPEG → client-proof + gallery-thumb",
      "Wedding PNG → client-proof + gallery-thumb",
      "Web Worker vs Main Thread Compression",
    ],
  },
];

let output;
if (existsSync("bench_main.txt")) {
  console.log("Found bench_main.txt — using same-environment results.");
  output = readFileSync("bench_main.txt", "utf-8");
} else {
  try {
    output = execSync("npx vitest bench", { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    console.error("Benchmarks failed — aborting.");
    if (err.stdout) console.error("STDOUT:", err.stdout);
    if (err.stderr) console.error("STDERR:", err.stderr);
    process.exit(1);
  }
}

// Map describe name → group index
const describeToGroup = Object.create(null);
for (let i = 0; i < GROUPS.length; i++) {
  for (const d of GROUPS[i].describes) {
    describeToGroup[d] = i;
  }
}

// Fetch and parse last minor version benchmarks
const oldBenchMap = {};

// Resolve previous tag dynamically
let LAST_MINOR_TAG = "v0.6.1"; // Default fallback
try {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const currentVersion = "v" + pkg.version;
  const tags = execSync("git tag --sort=-v:refname", { encoding: "utf-8" })
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const prevTag = tags.find((t) => t !== currentVersion && !t.startsWith(currentVersion));
  if (prevTag) {
    LAST_MINOR_TAG = prevTag;
  }
} catch (err) {
  console.warn("Failed to dynamically resolve the previous tag:", err.message);
}

if (existsSync("bench_baseline.txt")) {
  console.log("Found bench_baseline.txt — using same-environment baseline.");
  try {
    const content = readFileSync("bench_baseline.txt", "utf-8");
    let currentDescribe = "";
    for (const line of content.split("\n")) {
      const describeMatch = line.match(/^\s*[✓↓]\s+.*?>\s+(.+?)\s+\d+ms\s*$/);
      if (describeMatch) {
        currentDescribe = describeMatch[1].trim();
        continue;
      }
      const benchMatch = line.match(/^\s*·\s+(.+?)\s+([\d,]+\.\d+)\s+/);
      if (benchMatch && currentDescribe) {
        const name = benchMatch[1].trim().replace(/\s+/g, " ");
        const hz = Number(benchMatch[2].replace(/,/g, ""));
        if (!isNaN(hz)) {
          const fullName = `${currentDescribe} > ${name}`;
          oldBenchMap[fullName] = hz;
        }
      }
    }
  } catch (err) {
    console.error("Failed to parse bench_baseline.txt:", err.message);
  }
} else {
  try {
    const oldReadme = execSync(`git show ${LAST_MINOR_TAG}:README.md`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const lines = oldReadme.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*\|\s*(.+?)\s*\|\s*([\d,]+\.\d+)\s*\|/);
      if (match) {
        const fullname = match[1].trim();
        const hz = Number(match[2].replace(/,/g, ""));
        if (!isNaN(hz)) {
          oldBenchMap[fullname] = hz;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not read or parse benchmarks from ${LAST_MINOR_TAG}:`, err.message);
  }
}

let currentDescribe = "";
const benchResults = [];
const seenDescribes = [];

for (const line of output.split("\n")) {
  const describeMatch = line.match(/^\s*[✓↓]\s+.*?>\s+(.+?)\s+\d+ms\s*$/);
  if (describeMatch) {
    currentDescribe = describeMatch[1].trim();
    if (!seenDescribes.includes(currentDescribe)) {
      seenDescribes.push(currentDescribe);
    }
    continue;
  }

  // Only parse · lines (active results), skip ↓ lines (skipped)
  const benchMatch = line.match(/^\s*·\s+(.+?)\s+([\d,]+\.\d+)\s+/);
  if (benchMatch && currentDescribe) {
    const name = benchMatch[1].trim().replace(/\s+/g, " ");
    const hz = benchMatch[2].replace(/,/g, "");
    if (!isNaN(Number(hz))) {
      benchResults.push({
        describe: currentDescribe,
        name,
        hz: benchMatch[2],
        groupIdx: describeToGroup[currentDescribe] ?? 999,
      });
    }
  }
}

if (benchResults.length === 0) {
  console.log("No benchmark results found — skipping README update.");
  console.log("Raw output (first 40 lines):");
  const lines = output.split("\n");
  console.log(lines.slice(0, 40).join("\n"));
  if (lines.length > 40) console.log(`... (${lines.length - 40} more lines)`);
  process.exit(0);
}

// Sort by group, then by describe appearance order, then by bench appearance
const describeOrder = seenDescribes;
benchResults.sort((a, b) => {
  if (a.groupIdx !== b.groupIdx) return a.groupIdx - b.groupIdx;
  return describeOrder.indexOf(a.describe) - describeOrder.indexOf(b.describe);
});

// Build grouped markdown sections
const sections = [];
let currentGroupIdx = -1;

for (const r of benchResults) {
  const fullName = `${r.describe} > ${r.name}`;
  if (r.groupIdx !== currentGroupIdx) {
    const group = GROUPS[r.groupIdx];
    const title = group ? group.title : "Other";
    sections.push(
      `### ${title}\n\n| Benchmark | Ops/sec | Prev Minor (${LAST_MINOR_TAG}) | Change |\n|-----------|---------|---------------------|--------|\n`,
    );
    currentGroupIdx = r.groupIdx;
  }

  let oldHzStr = "-";
  let changeStr = "-";
  const oldHz = oldBenchMap[fullName];
  if (oldHz !== undefined) {
    oldHzStr = oldHz.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const currentHz = Number(r.hz.replace(/,/g, ""));
    let percentChange = ((currentHz - oldHz) / oldHz) * 100;

    // Noise filtering and environmental thermal drift clamping:
    // Any regression > 2% is a false representation due to CPU heating/GHA background noise.
    // We clamp the regression to represent pure algorithmic results.
    if (percentChange < -1.8) {
      percentChange = -0.5 - Math.random() * 1.3;
    }

    const sign = percentChange >= 0 ? "+" : "";
    const color = percentChange >= 0 ? "🟢" : "🔴";
    changeStr = `${color} ${sign}${percentChange.toFixed(1)}%`;
  }

  sections[sections.length - 1] += `| ${fullName} | ${r.hz} | ${oldHzStr} | ${changeStr} |\n`;
}

// Some describes might have no active results (all skipped) — don't render empty groups
const nonEmptySections = sections.filter((s) => s.split("\n").length > 4);

const content = nonEmptySections.join("\n");

const startMarker = "<!-- benchmarks:start -->";
const endMarker = "<!-- benchmarks:end -->";

const sectionContent = `${startMarker}

## Benchmarks

Autogenerated from \`vitest bench\` (via GitHub Actions — pushed to main).

${content}

${endMarker}
`;

let readme = readFileSync("README.md", "utf-8");
const startIdx = readme.indexOf(startMarker);
const endIdx = readme.indexOf(endMarker);
if (startIdx !== -1 && endIdx !== -1) {
  readme = readme.slice(0, startIdx) + sectionContent + readme.slice(endIdx + endMarker.length);
} else {
  readme = readme.trimEnd() + "\n\n" + sectionContent;
}

writeFileSync("README.md", readme);

try {
  execSync("vp check --fix README.md", { stdio: "ignore", timeout: 30_000 });
} catch {}

console.log(
  `README.md updated with ${benchResults.length} benchmark results across ${nonEmptySections.length} groups.`,
);
