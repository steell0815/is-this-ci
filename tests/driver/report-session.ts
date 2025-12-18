import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GitFixtureDriver } from "./git-fixture-driver";
import { GitLogReader, type ClusterDetails, type ClusterSummary, type OverallBuckets, type TopAuthors } from "./git-log-reader";
import { generateReport } from "../../src/report-generator";

export class ReportSession {
  private fixtureDriver = new GitFixtureDriver();
  private gitLogReader = new GitLogReader();
  private repoDir: string | null = null;
  private reportPath: string | null = null;

  createFixtureRepo(fixtureName: string): void {
    const normalized = fixtureName.replace(/^fixtures[\\/]/, "");
    const fixturePath = join(process.cwd(), "tests", "fixtures", normalized, "fixture.json");
    const result = this.fixtureDriver.createFromFixture(fixturePath);
    this.repoDir = result.repoDir;
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
    this.reportPath = generateReport({ repoDir: this.repoDir, branch: analysisBranch, outputPath });
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
  }
}
