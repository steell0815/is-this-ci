import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("report glossary tooltips", () => {
  it("exposes table and column tooltips from the glossary", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenTableTooltipMatches("overall_buckets", "Delay buckets across all commits");
    await dsl.thenTableTooltipMatches("top10_authors", "Top authors by commit volume");
    await dsl.thenTableTooltipMatches("cluster_summary", "Cluster rollups by delay and daily integration");
    await dsl.thenTableTooltipMatches("cluster_details", "Per-author cluster metrics and assignment");

    await dsl.thenColumnTooltipMatches(
      "overall_buckets",
      "bucket",
      "Predefined bins: `<1h`, `1-4h`, `4-8h`, `>8h` based on (committer date − author date) per commit"
    );
    await dsl.thenColumnTooltipMatches(
      "top10_authors",
      "ci_within_8h_percent",
      "(commits with delay < 8h) / commits * 100"
    );
    await dsl.thenColumnTooltipMatches(
      "cluster_summary",
      "daily_integration_band",
      "Predefined bands on per-author daily integration rate: `daily>=70%`, `daily 50-69%`, `daily 30-49%`, `daily<30%`"
    );
    await dsl.thenColumnTooltipMatches(
      "cluster_details",
      "max_day_gap",
      "Max gap in days between consecutive commit dates (committer date) for that author"
    );
  });
});
