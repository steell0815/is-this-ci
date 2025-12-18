import { ReportSession } from "../driver/report-session";

export type OverallBucketExpectation = {
  bucket: "<1h" | "1-4h" | "4-8h" | ">8h";
  count: number;
  percent: number;
};

export type TopAuthorExpectation = {
  author: string;
  commits: number;
  ci_within_8h_percent: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
};

export type ClusterDetailExpectation = {
  dominant_delay_bucket: "<1h" | "1-4h" | "4-8h" | ">8h";
  daily_integration_band: string;
  author: string;
  commits: number;
  daily_integration_rate_percent: number;
  max_day_gap: number;
};

export type ClusterSummaryExpectation = {
  dominant_delay_bucket: "<1h" | "1-4h" | "4-8h" | ">8h";
  daily_integration_band: string;
  authors: number;
  commits: number;
};

export class CIReportDSL {
  private session = new ReportSession();
  private analysisBranch: string | null = null;
  private reportHtmlCache: string | null = null;

  async givenRepoFixture(fixtureName: string): Promise<void> {
    this.session.createFixtureRepo(fixtureName);
  }

  async whenAnalyzingBranch(analysisBranch: string): Promise<void> {
    this.analysisBranch = analysisBranch;
  }

  async whenGeneratingReport(analysisBranch: string): Promise<void> {
    this.analysisBranch = analysisBranch;
    this.session.generateReport(analysisBranch);
    this.reportHtmlCache = null;
  }

  async thenOverallBucketsEqual(expected: OverallBucketExpectation[]): Promise<void> {
    if (!this.analysisBranch) {
      throw new Error("Analysis branch not set. Call whenAnalyzingBranch first.");
    }

    const actual = this.session.readOverallBuckets(this.analysisBranch);
    const normalized = actual.map((row) => ({ ...row, percent: this.round(row.percent) }));

    this.assertBuckets(normalized, expected);
    this.session.dispose();
  }

  async thenTopAuthorsEqual(expected: TopAuthorExpectation[]): Promise<void> {
    if (!this.analysisBranch) {
      throw new Error("Analysis branch not set. Call whenAnalyzingBranch first.");
    }

    const actual = this.session.readTopAuthors(this.analysisBranch);
    const normalized = actual.map((row) => ({
      ...row,
      ci_within_8h_percent: this.round(row.ci_within_8h_percent),
      daily_integration_rate_percent: this.round(row.daily_integration_rate_percent)
    }));

    this.assertTopAuthors(normalized, expected);
    this.session.dispose();
  }

  async thenClusterDetailsEqual(expected: ClusterDetailExpectation[]): Promise<void> {
    if (!this.analysisBranch) {
      throw new Error("Analysis branch not set. Call whenAnalyzingBranch first.");
    }

    const actual = this.session.readClusterDetails(this.analysisBranch);
    const normalized = actual.map((row) => ({
      ...row,
      daily_integration_rate_percent: this.round(row.daily_integration_rate_percent)
    }));

    this.assertClusterDetails(normalized, expected);
    this.session.dispose();
  }

  async thenClusterSummaryEqual(expected: ClusterSummaryExpectation[]): Promise<void> {
    if (!this.analysisBranch) {
      throw new Error("Analysis branch not set. Call whenAnalyzingBranch first.");
    }

    const actual = this.session.readClusterSummary(this.analysisBranch);
    this.assertClusterSummary(actual, expected);
    this.session.dispose();
  }

  async thenTableTooltipMatches(tableId: string, expectedTooltip: string): Promise<void> {
    const tooltip = this.extractTableTooltip(tableId);
    if (tooltip !== expectedTooltip) {
      throw new Error(`Table ${tableId} tooltip mismatch. Expected \"${expectedTooltip}\", got \"${tooltip}\".`);
    }
  }

