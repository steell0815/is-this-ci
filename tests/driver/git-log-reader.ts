import { execFileSync } from "node:child_process";

export type DelayBucket = "<1h" | "1-4h" | "4-8h" | ">8h";

export type OverallBuckets = {
  bucket: DelayBucket;
  count: number;
  percent: number;
}[];

export class GitLogReader {
  readOverallBuckets(repoDir: string, branch: string): OverallBuckets {
    const output = execFileSync(
      "git",
      ["log", branch, "--pretty=format:%H|%an|%ae|%ad|%cd", "--date=iso"],
      { cwd: repoDir }
    )
      .toString("utf8")
      .trim();

    if (!output) {
      return [
        { bucket: "<1h", count: 0, percent: 0 },
        { bucket: "1-4h", count: 0, percent: 0 },
        { bucket: "4-8h", count: 0, percent: 0 },
        { bucket: ">8h", count: 0, percent: 0 }
      ];
    }

    const lines = output.split("\n");
    const counts: Record<DelayBucket, number> = {
      "<1h": 0,
      "1-4h": 0,
      "4-8h": 0,
      ">8h": 0
    };

    for (const line of lines) {
      const parts = line.split("|");
      const authorDate = parts[3];
      const commitDate = parts[4];
      const delayMs = new Date(commitDate).getTime() - new Date(authorDate).getTime();
      const delayHours = delayMs / (1000 * 60 * 60);
      counts[this.bucketForDelay(delayHours)] += 1;
    }

    const total = lines.length;
    return [
      { bucket: "<1h", count: counts["<1h"], percent: this.percent(counts["<1h"], total) },
      { bucket: "1-4h", count: counts["1-4h"], percent: this.percent(counts["1-4h"], total) },
      { bucket: "4-8h", count: counts["4-8h"], percent: this.percent(counts["4-8h"], total) },
      { bucket: ">8h", count: counts[">8h"], percent: this.percent(counts[">8h"], total) }
    ];
  }

  private bucketForDelay(delayHours: number): DelayBucket {
    if (delayHours < 1) return "<1h";
    if (delayHours < 4) return "1-4h";
    if (delayHours < 8) return "4-8h";
    return ">8h";
  }

  private percent(count: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((count / total) * 1000) / 10;
  }
}
