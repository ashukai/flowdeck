#!/bin/sh
# Builds the web version and publishes it to GitHub Pages (the gh-pages
# branch). Run from the project with: npm run deploy:pages
set -eu
cd "$(dirname "$0")/.."

REMOTE=$(git remote get-url origin)
REPO=$(basename "$REMOTE" .git)

npx tsc --noEmit
rm -rf dist
EXPO_BASE_URL="/$REPO" npx expo export --platform web
# GitHub Pages serves 404.html for unknown paths, so reloading any page works;
# .nojekyll keeps the _expo folder from being skipped.
cp dist/index.html dist/404.html
touch dist/.nojekyll

cd dist
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Publish site from $(git -C .. rev-parse --short HEAD)"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Published. It goes live in about a minute."
