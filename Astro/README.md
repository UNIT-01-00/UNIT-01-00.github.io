# AstroScope — Competition Upgrade

This version preserves the original AstroScope visual design while implementing the review changes except the astronomy trip planner and light-pollution integration.

## Security first
The original private credentials were exposed in browser JavaScript. **Rotate/revoke those old credentials in each provider dashboard.** This project contains no copied secret values. Configure fresh keys as server-side environment variables using `.env.example` as the list of required names.

## Run
This project uses only Node.js built-ins; no npm install is required. Set the environment variables in your terminal or hosting provider, then run:

```bash
node server.js
```

Open `http://localhost:3000`. Opening `index.html` directly with `file://` will not provide the secure API proxy.

## What was added
- Server-side API proxy for NASA APOD, OpenWeather, AstronomyAPI, BOM space weather and Mapbox geocoding.
- Dynamic event endpoint with normalized local fallback plus optional `ASTRONOMY_EVENTS_URL` ingestion.
- Sky Forecast Engine using observer location, Sun altitude, Moon altitude/illumination, target altitude, and near-term weather when available.
- Personal Sky Intelligence and best observing window.
- “What’s Visible Right Now?” ranking.
- Interactive sky map with drag, zoom/pinch, and object identification.
- Astronomy-specific observing conditions and 0–100 score.
- Smart favorites/reminders using browser notifications while the app is running.
- Interactive eclipse geometry lab.
- Split HTML/CSS/JS/data/assets, with the large embedded star PNG extracted to an asset file.

## Deliberately not added
- Astronomy trip planner.
- Light-pollution / Bortle API integration.

## Important forecast wording
Weather is only used when it falls inside the available OpenWeather forecast window. Long-range event scores are explicitly geometry-based until weather becomes available.
