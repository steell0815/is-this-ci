import { describe, it } from "vitest";
import { CIReportDSL } from "../dsl/ci-report.dsl";

describe("cli installation", () => {
  it("declares a global command and wrapper script", async () => {
    const dsl = new CIReportDSL();

    await dsl.givenProjectRoot();
    await dsl.thenCliCommandDeclared("is-this-ci");
    await dsl.thenCliWrapperExists("is-this-ci");
    await dsl.thenCliWrapperTargetsDist("is-this-ci");
    await dsl.thenCliSourceUsesJsExtension();
    await dsl.thenCliPassesProjectRootEnv();
  });
});
