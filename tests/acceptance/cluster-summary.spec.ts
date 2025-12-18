import { describe, it } from "vitest";
import { CIReportDSL, type ClusterSummaryExpectation } from "../dsl/ci-report.dsl";

describe("cluster_summary", () => {
  it("aggregates clusters by dominant bucket and daily band", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenAnalyzingBranch("origin/main");

    const expected: ClusterSummaryExpectation[] = [
      {
        dominant_delay_bucket: "<1h",
        daily_integration_band: "daily>=70%",
        authors: 1,
        commits: 4
      },
      {
        dominant_delay_bucket: "1-4h",
        daily_integration_band: "daily 50-69%",
        authors: 1,
        commits: 4
      },
      {
        dominant_delay_bucket: ">8h",
        daily_integration_band: "daily<30%",
        authors: 1,
        commits: 3
      }
    ];

    await dsl.thenClusterSummaryEqual(expected);
  });
});
