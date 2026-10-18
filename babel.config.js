// Expo Babel config.
//
// Extra plugin: some dependencies (e.g. zustand) reference `import.meta.env`.
// Expo's web bundle is served as a *classic* script, where the `import.meta`
// token is a hard SyntaxError and crashes the whole bundle before it runs.
// We rewrite `import.meta` to a browser-safe object so those dev-only guards
// (`import.meta.env ? import.meta.env.MODE : ...`) evaluate to undefined
// instead of throwing. Native/Hermes keep their own handling; this only
// changes the token where it would otherwise be illegal.
function transformImportMeta() {
  return {
    name: 'flowdeck-transform-import-meta',
    visitor: {
      MetaProperty(path) {
        const node = path.node
        if (node.meta && node.meta.name === 'import' && node.property && node.property.name === 'meta') {
          path.replaceWithSourceString("({ url: '', env: {} })")
        }
      },
    },
  }
}

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [transformImportMeta],
  }
}
