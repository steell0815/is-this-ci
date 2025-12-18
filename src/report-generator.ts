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

  const repoName = readRepoName(options.repoDir);
  const generatedAt = formatLocalTimestamp(new Date());
  const sbomJson = readSbomJson();
  const html = renderReportHtml(data, { repoName, branch: options.branch, generatedAt, sbomJson });
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

function readRepoName(repoDir: string): string {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: repoDir })
      .toString("utf8")
      .trim();
    if (!output) {
      return repoDir;
    }
    const parts = output.split("/");
    return parts[parts.length - 1] || repoDir;
  } catch {
    return repoDir;
  }
}

function formatLocalTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const hours = String(hours12).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}${ampm}`;
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

function readSbomJson(): string {
  try {
    const root = process.env.IS_THIS_CI_ROOT ?? process.cwd();
    const sbomPath = resolve(root, "dist", "sbom.json");
    return readFileSync(sbomPath, "utf8");
  } catch {
    return "{}";
  }
}

function renderReportHtml(
  data: ReportData,
  context: { repoName: string; branch: string; generatedAt: string; sbomJson: string }
): string {
  const glossary = {
    tables: {
      overall_buckets: {
        title: "Overall buckets",
        what: "Delay category between author date and committer date",
        how: "Predefined bins: `<1h`, `1-4h`, `4-8h`, `>8h` based on (committer date − author date) per commit"
      },
      top10_authors: {
        title: "Top 10 authors",
        what: "Top authors by commit volume and CI behavior",
        how: "Authors are ranked by commit count, then CI and daily integration metrics are computed"
      },
      cluster_summary: {
        title: "Cluster summary",
        what: "Cluster rollups by delay and daily integration",
        how: "Authors grouped by dominant delay bucket and daily integration band"
      },
      cluster_details: {
        title: "Cluster details",
        what: "Per-author cluster metrics and assignment",
        how: "Each author is labeled by dominant delay bucket and daily integration band"
      }
    },
    columns: {
      overall_buckets: {
        bucket: {
          what: "Delay category between author date and committer date",
          how: "Predefined bins: `<1h`, `1-4h`, `4-8h`, `>8h` based on (committer date − author date) per commit"
        },
        count: {
          what: "Number of commits in this delay bucket",
          how: "Count of commits whose delay falls into the bucket"
        },
        percent: {
          what: "Share of commits in this bucket",
          how: "count / total_commits * 100, rounded to one decimal"
        }
      },
      top10_authors: {
        author: {
          what: "Author identity in git log",
          how: "Taken from `%an <%ae>` in `git log origin/master`"
        },
        commits: {
          what: "Total commits by that author",
          how: "Count of commits with matching author identity"
        },
        ci_within_8h_percent: {
          what: "% of that author’s commits integrated within 8 hours",
          how: "(commits with delay < 8h) / commits * 100"
        },
        daily_integration_rate_percent: {
          what: "% of consecutive active-day gaps that are <= 1 day",
          how:
            "Build sorted unique commit dates per author (committer date), compute day gaps, then `gaps<=1 / total_gaps * 100`"
        },
        max_day_gap: {
          what: "Longest gap (in days) between consecutive active days",
          how: "Max of the day-gap series per author"
        }
      },
      cluster_summary: {
        dominant_delay_bucket: {
          what: "Most common delay bucket for authors in the cluster",
          how: "For each author, pick the delay bucket with the highest commit count; used to label cluster"
        },
        daily_integration_band: {
          what: "Daily integration rate band for the cluster",
          how:
            "Predefined bands on per-author daily integration rate: `daily>=70%`, `daily 50-69%`, `daily 30-49%`, `daily<30%`"
        },
        authors: {
          what: "Number of authors in the cluster",
          how: "Count of authors whose dominant bucket and daily band match the cluster"
        },
        commits: {
          what: "Total commits contributed by authors in the cluster",
          how: "Sum of commit counts for authors in the cluster"
        }
      },
      cluster_details: {
        dominant_delay_bucket: {
          what: "Dominant delay bucket for the author",
          how: "Most frequent delay bucket in that author's commits"
        },
        daily_integration_band: {
          what: "Daily integration band for the author",
          how: "Band based on that author's daily integration rate"
        },
        author: {
          what: "Author identity in git log",
          how: "Taken from `%an <%ae>` in `git log origin/master`"
        },
        commits: {
          what: "Total commits by that author",
          how: "Count of commits with matching author identity"
        },
        daily_integration_rate_percent: {
          what: "Daily integration rate for the author",
          how: "See \"daily_integration_rate_percent\" in top10 table; same calculation"
        },
        max_day_gap: {
          what: "Longest gap between consecutive active days for the author",
          how: "Max gap in days between consecutive commit dates (committer date) for that author"
        }
      }
    }
  };

  const tableTooltips: Record<string, string> = {
    overall_buckets: "Delay buckets across all commits",
    top10_authors: "Top authors by commit volume",
    cluster_summary: "Cluster rollups by delay and daily integration",
    cluster_details: "Per-author cluster metrics and assignment"
  };

  const sections = [
    renderSection("overall_buckets", "Overall Buckets", data.overall_buckets, glossary, tableTooltips),
    renderSection("top10_authors", "Top 10 Authors", data.top10_authors, glossary, tableTooltips),
    renderSection("cluster_summary", "Cluster Summary", data.cluster_summary, glossary, tableTooltips),
    renderSection("cluster_details", "Cluster Details", data.cluster_details, glossary, tableTooltips),
    renderGlossarySection(glossary)
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
      border-bottom: 1px solid var(--table-border);
      position: sticky;
      top: 0;
      background: var(--bg);
      z-index: 10;
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
    nav.report-nav {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 24px 20px;
      background: var(--bg);
      position: sticky;
      top: 92px;
      z-index: 9;
      border-bottom: 1px solid var(--table-border);
    }
    nav.report-nav a {
      text-decoration: none;
      color: var(--accent);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.02em;
      padding: 6px 10px;
      border: 1px solid var(--table-border);
      border-radius: 999px;
      background: #fff;
    }
    .page {
      display: none;
    }
    .page.is-active {
      display: block;
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
      height: 360px;
      max-height: 360px;
      border: 1px dashed var(--table-border);
      display: block;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
    }
    .glossary-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-left: 6px;
      border-radius: 999px;
      border: 1px solid var(--table-border);
      color: var(--accent);
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      background: #fff;
    }
    .sunshine-link {
      margin-left: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--table-border);
      background: #fff;
      color: var(--accent);
      font-weight: 600;
      cursor: pointer;
    }
    .sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: min(360px, 90vw);
      height: 100vh;
      background: #fff;
      border-left: 1px solid var(--table-border);
      padding: 24px;
      transform: translateX(100%);
      transition: transform 0.25s ease;
      z-index: 20;
      box-shadow: -12px 0 30px rgba(0, 0, 0, 0.08);
    }
    .sidebar.is-open {
      transform: translateX(0);
    }
    .sidebar h3 {
      margin-top: 0;
    }
    .sidebar .close {
      background: none;
      border: none;
      font-size: 20px;
      position: absolute;
      right: 16px;
      top: 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <header>
    <h1>Is This CI Report</h1>
    <div class="meta">Repository: ${escapeHtml(context.repoName)} · Branch: ${escapeHtml(context.branch)}</div>
    <div class="meta">Generated locally from git log data at ${escapeHtml(context.generatedAt)}.</div>
    <div class="meta">
      SBOM: dist/sbom.json
      <button
        class="sunshine-link"
        type="button"
        data-sunshine-url="https://cyclonedx.github.io/Sunshine"
        data-sbom-path="dist/sbom.json"
      >
        Open in Sunshine
      </button>
      <button class="sunshine-link" type="button" data-sbom-download="true">
        Download SBOM
      </button>
    </div>
  </header>
  <nav class="report-nav" data-nav="report">
    <a href="#overall_buckets">Overall buckets</a>
    <a href="#top10_authors">Top 10 authors</a>
    <a href="#cluster_summary">Cluster summary</a>
    <a href="#cluster_details">Cluster details</a>
    <a href="#glossary">Glossary</a>
  </nav>
  ${sections}
  <aside class="sidebar" id="glossary-sidebar" aria-hidden="true">
    <button class="close" type="button" aria-label="Close">&times;</button>
    <h3 id="glossary-title"></h3>
    <p><strong>What it represents</strong></p>
    <p id="glossary-what"></p>
    <p><strong>How it is analyzed</strong></p>
    <p id="glossary-how"></p>
  </aside>
  <script type="application/json" id="sbom-json">${safeJson(context.sbomJson)}</script>
  <script id="chartjs-bundle">${chartJsBundle}</script>
  <script id="chart-init">${chartInitScript}</script>
</body>
</html>`;
}

