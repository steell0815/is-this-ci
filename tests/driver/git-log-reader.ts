import { execFileSync } from "node:child_process";

export type DelayBucket = "<1h" | "1-4h" | "4-8h" | ">8h";

export type OverallBuckets = {
  bucket: DelayBucket;
  count: number;
  percent: number;
}[];

export type TopAuthors = {
  author: string;
  commits: number;
  ci_within_8h_percent: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
}[];

export type ClusterDetails = {
  dominant_delay_bucket: DelayBucket;
  daily_integration_band: string;
  author: string;
  commits: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
}[];

export type ClusterSummary = {
  dominant_delay_bucket: DelayBucket;
  daily_integration_band: string;
  authors: number;
  commits: number;
}[];

type LogEntry = {
  authorName: string;
  authorEmail: string;
  authorDate: string;
  commitDate: string;
};

type AuthorStats = {
  author: string;
  commits: number;
  ci_within_8h_percent: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
  dominant_delay_bucket: DelayBucket;
  daily_integration_band: string;
};

export class GitLogReader {
  readOverallBuckets(repoDir: string, branch: string): OverallBuckets {
    const entries = this.readLogEntries(repoDir, branch);
    if (entries.length === 0) {
      return [
        { bucket: "<1h", count: 0, percent: 0 },
        { bucket: "1-4h", count: 0, percent: 0 },
        { bucket: "4-8h", count: 0, percent: 0 },
        { bucket: ">8h", count: 0, percent: 0 }
      ];
    }

    const counts: Record<DelayBucket, number> = {
      "<1h": 0,
      "1-4h": 0,
      "4-8h": 0,
      ">8h": 0
    };

    for (const entry of entries) {
      const delayHours = this.delayHours(entry);
      counts[this.bucketForDelay(delayHours)] += 1;
    }

    const total = entries.length;
    return [
      { bucket: "<1h", count: counts["<1h"], percent: this.percent(counts["<1h"], total) },
      { bucket: "1-4h", count: counts["1-4h"], percent: this.percent(counts["1-4h"], total) },
      { bucket: "4-8h", count: counts["4-8h"], percent: this.percent(counts["4-8h"], total) },
      { bucket: ">8h", count: counts[">8h"], percent: this.percent(counts[">8h"], total) }
    ];
  }

  readTopAuthors(repoDir: string, branch: string): TopAuthors {
    const entries = this.readLogEntries(repoDir, branch);
    if (entries.length === 0) {
      return [];
    }

    const rows = this.authorStats(entries);

    return rows
      .sort((a, b) => (b.commits !== a.commits ? b.commits - a.commits : a.author.localeCompare(b.author)))
      .slice(0, 10);
  }

  readClusterDetails(repoDir: string, branch: string): ClusterDetails {
    const entries = this.readLogEntries(repoDir, branch);
    if (entries.length === 0) {
      return [];
    }

    return this.authorStats(entries)
      .map((stats) => ({
        dominant_delay_bucket: stats.dominant_delay_bucket,
        daily_integration_band: stats.daily_integration_band,
        author: stats.author,
        commits: stats.commits,
        daily_integration_rate_percent: stats.daily_integration_rate_percent,
        max_day_gap: stats.max_day_gap
      }))
      .sort((a, b) => a.author.localeCompare(b.author));
  }

  readClusterSummary(repoDir: string, branch: string): ClusterSummary {
    const details = this.readClusterDetails(repoDir, branch);
    if (details.length === 0) {
      return [];
    }

    const clusters = new Map<string, { key: string; dominant: DelayBucket; band: string; authors: number; commits: number }>();
    for (const row of details) {
      const key = `${row.dominant_delay_bucket}|${row.daily_integration_band}`;
      const current = clusters.get(key);
      if (current) {
        current.authors += 1;
        current.commits += row.commits;
      } else {
        clusters.set(key, {
          key,
          dominant: row.dominant_delay_bucket,
          band: row.daily_integration_band,
          authors: 1,
          commits: row.commits
        });
      }
    }

    const bucketOrder: DelayBucket[] = ["<1h", "1-4h", "4-8h", ">8h"];
    const bandOrder = ["daily>=70%", "daily 50-69%", "daily 30-49%", "daily<30%"];

    return Array.from(clusters.values())
      .map((cluster) => ({
        dominant_delay_bucket: cluster.dominant,
        daily_integration_band: cluster.band,
        authors: cluster.authors,
        commits: cluster.commits
      }))
      .sort((a, b) => {
        const bucketDiff = bucketOrder.indexOf(a.dominant_delay_bucket) - bucketOrder.indexOf(b.dominant_delay_bucket);
        if (bucketDiff !== 0) return bucketDiff;
        return bandOrder.indexOf(a.daily_integration_band) - bandOrder.indexOf(b.daily_integration_band);
      });
  }

