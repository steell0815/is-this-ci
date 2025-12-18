import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitFixtureDriver } from "./git-fixture-driver";
import { GitLogReader, type ClusterDetails, type ClusterSummary, type OverallBuckets, type TopAuthors } from "./git-log-reader";
import { generateReport } from "../../src/report-generator";

export class ReportSession {
  private fixtureDriver = new GitFixtureDriver();
  private gitLogReader = new GitLogReader();
  private repoDir: string | null = null;
  private reportPath: string | null = null;
  private projectRoot: string | null = null;
  private envOverrides: Record<string, string> = {};
  private cleanupPaths: string[] = [];

  createFixtureRepo(fixtureName: string): void {
    const normalized = fixtureName.replace(/^fixtures[\\/]/, "");
    const fixturePath = join(process.cwd(), "tests", "fixtures", normalized, "fixture.json");
    const result = this.fixtureDriver.createFromFixture(fixturePath);
    this.repoDir = result.repoDir;
  }

  setProjectRoot(rootDir: string): void {
    this.projectRoot = rootDir;
  }

  readPackageJson(): Record<string, unknown> {
    if (!this.projectRoot) {
      throw new Error("Project root not set. Call givenProjectRoot first.");
    }
    const pkgPath = join(this.projectRoot, "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  }

  resolveProjectPath(relativePath: string): string {
    if (!this.projectRoot) {
      throw new Error("Project root not set. Call givenProjectRoot first.");
    }
    return join(this.projectRoot, relativePath);
  }

  readProjectFile(relativePath: string): string {
    return readFileSync(this.resolveProjectPath(relativePath), "utf8");
  }

  setEnv(key: string, value: string): void {
    this.envOverrides[key] = value;
  }

  setGitLogOutput(output: string): void {
    const scriptDir = mkdtempSync(join(tmpdir(), "is-this-ci-git-"));
    const scriptPath = join(scriptDir, "git");
    const script = `#!/usr/bin/env bash
set -euo pipefail
cmd="$1"
shift || true
if [ "$cmd" = "log" ]; then
cat <<'EOF'
${output}
EOF
exit 0
fi
if [ "$cmd" = "rev-parse" ] && [ "\${1:-}" = "--show-toplevel" ]; then
pwd
exit 0
fi
echo "unsupported git command" >&2
exit 1
`;
    writeFileSync(scriptPath, script, "utf8");
    chmodSync(scriptPath, 0o755);
    this.envOverrides.PATH = `${scriptDir}:${process.env.PATH ?? ""}`;
    this.cleanupPaths.push(scriptDir);
  }

  readOverallBuckets(analysisBranch: string): OverallBuckets {
    if (!this.repoDir) {
      throw new Error("Repo not initialized. Call givenRepoFixture first.");
    }
    return this.gitLogReader.readOverallBuckets(this.repoDir, analysisBranch);
  }

  readTopAuthors(analysisBranch: string): TopAuthors {
    if (!this.repoDir) {
      throw new Error("Repo not initialized. Call givenRepoFixture first.");
    }
    return this.gitLogReader.readTopAuthors(this.repoDir, analysisBranch);
  }

  readClusterDetails(analysisBranch: string): ClusterDetails {
    if (!this.repoDir) {
      throw new Error("Repo not initialized. Call givenRepoFixture first.");
    }
    return this.gitLogReader.readClusterDetails(this.repoDir, analysisBranch);
  }

  readClusterSummary(analysisBranch: string): ClusterSummary {
    if (!this.repoDir) {
      throw new Error("Repo not initialized. Call givenRepoFixture first.");
    }
    return this.gitLogReader.readClusterSummary(this.repoDir, analysisBranch);
  }

  generateReport(analysisBranch: string): string {
    if (!this.repoDir) {
      throw new Error("Repo not initialized. Call givenRepoFixture first.");
    }
    const outputPath = join(this.repoDir, "is-this-ci-report.html");
    const envKeys = Object.keys(this.envOverrides);
    const previousValues = new Map<string, string | undefined>();
    envKeys.forEach((key) => {
      previousValues.set(key, process.env[key]);
      process.env[key] = this.envOverrides[key];
    });
    try {
      this.reportPath = generateReport({ repoDir: this.repoDir, branch: analysisBranch, outputPath });
    } finally {
      envKeys.forEach((key) => {
        const previous = previousValues.get(key);
        if (previous === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous;
        }
      });
    }
    return this.reportPath;
  }

  readReportHtml(): string {
    if (!this.reportPath) {
      throw new Error("Report not generated. Call whenGeneratingReport first.");
    }
    return readFileSync(this.reportPath, "utf8");
  }

  dispose(): void {
    this.fixtureDriver.dispose();
    for (const path of this.cleanupPaths) {
      rmSync(path, { recursive: true, force: true });
    }
    this.cleanupPaths = [];
  }
}
