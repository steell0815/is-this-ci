import { readFileSync } from "node:fs";
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

  async givenProjectRoot(): Promise<void> {
    this.session.setProjectRoot(process.cwd());
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

  async thenChartDataIsRawJson(tableId: string): Promise<void> {
    const raw = this.readEmbeddedRaw(tableId, "chart-data");
    if (raw.includes("&quot;") || raw.includes("&lt;") || raw.includes("&gt;")) {
      throw new Error(`Chart data for ${tableId} is HTML-escaped instead of raw JSON.`);
    }
  }

  async thenEmbeddedChartJsPresent(): Promise<void> {
    const html = this.reportHtml();
    const regex = new RegExp('<script[^>]*id=\"chartjs-bundle\"[^>]*>([\\s\\S]*?)</script>', "i");
    const match = html.match(regex);
    if (!match || match[1].trim().length === 0) {
      throw new Error("Embedded Chart.js bundle is missing.");
    }
  }

  async thenChartInitScriptPresent(): Promise<void> {
    const html = this.reportHtml();
    const regex = new RegExp('<script[^>]*id=\"chart-init\"[^>]*>([\\s\\S]*?)</script>', "i");
    const match = html.match(regex);
    if (!match || match[1].trim().length === 0) {
      throw new Error("Chart initialization script is missing.");
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
    const externalRef = /(src|href)=["']https?:\/\//i;
    const cssRef = /url\(["']?https?:\/\//i;
    if (externalRef.test(html) || cssRef.test(html)) {
      throw new Error("Report references external assets.");
    }
  }

  async thenCliCommandDeclared(_commandName: string): Promise<void> {
    const pkg = this.session.readPackageJson();
    const bin = pkg.bin;

    if (!bin || typeof bin !== "object") {
      throw new Error("package.json is missing a bin entry.");
    }

    const path = (bin as Record<string, string>)[_commandName];
    if (!path) {
      throw new Error(`package.json bin does not declare ${_commandName}.`);
    }
  }

  async thenCliWrapperExists(_commandName: string): Promise<void> {
    const pkg = this.session.readPackageJson();
    const bin = pkg.bin as Record<string, string>;
    const path = bin?.[_commandName];
    if (!path) {
      throw new Error(`package.json bin does not declare ${_commandName}.`);
    }
    const fullPath = this.session.resolveProjectPath(path);
    try {
      const contents = readFileSync(fullPath, "utf8");
      if (!contents.startsWith("#!")) {
        throw new Error(`CLI wrapper ${path} is missing a shebang.`);
      }
    } catch (error) {
      throw new Error(`CLI wrapper ${path} does not exist.`);
    }
  }

  async thenCliWrapperTargetsDist(_commandName: string): Promise<void> {
    const pkg = this.session.readPackageJson();
    const bin = pkg.bin as Record<string, string>;
    const path = bin?.[_commandName];
    if (!path) {
      throw new Error(`package.json bin does not declare ${_commandName}.`);
    }
    const fullPath = this.session.resolveProjectPath(path);
    const contents = readFileSync(fullPath, "utf8");
    if (!contents.includes("dist/cli.js")) {
      throw new Error(`CLI wrapper ${path} does not target dist/cli.js.`);
    }
  }

  async thenCliSourceUsesJsExtension(): Promise<void> {
    const source = this.session.readProjectFile("src/cli.ts");
    if (!source.includes('from "./report-generator.js"')) {
      throw new Error("src/cli.ts should import ./report-generator.js for Node ESM compatibility.");
    }
  }

  async thenCliPassesProjectRootEnv(): Promise<void> {
    const wrapper = this.session.readProjectFile("bin/is-this-ci.js");
    if (!wrapper.includes("IS_THIS_CI_ROOT")) {
      throw new Error("CLI wrapper should pass IS_THIS_CI_ROOT for asset resolution.");
    }
  }

  async thenCliWrapperNotGitignored(): Promise<void> {
    const gitignore = this.session.readProjectFile(".gitignore");
    if (gitignore.split("\n").some((line) => line.trim() === "/bin")) {
      throw new Error("bin/ is gitignored, so the CLI wrapper will not be included.");
    }
  }

  async thenBuildIncludesSbom(_outputPath: string): Promise<void> {
    const pkg = this.session.readPackageJson();
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (!scripts?.build) {
      throw new Error("package.json is missing a build script.");
    }
    if (!scripts.build.includes("sbom") && !scripts.build.includes("cyclonedx")) {
      throw new Error("build script does not include an sbom step.");
    }
    const sbomScript = scripts.sbom ?? "";
    if (!sbomScript || !sbomScript.includes(_outputPath)) {
      throw new Error(`sbom script should write to ${_outputPath}.`);
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
    const raw = this.readEmbeddedRaw(tableId, prefix);
    const jsonText = this.unescapeHtml(raw.trim());
    return JSON.parse(jsonText);
  }

  private readEmbeddedRaw(tableId: string, prefix: string): string {
    const html = this.reportHtml();
    const regex = new RegExp(`<script[^>]*id=\\\"${prefix}-${tableId}\\\"[^>]*>([\\s\\S]*?)<\\/script>`, "i");
    const match = regex.exec(html);
    if (!match) {
      throw new Error(`Missing ${prefix} for ${tableId}.`);
    }
    return match[1];
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
