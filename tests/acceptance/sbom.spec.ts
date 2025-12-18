import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("sbom generation", () => {
  it("adds a CycloneDX sbom step to the build", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenProjectRoot();
    await dsl.thenBuildIncludesSbom("dist/sbom.json");
  });

  it("bumps the patch version only for local builds", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenProjectRoot();
    await dsl.thenBuildUsesLocalVersionBump();
    await dsl.thenBumpScriptSkipsGlobalInstall();
  });
});
