import { describe, it } from "vitest";
import { CIReportDSL, type OverallBucketExpectation } from "../dsl/ci-report.dsl";

describe("overall_buckets", () => {
  it("computes overall delay buckets from git log", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/basic-overall-buckets");
    await dsl.whenAnalyzingBranch("origin/main");

    const expected: OverallBucketExpectation[] = [
      { bucket: "<1h", count: 2, percent: 25.0 },
      { bucket: "1-4h", count: 2, percent: 25.0 },
      { bucket: "4-8h", count: 2, percent: 25.0 },
      { bucket: ">8h", count: 2, percent: 25.0 }
    ];

    await dsl.thenOverallBucketsEqual(expected);
  });
});
