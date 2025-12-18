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

  it("embeds the tool sbom and exposes a Sunshine link", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenSbomEmbedded();
    await dsl.thenSunshineLinkPresent();
  });

  it("shows a git short revision badge in the page title", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.givenProjectRoot();
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenTitleIncludesVersionBadge();
    await dsl.thenTitleIncludesPackageVersion();
  });
});
