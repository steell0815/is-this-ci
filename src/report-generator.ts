import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type DelayBucket = "<1h" | "1-4h" | "4-8h" | ">8h";

type LogEntry = {
  authorName: string;
  authorEmail: string;
  authorDate: string;
  commitDate: string;
};

type OverallBucketRow = {
  bucket: DelayBucket;
  count: number;
  percent: number;
};

type TopAuthorRow = {
  author: string;
  commits: number;
  ci_within_8h_percent: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
};

type ClusterDetailRow = {
  dominant_delay_bucket: DelayBucket;
  daily_integration_band: string;
  author: string;
  commits: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
};

type ClusterSummaryRow = {
  dominant_delay_bucket: DelayBucket;
  daily_integration_band: string;
  authors: number;
  commits: number;
};

type ReportData = {
  overall_buckets: OverallBucketRow[];
  top10_authors: TopAuthorRow[];
  cluster_details: ClusterDetailRow[];
  cluster_summary: ClusterSummaryRow[];
};

type ReportOptions = {
  repoDir: string;
  branch: string;
  outputPath: string;
};

export function generateReport(options: ReportOptions): string {
  const entries = readLogEntries(options.repoDir, options.branch);
  const data: ReportData = {
    overall_buckets: overallBuckets(entries),
    top10_authors: topAuthors(entries),
    cluster_details: clusterDetails(entries),
    cluster_summary: clusterSummary(entries)
  };

  const html = renderReportHtml(data);
  writeFileSync(options.outputPath, html, "utf8");
  return options.outputPath;
}

function readLogEntries(repoDir: string, branch: string): LogEntry[] {
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

function overallBuckets(entries: LogEntry[]): OverallBucketRow[] {
  const counts: Record<DelayBucket, number> = {
    "<1h": 0,
    "1-4h": 0,
    "4-8h": 0,
    ">8h": 0
  };

  for (const entry of entries) {
    const bucket = bucketForDelay(delayHours(entry));
    counts[bucket] += 1;
  }

  const total = entries.length;
  return [
    { bucket: "<1h", count: counts["<1h"], percent: percent(counts["<1h"], total) },
    { bucket: "1-4h", count: counts["1-4h"], percent: percent(counts["1-4h"], total) },
    { bucket: "4-8h", count: counts["4-8h"], percent: percent(counts["4-8h"], total) },
    { bucket: ">8h", count: counts[">8h"], percent: percent(counts[">8h"], total) }
  ];
}

function topAuthors(entries: LogEntry[]): TopAuthorRow[] {
  const stats = authorStats(entries);
  return stats
    .sort((a, b) => (b.commits !== a.commits ? b.commits - a.commits : a.author.localeCompare(b.author)))
    .slice(0, 10)
    .map((stat) => ({
      author: stat.author,
      commits: stat.commits,
      ci_within_8h_percent: stat.ci_within_8h_percent,
      daily_integration_rate_percent: stat.daily_integration_rate_percent,
      max_day_gap: stat.max_day_gap
    }));
}

function clusterDetails(entries: LogEntry[]): ClusterDetailRow[] {
  return authorStats(entries)
    .map((stat) => ({
      dominant_delay_bucket: stat.dominant_delay_bucket,
      daily_integration_band: stat.daily_integration_band,
      author: stat.author,
      commits: stat.commits,
      daily_integration_rate_percent: stat.daily_integration_rate_percent,
      max_day_gap: stat.max_day_gap
    }))
    .sort((a, b) => a.author.localeCompare(b.author));
}

function clusterSummary(entries: LogEntry[]): ClusterSummaryRow[] {
  const details = clusterDetails(entries);
  const clusters = new Map<string, ClusterSummaryRow>();

  for (const row of details) {
    const key = `${row.dominant_delay_bucket}|${row.daily_integration_band}`;
    const current = clusters.get(key);
    if (current) {
      current.authors += 1;
      current.commits += row.commits;
    } else {
      clusters.set(key, {
        dominant_delay_bucket: row.dominant_delay_bucket,
        daily_integration_band: row.daily_integration_band,
        authors: 1,
        commits: row.commits
      });
    }
  }

  const bucketOrder: DelayBucket[] = ["<1h", "1-4h", "4-8h", ">8h"];
  const bandOrder = ["daily>=70%", "daily 50-69%", "daily 30-49%", "daily<30%"];

  return Array.from(clusters.values()).sort((a, b) => {
    const bucketDiff = bucketOrder.indexOf(a.dominant_delay_bucket) - bucketOrder.indexOf(b.dominant_delay_bucket);
    if (bucketDiff !== 0) return bucketDiff;
    return bandOrder.indexOf(a.daily_integration_band) - bandOrder.indexOf(b.daily_integration_band);
  });
}

function authorStats(entries: LogEntry[]) {
  const byAuthor = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const author = `${entry.authorName} <${entry.authorEmail}>`;
    const list = byAuthor.get(author) ?? [];
    list.push(entry);
    byAuthor.set(author, list);
  }

  return Array.from(byAuthor.entries()).map(([author, list]) => {
    const commits = list.length;
    const within8h = list.filter((entry) => delayHours(entry) < 8).length;
    const dayGaps = dayGapsFromDates(list.map((entry) => entry.commitDate));
    const dailyRate = dayGaps.length === 0 ? 100 : percent(dayGaps.filter((gap) => gap <= 1).length, dayGaps.length);
    const maxDayGap = dayGaps.length === 0 ? 0 : Math.max(...dayGaps);
    const delayCounts: Record<DelayBucket, number> = {
      "<1h": 0,
      "1-4h": 0,
      "4-8h": 0,
      ">8h": 0
    };

    for (const entry of list) {
      delayCounts[bucketForDelay(delayHours(entry))] += 1;
    }

    const dominant = dominantBucket(delayCounts);

    return {
      author,
      commits,
      ci_within_8h_percent: percent(within8h, commits),
      daily_integration_rate_percent: dailyRate,
      max_day_gap: maxDayGap,
      dominant_delay_bucket: dominant,
      daily_integration_band: dailyIntegrationBand(dailyRate)
    };
  });
}

