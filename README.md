# is-this-ci
Web based report generation based on git log to identify if the commits in this repository seem to represent a continuous integration approach.

## Installation
Prerequisites:
- Node.js 20+
- Git

Clone and install dependencies:
```sh
git clone <repo-url>
cd is-this-ci
npm install
```

## Usage
Run the report against a local repository and branch:
```sh
npm run is-this-ci -- origin/main
```

To write to a custom output path:
```sh
npm run is-this-ci -- origin/main --output ./is-this-ci-report.html
```

## Reuse as a local tool
Use this repo as a reusable local CLI by adding a shell alias or running it via `npx tsx`:
```sh
alias is-this-ci='node --loader tsx ./src/cli.ts'
```

Then execute from a git repo:
```sh
is-this-ci origin/main
```

## Global installation (local repo)
To make this package available system-wide from your local clone:
```sh
cd is-this-ci
npm install
npm link
```

Then run it from any git repository:
```sh
is-this-ci origin/main
```

To remove the global link later:
```sh
npm unlink -g is-this-ci
```

## Global installation (from a local directory)
If you want a global install without linking:
```sh
cd is-this-ci
npm install
npm install -g .
```

Then run it from any git repository:
```sh
is-this-ci origin/main
```

To remove the global install later:
```sh
npm uninstall -g is-this-ci
```

## Publish
```
npm publish
```
