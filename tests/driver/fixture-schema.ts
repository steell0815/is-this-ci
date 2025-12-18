export type FixturePerson = {
  name: string;
  email: string;
};

export type FixtureCommit = {
  message: string;
  author: FixturePerson;
  committer: FixturePerson;
  authorDate: string;
  commitDate: string;
};

export type FixturePlan = {
  name: string;
  branch: string;
  commits: FixtureCommit[];
};
