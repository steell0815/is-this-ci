# Fixture Structure

Each fixture lives in `tests/fixtures/<name>/` and contains a `fixture.json` file.

Schema (informal):
- `name`: fixture name
- `branch`: branch to create (e.g., "main")
- `commits[]`: ordered commit plan
  - `message`: commit message
  - `author`: `{ name, email }`
  - `committer`: `{ name, email }`
  - `authorDate`: ISO 8601 date string
  - `commitDate`: ISO 8601 date string

The protocol driver will later interpret this plan and create a git repo with
exact author/committer timestamps to exercise bucket boundaries.
