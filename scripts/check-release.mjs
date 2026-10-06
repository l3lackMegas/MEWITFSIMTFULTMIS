import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (process.env.GITHUB_REF_NAME !== `v${pkg.version}`)
  throw new Error(`Release tag must match package.json: expected v${pkg.version}`);
if (process.env.GITHUB_REPOSITORY?.toLowerCase() !== 'l3lackmegas/mewitfsimtfultmis')
  throw new Error('Update package metadata and npm trusted publishing before releasing from another repository.');
if (pkg.repository.url !== 'git+https://github.com/l3lackMegas/MEWITFSIMTFULTMIS.git')
  throw new Error('repository.url must match the trusted publisher repository.');
if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw new Error('This workflow publishes stable versions only. Use an explicit npm dist-tag for prereleases.');
console.log(`Ready to publish ${pkg.name}@${pkg.version}`);