  private bucketForDelay(delayHours: number): DelayBucket {
    if (delayHours < 1) return "<1h";
    if (delayHours < 4) return "1-4h";
    if (delayHours < 8) return "4-8h";
    return ">8h";
  }

  private readLogEntries(repoDir: string, branch: string): LogEntry[] {
    const output = execFileSync(
      "git",
      ["log", branch, "--pretty=format:%H|%an|%ae|%ad|%cd", "--date=iso"],
      { cwd: repoDir }
    )
      .toString("utf8")
      .trim();

    if (!output) {
      return [];
    }

    return output.split("\n").map((line) => {
      const parts = line.split("|");
      return {
        authorName: parts[1],
        authorEmail: parts[2],
        authorDate: parts[3],
        commitDate: parts[4]
      };
    });
  }

  private authorStats(entries: LogEntry[]): AuthorStats[] {
    const byAuthor = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      const author = `${entry.authorName} <${entry.authorEmail}>`;
      const list = byAuthor.get(author) ?? [];
      list.push(entry);
      byAuthor.set(author, list);
    }

    return Array.from(byAuthor.entries()).map(([author, list]) => {
      const commits = list.length;
      const within8h = list.filter((entry) => this.delayHours(entry) < 8).length;
      const dayGaps = this.dayGaps(list.map((entry) => entry.commitDate));
      const dailyRate =
        dayGaps.length === 0 ? 100 : this.percent(dayGaps.filter((gap) => gap <= 1).length, dayGaps.length);
      const maxDayGap = dayGaps.length === 0 ? 0 : Math.max(...dayGaps);
      const delayCounts: Record<DelayBucket, number> = {
        "<1h": 0,
        "1-4h": 0,
        "4-8h": 0,
        ">8h": 0
      };

      for (const entry of list) {
        const bucket = this.bucketForDelay(this.delayHours(entry));
        delayCounts[bucket] += 1;
      }

      const dominant = this.dominantBucket(delayCounts);

      return {
        author,
        commits,
        ci_within_8h_percent: this.percent(within8h, commits),
        daily_integration_rate_percent: dailyRate,
        max_day_gap: maxDayGap,
        dominant_delay_bucket: dominant,
        daily_integration_band: this.dailyIntegrationBand(dailyRate)
      };
    });
  }

  private dominantBucket(counts: Record<DelayBucket, number>): DelayBucket {
    const order: DelayBucket[] = ["<1h", "1-4h", "4-8h", ">8h"];
    let best = order[0];
    for (const bucket of order) {
      if (counts[bucket] > counts[best]) {
        best = bucket;
      }
    }
    return best;
  }

  private dailyIntegrationBand(rate: number): string {
    if (rate >= 70) return "daily>=70%";
    if (rate >= 50) return "daily 50-69%";
    if (rate >= 30) return "daily 30-49%";
    return "daily<30%";
  }

  private delayHours(entry: LogEntry): number {
    const delayMs = new Date(entry.commitDate).getTime() - new Date(entry.authorDate).getTime();
    return delayMs / (1000 * 60 * 60);
  }

  private dayGaps(commitDates: string[]): number[] {
    const days = Array.from(new Set(commitDates.map((date) => this.toDayKey(date)))).sort();
    if (days.length <= 1) {
      return [];
    }
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i += 1) {
      const prev = Date.parse(days[i - 1]);
      const next = Date.parse(days[i]);
      const diffDays = Math.round((next - prev) / (1000 * 60 * 60 * 24));
      gaps.push(diffDays);
    }
    return gaps;
  }

  private toDayKey(dateStr: string): string {
    return new Date(dateStr).toISOString().slice(0, 10);
  }

  private percent(count: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((count / total) * 1000) / 10;
  }
}
