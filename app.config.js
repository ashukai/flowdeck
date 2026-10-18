// Extends app.json. On GitHub Pages the site lives under /<repo-name>/, so the
// publish workflow sets EXPO_BASE_URL; local development leaves it unset.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL
  if (!baseUrl) return config
  return { ...config, experiments: { ...config.experiments, baseUrl } }
}