  async thenColumnTooltipMatches(tableId: string, columnId: string, expectedTooltip: string): Promise<void> {
    const tooltip = this.extractColumnTooltip(tableId, columnId);
    if (tooltip !== expectedTooltip) {
      throw new Error(
        `Column ${tableId}.${columnId} tooltip mismatch. Expected \"${expectedTooltip}\", got \"${tooltip}\".`
      );
    }
  }

  async thenChartExistsFor(tableId: string): Promise<void> {
    const html = this.reportHtml();
    const regex = new RegExp(`<canvas[^>]*data-chart-id=\\\"${tableId}\\\"`, "i");
    if (!regex.test(html)) {
      throw new Error(`Missing chart for ${tableId}.`);
    }
  }

  async thenChartDataMatchesTable(tableId: string): Promise<void> {
    const tableData = this.readEmbeddedJson(tableId, "table-data");
    const chartData = this.readEmbeddedJson(tableId, "chart-data");
    if (JSON.stringify(tableData) !== JSON.stringify(chartData)) {
      throw new Error(`Chart data does not match table data for ${tableId}.`);
    }
  }

  async thenSinglePageReport(): Promise<void> {
    const html = this.reportHtml();
    const htmlTagCount = (html.match(/<html/gi) ?? []).length;
    if (htmlTagCount !== 1) {
      throw new Error(`Expected a single HTML document, found ${htmlTagCount} <html> tags.`);
    }
  }

  async thenNoExternalAssets(): Promise<void> {
    const html = this.reportHtml();
    if (/(https?:)?\/\//i.test(html)) {
      throw new Error("Report references external assets.");
    }
  }

