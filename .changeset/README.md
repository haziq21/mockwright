# Changesets

This repo uses [changesets](https://github.com/changesets/changesets) to manage
versioning and the changelog.

## Workflow

1. After a meaningful change, add a changeset (choose patch/minor/major):

   ```
   pnpm changeset
   ```

   Commit the generated `.changeset/*.md` file with your work.

2. When it's time to release, bump versions + update `CHANGELOG.md`:

   ```
   pnpm changeset:version
   ```

   Review the version bumps and changelog, then commit (conventionally:
   `chore: version packages`).

3. Publish to npm (builds `dist/` via `prepack`, then publishes):

   ```
   pnpm changeset:publish
   ```

4. Optionally create git tags for the release:

   ```
   pnpm exec changeset tag
   ```
