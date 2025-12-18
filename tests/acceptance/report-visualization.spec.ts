import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("report visualization", () => {
  it("renders charts for each report and aligns chart data with table data", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenChartExistsFor("overall_buckets");
    await dsl.thenChartExistsFor("top10_authors");
    await dsl.thenChartExistsFor("cluster_summary");
    await dsl.thenChartExistsFor("cluster_details");

    await dsl.thenChartDataMatchesTable("overall_buckets");
    await dsl.thenChartDataMatchesTable("top10_authors");
    await dsl.thenChartDataMatchesTable("cluster_summary");
    await dsl.thenChartDataMatchesTable("cluster_details");
    await dsl.thenChartDataIsRawJson("overall_buckets");

    await dsl.thenEmbeddedChartJsPresent();
    await dsl.thenChartInitScriptPresent();
    await dsl.thenChartsLayerSmallValuesOnTop();
    await dsl.thenChartsUseNearestHover();
  });
});
