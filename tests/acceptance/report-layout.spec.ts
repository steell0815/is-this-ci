import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("report layout", () => {
  it("renders navigation and page sections with glossary sidebar", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenRepoFixture("fixtures/cluster-analysis");
    await dsl.whenGeneratingReport("origin/main");

    await dsl.thenNavigationIncludes([
      "overall_buckets",
      "top10_authors",
      "cluster_summary",
      "cluster_details",
      "glossary",
      "issues"
    ]);

    await dsl.thenSectionsArePaged([
      "overall_buckets",
      "top10_authors",
      "cluster_summary",
      "cluster_details",
      "glossary",
      "issues"
    ]);

    await dsl.thenGlossarySidebarPresent();
    await dsl.thenGlossaryIconsPresentForTables([
      "overall_buckets",
      "top10_authors",
      "cluster_summary",
      "cluster_details"
    ]);
    await dsl.thenGlossaryListsColumns([
      "overall_buckets.bucket",
      "top10_authors.author",
      "cluster_summary.authors",
      "cluster_details.author"
    ]);
  });
});
