# Changesets

Run `pnpm changeset` to describe each user-facing change, and commit the generated file with it.

On `main`, the release workflow opens a "Version Packages" PR that collects pending changesets. Merging it publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers).
