import { describe, it } from "vitest";
import { CIReportDSL, type TopAuthorExpectation } from "../dsl/ci-report.dsl";

describe("top10_authors", () => {
  it("computes top10 authors with CI and daily integration metrics", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/top10-authors");
    await dsl.whenAnalyzingBranch("origin/main");

    const expected: TopAuthorExpectation[] = [
      {
        author: "Alice One <alice1@example.com>",
        commits: 4,
        ci_within_8h_percent: 50.0,
        daily_integration_rate_percent: 66.7,
        max_day_gap: 2
      },
      {
        author: "Bob Two <bob2@example.com>",
        commits: 3,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 1
      },
      {
        author: "Cara Three <cara3@example.com>",
        commits: 3,
        ci_within_8h_percent: 0.0,
        daily_integration_rate_percent: 0.0,
        max_day_gap: 5
      },
      {
        author: "Drew Four <drew4@example.com>",
        commits: 2,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 1
      },
      {
        author: "Evan Five <evan5@example.com>",
        commits: 2,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 0.0,
        max_day_gap: 4
      },
      {
        author: "Fay Six <fay6@example.com>",
        commits: 2,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 1
      },
      {
        author: "Gus Seven <gus7@example.com>",
        commits: 1,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 0
      },
      {
        author: "Hana Eight <hana8@example.com>",
        commits: 1,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 0
      },
      {
        author: "Ivy Nine <ivy9@example.com>",
        commits: 1,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 0
      },
      {
        author: "Jay Ten <jay10@example.com>",
        commits: 1,
        ci_within_8h_percent: 100.0,
        daily_integration_rate_percent: 100.0,
        max_day_gap: 0
      }
    ];

    await dsl.thenTopAuthorsEqual(expected);
  });
});