function delayHours(entry: LogEntry): number {
  const delayMs = new Date(entry.commitDate).getTime() - new Date(entry.authorDate).getTime();
  return delayMs / (1000 * 60 * 60);
}

function bucketForDelay(delayHoursValue: number): DelayBucket {
  if (delayHoursValue < 1) return "<1h";
  if (delayHoursValue < 4) return "1-4h";
  if (delayHoursValue < 8) return "4-8h";
  return ">8h";
}

function percent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function dayGapsFromDates(commitDates: string[]): number[] {
  const days = Array.from(new Set(commitDates.map((date) => new Date(date).toISOString().slice(0, 10)))).sort();
  if (days.length <= 1) return [];
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i += 1) {
    const prev = Date.parse(days[i - 1]);
    const next = Date.parse(days[i]);
    gaps.push(Math.round((next - prev) / (1000 * 60 * 60 * 24)));
  }
  return gaps;
}

function dominantBucket(counts: Record<DelayBucket, number>): DelayBucket {
  const order: DelayBucket[] = ["<1h", "1-4h", "4-8h", ">8h"];
  let best = order[0];
  for (const bucket of order) {
    if (counts[bucket] > counts[best]) {
      best = bucket;
    }
  }
  return best;
}

function dailyIntegrationBand(rate: number): string {
  if (rate >= 70) return "daily>=70%";
  if (rate >= 50) return "daily 50-69%";
  if (rate >= 30) return "daily 30-49%";
  return "daily<30%";
}

