import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("report output", () => {
  it("emits a single static HTML page without external assets", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenSinglePageReport();
    await dsl.thenNoExternalAssets();
  });
});
