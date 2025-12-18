import { describe, it } from "vitest";
import { CIReportDSL, type ClusterDetailExpectation } from "../dsl/ci-report.dsl";

describe("cluster_details", () => {
  it("computes per-author cluster details", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenAnalyzingBranch("origin/main");

    const expected: ClusterDetailExpectation[] = [
      {
        dominant_delay_bucket: "<1h",
        daily_integration_band: "daily>=70%",
        author: "Nora Fast <nora@example.com>",
        commits: 4,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 1
      },
      {
        dominant_delay_bucket: "1-4h",
        daily_integration_band: "daily 50-69%",
        author: "Omar Medium <omar@example.com>",
        commits: 4,
        daily_integration_rate_percent: 66.7,
        max_day_gap: 3
      },
      {
        dominant_delay_bucket: ">8h",
        daily_integration_band: "daily<30%",
        author: "Pia Slow <pia@example.com>",
        commits: 3,
        daily_integration_rate_percent: 0.0,
        max_day_gap: 5
      }
    ];

    await dsl.thenClusterDetailsEqual(expected);
  });
});
