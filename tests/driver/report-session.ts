import { join } from "node:path";
import { GitFixtureDriver } from "./git-fixture-driver";
import { GitLogReader, type OverallBuckets } from "./git-log-reader";

export class ReportSession {
  private fixtureDriver = new GitFixtureDriver();
  private gitLogReader = new GitLogReader();
  private repoDir: string | null = null;

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

  dispose(): void {
    this.fixtureDriver.dispose();
  }
}
