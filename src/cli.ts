const [analysisBranch] = process.argv.slice(2);

if (!analysisBranch) {
  console.error("Usage: npm run is-this-ci -- <analysis-branch>");
  process.exit(1);
}

console.log(`is-this-ci scaffold ready. Analysis branch: ${analysisBranch}`);
