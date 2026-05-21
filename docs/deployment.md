# Deployment

This document covers only the GitHub-side deployment flow for the Satisfactory planner. Environment-specific hosting configuration should live outside the public repository.

## Production Workflow

The production workflow is `.github/workflows/deploy-satisfactory.yml`.

It runs when:

- Changes are pushed to `main` in app, package, data, or workflow paths.
- The workflow is run manually from the GitHub Actions tab.

The workflow expects this repository secret:

```txt
AZURE_STATIC_WEB_APPS_API_TOKEN_SATISFACTORY
```

Do not commit the token value.

## Build And Upload

The workflow runs from the repository root:

```bash
npm ci
npm test
npm run build
```

The deployable app is emitted to:

```txt
dist/apps/web/browser
```

The workflow uploads that directory directly with `skip_app_build: true`, so GitHub owns the test/build step and the hosting provider only receives built static files.

## Static App Config

`apps/web/public/staticwebapp.config.json` is copied into the build output by Angular. It provides:

- SPA navigation fallback to `/index.html`.
- WASM MIME handling for the solver runtime.
- Baseline security headers.

## Manual Deploy

To deploy without a new merge:

1. Open GitHub Actions.
2. Select `Deploy Satisfactory Planner`.
3. Choose `Run workflow` on `main`.
4. Wait for the build and upload job to finish.

After a green run, verify the configured production URL loads the planner and can solve a small plan.

## Notes

- Pull request preview deployments are intentionally not enabled.
- Keep hosting-provider setup procedures in private operational notes.
- Keep public docs focused on repeatable repository behavior: build, test, upload, and validate.
