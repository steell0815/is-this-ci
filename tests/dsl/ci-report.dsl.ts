export type OverallBucketExpectation = {
  bucket: "<1h" | "1-4h" | "4-8h" | ">8h";
  count: number;
  percent: number;
};

export class CIReportDSL {
  async givenRepoFixture(_fixtureName: string): Promise<void> {
    throw new Error("DSL not implemented: givenRepoFixture");
  }

  async whenAnalyzingBranch(_analysisBranch: string): Promise<void> {
    throw new Error("DSL not implemented: whenAnalyzingBranch");
  }

  async thenOverallBucketsEqual(_expected: OverallBucketExpectation[]): Promise<void> {
    throw new Error("DSL not implemented: thenOverallBucketsEqual");
  }
}
