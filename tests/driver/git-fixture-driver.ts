import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FixturePlan } from "./fixture-schema";

export class GitFixtureDriver {
  private cleanupPaths: string[] = [];

  createFromFixture(fixturePath: string): { repoDir: string; branch: string } {
    const fixture = this.readFixture(fixturePath);
    const repoDir = this.createRepo(fixture);
    return { repoDir, branch: fixture.branch };
  }

  dispose(): void {
    for (const path of this.cleanupPaths) {
      rmSync(path, { recursive: true, force: true });
    }
    this.cleanupPaths = [];
  }

  private readFixture(fixturePath: string): FixturePlan {
    const raw = readFileSync(fixturePath, "utf8");
    return JSON.parse(raw) as FixturePlan;
  }

  private createRepo(fixture: FixturePlan): string {
    const repoDir = mkdtempSync(join(tmpdir(), "is-this-ci-"));
    this.cleanupPaths.push(repoDir);

    execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", fixture.branch], { cwd: repoDir, stdio: "ignore" });

    const filePath = join(repoDir, "file.txt");
    writeFileSync(filePath, "", "utf8");

    fixture.commits.forEach((commit, index) => {
      appendFileSync(filePath, `${index + 1}: ${commit.message}\n`, "utf8");
      execFileSync("git", ["add", "file.txt"], { cwd: repoDir, stdio: "ignore" });

      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: commit.author.name,
        GIT_AUTHOR_EMAIL: commit.author.email,
        GIT_AUTHOR_DATE: commit.authorDate,
        GIT_COMMITTER_NAME: commit.committer.name,
        GIT_COMMITTER_EMAIL: commit.committer.email,
        GIT_COMMITTER_DATE: commit.commitDate
      };

      execFileSync("git", ["commit", "-m", commit.message], {
        cwd: repoDir,
        env,
        stdio: "ignore"
      });
    });

    const remoteDir = mkdtempSync(join(tmpdir(), "is-this-ci-remote-"));
    this.cleanupPaths.push(remoteDir);

    execFileSync("git", ["init", "--bare"], { cwd: remoteDir, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", remoteDir], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["push", "-u", "origin", fixture.branch], { cwd: repoDir, stdio: "ignore" });

    return repoDir;
  }
}
