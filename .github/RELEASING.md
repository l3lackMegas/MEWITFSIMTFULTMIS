# Releasing

This guide is for maintainers with release access.

## Publish a release

From an up-to-date `main` branch with a clean working tree and passing CI:

```sh
npm version patch
git push origin main --follow-tags
```

Choose `minor` or `major` instead when appropriate. `npm version` updates both
package manifests and creates a commit and annotated tag.

The `publish.yml` workflow runs on `vX.Y.Z` tags. It checks that the tag matches
`package.json`, builds and tests the package, verifies an installed tarball, and
publishes the stable version to `latest` using npm trusted publishing.

Wait for both the workflow and npm processing to finish. Confirm the registry's
`latest` tag and install the new version before announcing it. npm may accept a
publish before the version becomes available to download.

Published versions cannot be reused. Fix a released package in a new version.
The current workflow does not publish prereleases.

## Trusted publisher configuration

The npm package is connected to this GitHub Actions workflow:

| Field | Value |
| --- | --- |
| GitHub owner | `l3lackMegas` |
| Repository | `MEWITFSIMTFULTMIS` |
| Workflow filename | `publish.yml` |
| Environment name | Empty |
| Allowed action | `npm publish` |

The workflow uses a GitHub-hosted runner, Node 24, a compatible npm CLI, and
`id-token: write`. No `NPM_TOKEN` secret is required. Provenance is generated for
the public repository and package.

If the repository, package, or workflow is renamed, update the npm configuration,
`package.json` repository URL, and `scripts/check-release.mjs` together. Enter only
the workflow filename in npm settings, without `.github/workflows/`.

## Bootstrapping a different package

A new package must exist on npm before its trusted publisher can be configured.
Its owner can perform the initial publication locally:

```sh
npm login
npm ci
npm run test:bun
npm publish --access public
```

`prepublishOnly` runs the build, Node tests, type checks, and installed package
check. npm may request browser authentication or 2FA. Configure the new package's
trusted publisher afterward; subsequent releases should use the workflow.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the
current authentication requirements and troubleshooting guidance.
