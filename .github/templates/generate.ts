/**
 * Multi-hosting CI template generator.
 * Outputs workflows for GitHub Actions, GitLab CI, and other platforms.
 */

const CI_TEMPLATE = `# GitHub Actions CI workflow for loop-lore
# Auto-generated - do not edit manually

name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest
    strategy:
      matrix:
        bun-version: ['1.1.0', 'latest']

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: \${{ matrix.bun-version }}

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: \${{ runner.os }}-bun-\${{ hashFiles('**/bun.lock') }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck && bun run typecheck:frontend

      - name: Lint
        run: bun run lint

      - name: Lint CSS
        run: bun run lint:css

      - name: Format check
        run: bun run format

      - name: Markdown lint
        run: bun run md:lint

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test src/

  test-e2e:
    name: Browser E2E Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: E2E_SAFEGUARD=1 bun run test:e2e:browser

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [quality, test-unit]

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run build:frontend
      - run: bun run build:server
`;

const GITLAB_TEMPLATE = `# GitLab CI workflow for loop-lore
# Auto-generated - do not edit manually

stages:
  - quality
  - test
  - build

variables:
  BUN_VERSION: "latest"

quality:
  stage: quality
  image: oven/bun:${BUN_VERSION}
  script:
    - bun install --frozen-lockfile
    - bun run typecheck
    - bun run typecheck:frontend
    - bun run lint
    - bun run lint:css
    - bun run format
    - bun run md:lint

test-unit:
  stage: test
  image: oven/bun:${BUN_VERSION}
  script:
    - bun install --frozen-lockfile
    - bun test src/

test-e2e:
  stage: test
  image: oven/bun:${BUN_VERSION}
  script:
    - bun install --frozen-lockfile
    - bunx playwright install --with-deps chromium
    - E2E_SAFEGUARD=1 bun run test:e2e:browser

build:
  stage: build
  image: oven/bun:${BUN_VERSION}
  script:
    - bun install --frozen-lockfile
    - bun run build:frontend
    - bun run build:server
  artifacts:
    paths:
      - dist/
`;

const RELEASE_TEMPLATE = `# GitHub Actions Release workflow for loop-lore

name: Release

on:
  push:
    branches: [master]

jobs:
  ci-checks:
    name: Reuse CI Quality Checks
    uses: ./.github/workflows/ci.yml

  release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: ci-checks
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install --frozen-lockfile

      - name: Predict version
        id: version
        run: |
          NEXT_VERSION=$(bun run version:predict)
          echo "predicted=$NEXT_VERSION" >> $GITHUB_OUTPUT

      - name: Create annotated tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a "v${{ steps.version.outputs.predicted }}" -m "Release v${{ steps.version.outputs.predicted }}"
          git push origin "v${{ steps.version.outputs.predicted }}"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.version.outputs.predicted }}
          name: Release v${{ steps.version.outputs.predicted }}
          generate_release_notes: true
`;

async function main() {
  const outputDir = ".github/workflows";
  const templatesDir = ".github/templates";

  await Promise.all([
    Bun.write(`${outputDir}/ci.yml`, CI_TEMPLATE),
    Bun.write(`${outputDir}/release.yml`, RELEASE_TEMPLATE),
    Bun.write(`${templatesDir}/gitlab-ci.yaml`, GITLAB_TEMPLATE),
  ]);

  console.log("Generated workflows:");
  console.log("  .github/workflows/ci.yml");
  console.log("  .github/workflows/release.yml");
  console.log("  .github/templates/gitlab-ci.yaml");
}

main().catch(console.error);