import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("git log fallback", () => {
  it("keeps analysis results and reports issues when git log exceeds max buffer", async () => {
    const dsl = new CIReportDSL();
    await dsl.givenRepoFixture("fixtures/basic-overall-buckets");
    await dsl.givenGitLogMaxBuffer(10);
    await dsl.givenGitLogOutput([
      "hash1|Alice Example|alice@example.com|2024-01-01 10:00:00 +0000|2024-01-01 10:30:00 +0000",
      "hash2|Bob Example|bob@example.com|2024-01-01 09:00:00 +0000|2024-01-01 13:00:00 +0000",
      "hash3|Alice Example|alice@example.com|2024-01-01 08:00:00 +0000|2024-01-02 10:00:00 +0000"
    ]);

    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenReportTableDataEquals("overall_buckets", [
      { bucket: "<1h", count: 1, percent: 33.3 },
      { bucket: "1-4h", count: 0, percent: 0 },
      { bucket: "4-8h", count: 1, percent: 33.3 },
      { bucket: ">8h", count: 1, percent: 33.3 }
    ]);
    await dsl.thenIssuesInclude("git log failed");
  });
});