function renderSection(
  tableId: string,
  title: string,
  rows: Array<Record<string, string | number>>,
  glossary: {
    tables: Record<string, { title: string; what: string; how: string }>;
    columns: Record<string, Record<string, { what: string; how: string }>>;
  },
  tableTooltips: Record<string, string>
): string {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(glossary.columns[tableId] ?? {});
  const header = columns
    .map(
      (column) =>
        `<th data-column="${column}" title="${escapeHtml(glossary.columns[tableId]?.[column]?.how ?? "")}">${
          column
        }${renderGlossaryIcon({
          tableId,
          columnId: column,
          title: `${title} - ${column}`,
          what: glossary.columns[tableId]?.[column]?.what ?? "",
          how: glossary.columns[tableId]?.[column]?.how ?? ""
        })}</th>`
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

  const tableGlossary = glossary.tables[tableId];
  return `
<section class="report-section page" id="section-${tableId}">
  <a id="${tableId}" class="page-anchor"></a>
  <h2>${title}${renderGlossaryIcon({
    tableId,
    title,
    what: tableGlossary?.what ?? "",
    how: tableGlossary?.how ?? ""
  })}</h2>
  <table data-table="${tableId}" title="${escapeHtml(tableTooltips[tableId] ?? "")}">
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <canvas data-chart-id="${tableId}" id="chart-${tableId}"></canvas>
  <script type="application/json" id="table-data-${tableId}">${safeJson(tableData)}</script>
  <script type="application/json" id="chart-data-${tableId}">${safeJson(tableData)}</script>
</section>`;
}

function renderGlossarySection(glossary: {
  tables: Record<string, { title: string; what: string; how: string }>;
  columns: Record<string, Record<string, { what: string; how: string }>>;
}): string {
  const tableEntries = Object.entries(glossary.tables)
    .map(([, entry]) => {
      return `<tr><td>${escapeHtml(entry.title)}</td><td>${escapeHtml(entry.what)}</td><td>${escapeHtml(
        entry.how
      )}</td></tr>`;
    })
    .join("");

  const columnEntries = Object.entries(glossary.columns)
    .flatMap(([tableKey, columns]) =>
      Object.entries(columns).map(([columnKey, entry]) => {
        const label = `${tableKey}.${columnKey}`;
        return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(entry.what)}</td><td>${escapeHtml(
          entry.how
        )}</td></tr>`;
      })
    )
    .join("");

  return `
<section class="report-section page" id="section-glossary">
  <a id="glossary" class="page-anchor"></a>
  <h2>Glossary</h2>
  <table data-table="glossary">
    <thead><tr><th>Topic</th><th>What it represents</th><th>How it is analyzed</th></tr></thead>
    <tbody>${tableEntries}${columnEntries}</tbody>
  </table>
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

function renderGlossaryIcon(input: {
  tableId: string;
  columnId?: string;
  title: string;
  what: string;
  how: string;
}): string {
  const attrs = [
    `data-glossary-table=\"${input.tableId}\"`,
    input.columnId ? `data-glossary-column=\"${input.columnId}\"` : "",
    `data-glossary-title=\"${escapeHtml(input.title)}\"`,
    `data-glossary-what=\"${escapeHtml(input.what)}\"`,
    `data-glossary-how=\"${escapeHtml(input.how)}\"`
  ]
    .filter(Boolean)
    .join(" ");

  return `<button class="glossary-trigger" type="button" ${attrs} aria-label="Glossary info">i</button>`;
}

function loadChartJsBundle(): string {
  const root = process.env.IS_THIS_CI_ROOT ?? process.cwd();
  const bundlePath = resolve(root, "node_modules", "chart.js", "dist", "chart.umd.js");
  return readFileSync(bundlePath, "utf8");
}

function buildChartInitScript(): string {
  return `
(function () {
  if (!window.Chart) {
    return;
  }

  var pages = document.querySelectorAll(".page");
  function showPage(id) {
    pages.forEach(function (page) {
      page.classList.remove("is-active");
    });
    var target = document.getElementById("section-" + id);
    if (target) {
      target.classList.add("is-active");
    }
  }
  var defaultPage = "overall_buckets";
  if (location.hash) {
    showPage(location.hash.replace("#", ""));
  } else {
    showPage(defaultPage);
  }
  window.addEventListener("hashchange", function () {
    showPage(location.hash.replace("#", ""));
  });

  var sidebar = document.getElementById("glossary-sidebar");
  var titleNode = document.getElementById("glossary-title");
  var whatNode = document.getElementById("glossary-what");
  var howNode = document.getElementById("glossary-how");
  document.querySelectorAll(".glossary-trigger").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!sidebar) return;
      titleNode.textContent = button.getAttribute("data-glossary-title") || "Glossary";
      whatNode.textContent = button.getAttribute("data-glossary-what") || "";
      howNode.textContent = button.getAttribute("data-glossary-how") || "";
      sidebar.classList.add("is-open");
      sidebar.setAttribute("aria-hidden", "false");
    });
  });
  if (sidebar) {
    var closeBtn = sidebar.querySelector(".close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        sidebar.classList.remove("is-open");
        sidebar.setAttribute("aria-hidden", "true");
      });
    }
  }

  document.querySelectorAll(".sunshine-link").forEach(function (button) {
    button.addEventListener("click", function () {
      var url = button.getAttribute("data-sunshine-url");
      var sbom = button.getAttribute("data-sbom-path");
      if (url) {
        window.open(url, "_blank");
        alert("Upload " + sbom + " in Sunshine to analyze vulnerabilities.");
      }
    });
  });

  document.querySelectorAll("[data-sbom-download]").forEach(function (button) {
    button.addEventListener("click", function () {
      var sbomNode = document.getElementById("sbom-json");
      if (!sbomNode) return;
      var payload = sbomNode.textContent || "{}";
      var blob = new Blob([payload], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "sbom.json";
      link.click();
      URL.revokeObjectURL(url);
    });
  });

  function readJson(id) {
    var node = document.getElementById(id);
    if (!node) return [];
    try {
      return JSON.parse(node.textContent || "[]");
    } catch (err) {
      return [];
    }
  }

  var zOrderPlugin = {
    id: "zOrderByValue",
    beforeDatasetDraw: function (chart, args) {
      if (args.index !== 0) return;
      var meta = chart.getDatasetMeta(args.index);
      if (!meta || !meta.data) return;
      var ctx = chart.ctx;
      var items = meta.data.slice().sort(function (a, b) {
        var aVal = a.$context && typeof a.$context.raw === "number" ? a.$context.raw : 0;
        var bVal = b.$context && typeof b.$context.raw === "number" ? b.$context.raw : 0;
        return bVal - aVal;
      });
      items.forEach(function (item) {
        item.draw(ctx);
      });
      return false;
    }
  };

  function buildChart(tableId, labelKey, valueKey, chartType, unitLabel) {
    var data = readJson("chart-data-" + tableId);
    var canvas = document.getElementById("chart-" + tableId);
    if (!canvas || data.length === 0) return;

    var pairs = data.map(function (row) {
      return { label: row[labelKey], value: row[valueKey] };
    });
    pairs.sort(function (a, b) { return b.value - a.value; });

    var labels = pairs.map(function (row) { return row.label; });
    var values = pairs.map(function (row) { return row.value; });
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
        interaction: {
          mode: "nearest",
          intersect: false
        },
        plugins: {
          legend: { display: true, position: "right" },
          tooltip: { callbacks: { label: function (context) { return context.label + ": " + context.raw; } } }
        },
        elements: {
          arc: {
            hoverOffset: 10
          }
        }
      },
      plugins: [zOrderPlugin]
    });
  }

  buildChart("overall_buckets", "bucket", "count", "polarArea", "Commits");
  buildChart("top10_authors", "author", "commits", "polarArea", "Commits");
  buildChart("cluster_summary", "dominant_delay_bucket", "commits", "doughnut", "Commits");
  buildChart("cluster_details", "author", "commits", "polarArea", "Commits");
})();`;
}
