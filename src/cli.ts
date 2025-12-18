import { resolve } from "node:path";
import { generateReport } from "./report-generator";

const args = process.argv.slice(2);
const analysisBranch = args[0];

if (!analysisBranch) {
  console.error("Usage: npm run is-this-ci -- <analysis-branch>");
  process.exit(1);
}

const outputFlagIndex = args.indexOf("--output");
const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "is-this-ci-report.html";

if (outputFlagIndex >= 0 && !outputPath) {
  console.error("Missing value for --output");
  process.exit(1);
}

const resolvedOutput = resolve(process.cwd(), outputPath);

generateReport({ repoDir: process.cwd(), branch: analysisBranch, outputPath: resolvedOutput });

console.log(`Report generated at ${resolvedOutput}`);