  private assertBuckets(actual: OverallBucketExpectation[], expected: OverallBucketExpectation[]): void {
    const byBucket = (rows: OverallBucketExpectation[]) =>
      rows.reduce<Record<string, OverallBucketExpectation>>((acc, row) => {
        acc[row.bucket] = row;
        return acc;
      }, {});

    const actualMap = byBucket(actual);
    const expectedMap = byBucket(expected);

    for (const bucket of Object.keys(expectedMap)) {
      const actualRow = actualMap[bucket];
      const expectedRow = expectedMap[bucket];

      if (!actualRow) {
        throw new Error(`Missing bucket ${bucket} in actual results.`);
      }
      if (actualRow.count !== expectedRow.count || actualRow.percent !== expectedRow.percent) {
        throw new Error(
          `Bucket ${bucket} mismatch. Expected count=${expectedRow.count}, percent=${expectedRow.percent}; ` +
            `got count=${actualRow.count}, percent=${actualRow.percent}.`
        );
      }
    }
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private assertTopAuthors(actual: TopAuthorExpectation[], expected: TopAuthorExpectation[]): void {
    if (actual.length !== expected.length) {
      throw new Error(`Expected ${expected.length} authors, got ${actual.length}.`);
    }

    expected.forEach((expectedRow, index) => {
      const actualRow = actual[index];
      if (!actualRow) {
        throw new Error(`Missing author at index ${index}.`);
      }
      const mismatch =
        actualRow.author !== expectedRow.author ||
        actualRow.commits !== expectedRow.commits ||
        actualRow.ci_within_8h_percent !== expectedRow.ci_within_8h_percent ||
        actualRow.daily_integration_rate_percent !== expectedRow.daily_integration_rate_percent ||
        actualRow.max_day_gap !== expectedRow.max_day_gap;

      if (mismatch) {
        throw new Error(
          `Author mismatch at index ${index}. Expected ${JSON.stringify(expectedRow)}; ` +
            `got ${JSON.stringify(actualRow)}.`
        );
      }
    });
  }

  private assertClusterDetails(actual: ClusterDetailExpectation[], expected: ClusterDetailExpectation[]): void {
    if (actual.length !== expected.length) {
      throw new Error(`Expected ${expected.length} authors, got ${actual.length}.`);
    }

    expected.forEach((expectedRow, index) => {
      const actualRow = actual[index];
      if (!actualRow) {
        throw new Error(`Missing cluster detail at index ${index}.`);
      }
      const mismatch =
        actualRow.author !== expectedRow.author ||
        actualRow.commits !== expectedRow.commits ||
        actualRow.dominant_delay_bucket !== expectedRow.dominant_delay_bucket ||
        actualRow.daily_integration_band !== expectedRow.daily_integration_band ||
        actualRow.daily_integration_rate_percent !== expectedRow.daily_integration_rate_percent ||
        actualRow.max_day_gap !== expectedRow.max_day_gap;

      if (mismatch) {
        throw new Error(
          `Cluster detail mismatch at index ${index}. Expected ${JSON.stringify(expectedRow)}; ` +
            `got ${JSON.stringify(actualRow)}.`
        );
      }
    });
  }

  private assertClusterSummary(actual: ClusterSummaryExpectation[], expected: ClusterSummaryExpectation[]): void {
    if (actual.length !== expected.length) {
      throw new Error(`Expected ${expected.length} clusters, got ${actual.length}.`);
    }

    expected.forEach((expectedRow, index) => {
      const actualRow = actual[index];
      if (!actualRow) {
        throw new Error(`Missing cluster summary at index ${index}.`);
      }
      const mismatch =
        actualRow.dominant_delay_bucket !== expectedRow.dominant_delay_bucket ||
        actualRow.daily_integration_band !== expectedRow.daily_integration_band ||
        actualRow.authors !== expectedRow.authors ||
        actualRow.commits !== expectedRow.commits;

      if (mismatch) {
        throw new Error(
          `Cluster summary mismatch at index ${index}. Expected ${JSON.stringify(expectedRow)}; ` +
            `got ${JSON.stringify(actualRow)}.`
        );
      }
    });
  }

  private reportHtml(): string {
    if (!this.reportHtmlCache) {
      this.reportHtmlCache = this.session.readReportHtml();
    }
    return this.reportHtmlCache;
  }

  private extractTableTooltip(tableId: string): string {
    const html = this.reportHtml();
    const regex = new RegExp(`<table[^>]*data-table=\\\"${tableId}\\\"[^>]*title=\\\"([^\\\"]*)\\\"`, "i");
    const match = regex.exec(html);
    if (!match) {
      throw new Error(`Table ${tableId} not found in report.`);
    }
    return this.unescapeHtml(match[1]);
  }

  private extractColumnTooltip(tableId: string, columnId: string): string {
    const html = this.reportHtml();
    const tableRegex = new RegExp(`<table[^>]*data-table=\\\"${tableId}\\\"[\\s\\S]*?<\\/table>`, "i");
    const tableMatch = tableRegex.exec(html);
    if (!tableMatch) {
      throw new Error(`Table ${tableId} not found in report.`);
    }
    const tableHtml = tableMatch[0];
    const columnRegex = new RegExp(`<th[^>]*data-column=\\\"${columnId}\\\"[^>]*title=\\\"([^\\\"]*)\\\"`, "i");
    const columnMatch = columnRegex.exec(tableHtml);
    if (!columnMatch) {
      throw new Error(`Column ${columnId} not found in table ${tableId}.`);
    }
    return this.unescapeHtml(columnMatch[1]);
  }

  private readEmbeddedJson(tableId: string, prefix: string): unknown {
    const html = this.reportHtml();
    const regex = new RegExp(`<script[^>]*id=\\\"${prefix}-${tableId}\\\"[^>]*>([\\s\\S]*?)<\\/script>`, "i");
    const match = regex.exec(html);
    if (!match) {
      throw new Error(`Missing ${prefix} for ${tableId}.`);
    }
    const jsonText = this.unescapeHtml(match[1].trim());
    return JSON.parse(jsonText);
  }

  private unescapeHtml(value: string): string {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
}