function renderReportHtml(data: ReportData): string {
  const tableTooltips: Record<string, string> = {
    overall_buckets: "Delay buckets across all commits",
    top10_authors: "Top authors by commit volume",
    cluster_summary: "Cluster rollups by delay and daily integration",
    cluster_details: "Per-author cluster metrics and assignment"
  };

  const columnTooltips: Record<string, Record<string, string>> = {
    overall_buckets: {
      bucket: "Predefined bins: `<1h`, `1-4h`, `4-8h`, `>8h` based on (committer date − author date) per commit",
      count: "Count of commits whose delay falls into the bucket",
      percent: "count / total_commits * 100, rounded to one decimal"
    },
    top10_authors: {
      author: "Taken from `%an <%ae>` in `git log origin/master`",
      commits: "Count of commits with matching author identity",
      ci_within_8h_percent: "(commits with delay < 8h) / commits * 100",
      daily_integration_rate_percent:
        "Build sorted unique commit dates per author (committer date), compute day gaps, then `gaps<=1 / total_gaps * 100`",
      max_day_gap: "Max of the day-gap series per author"
    },
    cluster_summary: {
      dominant_delay_bucket: "Most common delay bucket for authors in the cluster",
      daily_integration_band:
        "Predefined bands on per-author daily integration rate: `daily>=70%`, `daily 50-69%`, `daily 30-49%`, `daily<30%`",
      authors: "Count of authors whose dominant bucket and daily band match the cluster",
      commits: "Sum of commit counts for authors in the cluster"
    },
    cluster_details: {
      dominant_delay_bucket: "Most frequent delay bucket in that author's commits",
      daily_integration_band: "Band based on that author’s daily integration rate",
      author: "Taken from `%an <%ae>` in `git log origin/master`",
      commits: "Count of commits with matching author identity",
      daily_integration_rate_percent: "See \"daily_integration_rate_percent\" in top10 table; same calculation",
      max_day_gap: "Max gap in days between consecutive commit dates (committer date) for that author"
    }
  };

  const sections = [
    renderSection("overall_buckets", "Overall Buckets", data.overall_buckets, tableTooltips, columnTooltips),
    renderSection("top10_authors", "Top 10 Authors", data.top10_authors, tableTooltips, columnTooltips),
    renderSection("cluster_summary", "Cluster Summary", data.cluster_summary, tableTooltips, columnTooltips),
    renderSection("cluster_details", "Cluster Details", data.cluster_details, tableTooltips, columnTooltips)
  ].join("\n");

  const chartJsBundle = loadChartJsBundle();
  const chartInitScript = buildChartInitScript();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Is This CI Report</title>
  <style>
    :root {
      --bg: #f6f4ef;
      --ink: #212121;
      --accent: #2f5d50;
      --muted: #6b6b6b;
      --table-border: #d9d2c3;
    }
    body {
      margin: 0;
      font-family: "Georgia", "Times New Roman", serif;
      color: var(--ink);
      background: var(--bg);
    }
    header {
      padding: 32px 24px 8px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 22px;
      color: var(--accent);
    }
    .report-section {
      padding: 24px;
      border-top: 1px solid var(--table-border);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 14px;
    }
    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--table-border);
      text-align: left;
    }
    th {
      font-weight: 600;
      color: var(--accent);
    }
    canvas {
      width: 100%;
      height: 240px;
      max-height: 240px;
      border: 1px dashed var(--table-border);
      display: block;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <h1>Is This CI Report</h1>
    <div class="meta">Generated locally from git log data.</div>
  </header>
  ${sections}
  <script id="chartjs-bundle">${chartJsBundle}</script>
  <script id="chart-init">${chartInitScript}</script>
</body>
</html>`;
}

function renderSection(
  tableId: string,
  title: string,
  rows: Array<Record<string, string | number>>,
  tableTooltips: Record<string, string>,
  columnTooltips: Record<string, Record<string, string>>
): string {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(columnTooltips[tableId] ?? {});
  const header = columns
    .map(
      (column) =>
        `<th data-column="${column}" title="${escapeHtml(columnTooltips[tableId]?.[column] ?? "")}">${
          column
        }</th>`
    )
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<td>${escapeHtml(String(row[column] ?? ""))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const tableData = JSON.stringify(rows);

  return `
<section class="report-section" id="section-${tableId}">
  <h2>${title}</h2>
  <table data-table="${tableId}" title="${escapeHtml(tableTooltips[tableId] ?? "")}">
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <canvas data-chart-id="${tableId}" id="chart-${tableId}"></canvas>
  <script type="application/json" id="table-data-${tableId}">${safeJson(tableData)}</script>
  <script type="application/json" id="chart-data-${tableId}">${safeJson(tableData)}</script>
</section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value: string): string {
  return value.replace(/</g, "\\u003c");
}

function loadChartJsBundle(): string {
  const bundlePath = resolve(process.cwd(), "node_modules", "chart.js", "dist", "chart.umd.js");
  return readFileSync(bundlePath, "utf8");
}

function buildChartInitScript(): string {
  return `
(function () {
  if (!window.Chart) {
    return;
  }

  function readJson(id) {
    var node = document.getElementById(id);
    if (!node) return [];
    try {
      return JSON.parse(node.textContent || "[]");
    } catch (err) {
      return [];
    }
  }

  function buildChart(tableId, labelKey, valueKey, chartType, unitLabel) {
    var data = readJson("chart-data-" + tableId);
    var canvas = document.getElementById("chart-" + tableId);
    if (!canvas || data.length === 0) return;

    var labels = data.map(function (row) { return row[labelKey]; });
    var values = data.map(function (row) { return row[valueKey]; });
    var palette = ["#2f5d50", "#6b8f71", "#9aa874", "#c4c9a4", "#d7d0b7", "#bfa88e", "#9c7f6b", "#6e4c3c"];
    var colors = values.map(function (_value, idx) { return palette[idx % palette.length]; });

    new Chart(canvas.getContext("2d"), {
      type: chartType,
      data: {
        labels: labels,
        datasets: [
          {
            label: unitLabel,
            data: values,
            backgroundColor: colors,
            borderColor: "rgba(47, 93, 80, 0.9)",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "right" },
          tooltip: { callbacks: { label: function (context) { return context.label + ": " + context.raw; } } }
        }
      }
    });
  }

  buildChart("overall_buckets", "bucket", "count", "polarArea", "Commits");
  buildChart("top10_authors", "author", "commits", "polarArea", "Commits");
  buildChart("cluster_summary", "dominant_delay_bucket", "commits", "doughnut", "Commits");
  buildChart("cluster_details", "author", "commits", "polarArea", "Commits");
})();`;
}
