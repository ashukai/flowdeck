# FlowDeck

Build your own SOP flows the way you study them: steps with checklist items,
conditions with Yes / No branches, notes and annotated screenshots. Then run the
flow in Present mode, which asks each condition and follows your answer.

**Try it:** https://ashukai.github.io/flowdeck/

Flows are saved in your browser on the device you use.

## Run it locally

```sh
npm install
npx expo start --web
```

## Publish the website

```sh
npm run deploy:pages
```

This type-checks the app, builds the web version and pushes it to the
`gh-pages` branch, which GitHub Pages serves.

Built with Expo and React Native, so the same code also runs as an iPhone and
iPad app.
