import { ReportSession } from "../driver/report-session";

export type OverallBucketExpectation = {
  bucket: "<1h" | "1-4h" | "4-8h" | ">8h";
  count: number;
  percent: number;
};

export class CIReportDSL {
  private session = new ReportSession();
  private analysisBranch: string | null = null;

  async givenRepoFixture(fixtureName: string): Promise<void> {
    this.session.createFixtureRepo(fixtureName);
  }

  async whenAnalyzingBranch(analysisBranch: string): Promise<void> {
    this.analysisBranch = analysisBranch;
  }

  async thenOverallBucketsEqual(expected: OverallBucketExpectation[]): Promise<void> {
    if (!this.analysisBranch) {
      throw new Error("Analysis branch not set. Call whenAnalyzingBranch first.");
    }

    const actual = this.session.readOverallBuckets(this.analysisBranch);
    const normalized = actual.map((row) => ({ ...row, percent: this.round(row.percent) }));

    this.assertBuckets(normalized, expected);
    this.session.dispose();
  }

  private assertBuckets(actual: OverallBucketExpectation[], expected: OverallBucketExpectation[]): void {
    const byBucket = (rows: OverallBucketExpectation[]) =>
      rows.reduce<Record<string, OverallBucketExpectation>>((acc, row) => {
        acc[row.bucket] = row;
        return acc;
      }, {});

    const actualMap = byBucket(actual);
    const expectedMap = byBucket(expected);

    for (const bucket of Object.keys(expectedMap)) {
      const actualRow = actualMap[bucket];
      const expectedRow = expectedMap[bucket];

      if (!actualRow) {
        throw new Error(`Missing bucket ${bucket} in actual results.`);
      }
      if (actualRow.count !== expectedRow.count || actualRow.percent !== expectedRow.percent) {
        throw new Error(
          `Bucket ${bucket} mismatch. Expected count=${expectedRow.count}, percent=${expectedRow.percent}; ` +
            `got count=${actualRow.count}, percent=${actualRow.percent}.`
        );
      }
    }
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
