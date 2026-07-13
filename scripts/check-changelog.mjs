#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// 1. Get the list of staged files
let stagedFiles = [];
try {
  stagedFiles = execSync("git diff --cached --name-only", { encoding: "utf-8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
} catch (err) {
  console.error("Failed to query staged files from Git:", err.message);
  process.exit(1);
}

// 2. Check if any library code inside src/ has been modified
const hasSrcChanges = stagedFiles.some((f) => f.startsWith("src/"));

if (!hasSrcChanges) {
  // No changes to library code, bypass all checks
  process.exit(0);
}

console.log("🔍 Library code changes detected. Running pre-commit release-integrity checks...");

// 3. Ensure package.json is staged and the version has been updated
if (!stagedFiles.includes("package.json")) {
  console.error(
    "❌ Error: Library code changes under 'src/' are staged, but 'package.json' was not updated or staged!",
  );
  console.error("Please update the version in 'package.json' before committing library changes.");
  process.exit(1);
}

let headVersion = null;
try {
  const headPkg = JSON.parse(
    execSync("git show HEAD:package.json", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  headVersion = headPkg.version;
} catch {
  // If HEAD is missing (initial commit) or invalid, we allow any version
}

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const currentVersion = pkg.version;

if (headVersion && currentVersion === headVersion) {
  console.error(
    `❌ Error: Library code changes are staged, but the version in 'package.json' is still '${currentVersion}'!`,
  );
  console.error("Please bump the version in 'package.json' and stage it before committing.");
  process.exit(1);
}

// 4. Ensure jsr.json is staged and matches package.json version
if (!stagedFiles.includes("jsr.json")) {
  console.error("❌ Error: 'jsr.json' must be updated and staged alongside 'package.json'!");
  process.exit(1);
}

const jsr = JSON.parse(readFileSync("jsr.json", "utf-8"));
if (jsr.version !== currentVersion) {
  console.error(
    `❌ Error: The version in 'jsr.json' (${jsr.version}) does not match 'package.json' (${currentVersion})!`,
  );
  console.error("Please synchronize the version in both files.");
  process.exit(1);
}

// 5. Ensure CHANGELOG.md is staged and has a heading for currentVersion
if (!stagedFiles.includes("CHANGELOG.md")) {
  console.error(
    "❌ Error: Library code changes are staged, but 'CHANGELOG.md' has not been updated or staged!",
  );
  console.error(
    `Please document the changes for version '${currentVersion}' in 'CHANGELOG.md' before committing.`,
  );
  process.exit(1);
}

const changelog = readFileSync("CHANGELOG.md", "utf-8");
const expectedHeader = `## [${currentVersion}]`;
if (!changelog.includes(expectedHeader)) {
  console.error(
    `❌ Error: 'CHANGELOG.md' is staged, but it is missing the heading for the new version '${currentVersion}'!`,
  );
  console.error(
    `Please add a section like '## [${currentVersion}] — YYYY-MM-DD' to the changelog before committing.`,
  );
  process.exit(1);
}

console.log("✅ All release-integrity pre-commit checks passed!");
process.exit(0);
