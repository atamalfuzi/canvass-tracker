# Canvass Tracker

I built this for a 2026 municipal campaign in Coquitlam, BC. Volunteers log each door on their phone. The campaign team sees the results on a dashboard: totals, a map of doors around the polling stations, walking routes, follow-ups and lawn-sign requests. Everything is stored in one Google Sheet through a small Apps Script backend.

**Demo:** https://atamalfuzi.github.io/canvass-tracker/

The demo runs in your browser on 300 made-up doors and needs no Google account. The people, streets, phone numbers and emails are invented. The polling stations are the real public venues.

## What's here

| File | What it is |
| --- | --- |
| `door-knocker.html` | The form volunteers fill in at each door. |
| `dashboard.html` | Overview charts, the map, saved routes, follow-ups and lawn signs. |
| `index.html` | The demo's landing page. |
| `shared.js` | Backend URL, polling stations, door results, `api()` and the in-browser demo backend. |
| `backend/Code.gs` | The Apps Script web app. |
| `demo/make-data.js` | Generates `demo/data.json` from a fixed seed. |
| `tests/` | Tests for the backend and both pages. They run under Node with no dependencies. |

## How it works

The pages are plain HTML and JavaScript with no build step. Leaflet draws the map and Chart.js draws the two charts.

Every request goes through `api()` in `shared.js`. If `WEBAPP_URL` is set, it calls the Apps Script web app. If it's empty, a small in-browser backend answers from `demo/data.json` and keeps changes in `localStorage`. A door saved on the demo form shows up on the demo dashboard.

The backend is one file bound to the Sheet. Door-knocker responses go in a `Canvass Responses` tab and saved routes in `Saved Routes`. Every other tab is an address group, which is a list of people to visit that organisers paste in from wherever they got it.

To put doors on the map, the dashboard uses coordinates already saved in the Sheet first. Otherwise it asks the backend, which uses Google's geocoder, and falls back to Nominatim at one request a second. Results are cached in the browser. Polling stations have fixed coordinates.

## Decisions

- **A Google Sheet as the database.** It cost nothing, the campaign already used Google, and organisers could read and fix the data without me.
- **One open action.** Volunteers need a link that works without signing in, so the web app accepts requests from anyone. Only adding a door is open, though. Reading responses and changing routes needs the admin key, which is kept as a script property.
- **Hand edits are safe.** People edit the Sheet directly. If someone renames a column header, the backend stops with an error instead of rewriting the sheet around it. Pre-geocoding writes back only the latitude and longitude columns, so edits made while it runs survive.
- **Volunteer input is never trusted as HTML.** Everything typed on the form is escaped wherever the dashboard shows it, including names inside button handlers.

## Tests

```
node --test
```

Needs Node 18 or later. `tests/fake-sheets.js` stands in for `SpreadsheetApp`, `Maps` and the other Apps Script services, so `Code.gs` runs locally. `tests/fake-browser.js` runs the pages against a stub DOM. The tests cover the admin key, the data-loss cases above, escaping, the demo round trip from form to dashboard, CSV quoting and route ordering. CI also checks that `demo/data.json` still matches its generator.

## Run the demo locally

The demo loads `demo/data.json`, so it needs a web server rather than a file opened from disk:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Use it for a real campaign

1. Create a Google Sheet, open Extensions > Apps Script and paste in `backend/Code.gs`.
2. In Project Settings > Script properties, add `ADMIN_KEY` with a long random value.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
4. Put the web app URL (it ends in `/exec`) in `WEBAPP_URL` at the top of `shared.js`, in the copy you host. Don't commit it.
5. Give volunteers the link to `door-knocker.html`. Open the dashboard as `dashboard.html#key=` followed by the admin key.
6. Replace the polling stations in `shared.js` with your own.

The script creates its three tabs the first time it needs them.

**Address groups.** Click Refresh groups on the Map tab to create an `Address List Template` tab. Duplicate it, rename it, and paste in names and addresses. Back on the map, tick the group to show it, then click Pre-geocode selected once. That saves coordinates for up to 100 rows per tab into the Sheet, so later loads skip the lookups.

**Saved routes.** Click a door on the map and choose Select for walk. Name the list, assign it and pick a date, then click Save to routes. The Routes tab exports each route as CSV, opens it as a Google Maps walking route, or loads it back onto the map.

**When the campaign ends**, archive the deployment (Deploy > Manage deployments) so the URL stops working.

## Licence

MIT. See `LICENSE`.
