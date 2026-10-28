// Shared by door-knocker.html and dashboard.html.

// Paste your Apps Script web app URL (it ends in /exec) here. Leave it empty to run on the demo data.
const WEBAPP_URL = '';
const DEMO = !WEBAPP_URL;

// The dashboard sends this with every request. Open it as dashboard.html#key=... (see the README).
const ADMIN_KEY = new URLSearchParams(location.hash.slice(1)).get('key') || '';

// Door results in the order the volunteer form lists them. `tone` picks the badge and form colours.
const OUTCOMES = new Map([
    ['Supporter', { tone: 'green', color: '#16a34a' }],
    ['Undecided', { tone: 'yellow', color: '#eab308' }],
    ['Not a Supporter', { tone: 'red', color: '#dc2626' }],
    ['Not Home/No Answer', { tone: 'dark', color: '#111827' }],
    ["Not Voting/Can't Vote", { tone: 'gray', color: '#9ca3af' }]
]);

// Coordinates are fixed so the map never has to look the stations up.
const POLLING_STATIONS = [
    { code: 'AD1', name: 'Centennial Adv.', address: '620 Poirier St', kind: 'advance', lat: 49.25459, lng: -122.84724 },
    { code: 'AD2', name: 'Innovation Adv.', address: '1207 Pinetree Way', kind: 'advance', lat: 49.28563, lng: -122.79056 },
    { code: 'AD3', name: 'Victoria Adv.', address: '800 Egmont Ave', kind: 'advance', lat: 49.26648, lng: -122.87724 },
    { code: '1', name: 'Hillcrest', address: '2161 Regan Ave', kind: 'regular', lat: 49.26244, lng: -122.83349 },
    { code: '2', name: 'Mundy Road', address: '2200 Austin Ave', kind: 'regular', lat: 49.24793, lng: -122.83319 },
    { code: '3', name: 'Innovation', address: '1207 Pinetree Way', kind: 'regular', lat: 49.28563, lng: -122.79056 },
    { code: '4', name: 'Glen', address: '3064 Glen Dr', kind: 'regular', lat: 49.28222, lng: -122.78842 },
    { code: '5', name: 'Bramblewood', address: '2875 Panorama Dr', kind: 'regular', lat: 49.29873, lng: -122.81314 },
    { code: '6', name: 'Mountain View', address: '740 Smith Ave', kind: 'regular', lat: 49.25913, lng: -122.87913 },
    { code: '7', name: 'Smiling Creek', address: '3456 Princeton Ave', kind: 'regular', lat: 49.29790, lng: -122.75029 },
    { code: '8', name: 'Como Lake Middle', address: '1121 King Albert Ave', kind: 'regular', lat: 49.25319, lng: -122.86112 },
    { code: '9', name: 'Eagle Ridge', address: '1215 Falcon Dr', kind: 'regular', lat: 49.28475, lng: -122.81709 },
    { code: '10', name: 'Alderson', address: '825 Gauthier Ave', kind: 'regular', lat: 49.23922, lng: -122.87496 },
    { code: '11', name: 'Panorama', address: '1455 Johnson St', kind: 'regular', lat: 49.29982, lng: -122.79892 },
    { code: '12', name: 'Nestor', address: '1266 Nestor St', kind: 'regular', lat: 49.29024, lng: -122.77984 },
    { code: '13', name: 'Cape Horn', address: '155 Finnigan St', kind: 'regular', lat: 49.23470, lng: -122.83547 },
    { code: '14', name: 'Walton', address: '2960 Walton Ave', kind: 'regular', lat: 49.28867, lng: -122.79718 },
    { code: '15', name: 'Ranch Park', address: '2701 Spuraway Ave', kind: 'regular', lat: 49.26550, lng: -122.81288 },
    { code: '16', name: 'Lord Baden', address: '450 Joyce St', kind: 'regular', lat: 49.24755, lng: -122.87431 },
    { code: '17', name: 'Porter Street', address: '728 Porter St', kind: 'regular', lat: 49.26161, lng: -122.86460 },
    { code: '18', name: 'Riverview', address: '700 Clearwater Way', kind: 'regular', lat: 49.25667, lng: -122.80609 },
    { code: '19', name: 'Victoria Hall', address: '3435 Victoria Dr', kind: 'regular', lat: 49.28612, lng: -122.75009 },
    { code: '20', name: 'Miller Park', address: '800 Egmont Ave', kind: 'regular', lat: 49.26648, lng: -122.87724 },
    { code: '21', name: 'Harbourview', address: '960 Lillian St', kind: 'regular', lat: 49.26913, lng: -122.86162 },
    { code: '22', name: 'Meadowbrook', address: '900 Sharpe St', kind: 'regular', lat: 49.26623, lng: -122.80052 },
    { code: '23', name: 'Montgomery', address: '1900 Edgewood Ave', kind: 'regular', lat: 49.24430, lng: -122.84123 }
];

function stationLabel(station) {
    return `${station.code} - ${station.name}`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// A string argument for an inline onclick="..." handler, safe even with quotes in it.
function jsArg(value) {
    return escapeHtml(JSON.stringify(value));
}

async function api(params, post = false) {
    if (DEMO) return structuredClone(await demoApi(params));
    const body = new URLSearchParams({ ...params, key: ADMIN_KEY });
    const response = post ? await fetch(WEBAPP_URL, { method: 'POST', body }) : await fetch(`${WEBAPP_URL}?${body}`);
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error || 'Request failed.');
    return payload.data;
}

// Stands in for the Apps Script backend when WEBAPP_URL is empty. Changes stay in this browser,
// so a door entered on the volunteer form shows up on the dashboard.
const demo = {
    state: null,

    async load() {
        if (this.state) return this.state;
        try {
            this.state = JSON.parse(localStorage.getItem('demoState'));
        } catch {
            this.state = null;
        }
        this.state ||= await (await fetch('demo/data.json')).json();
        return this.state;
    },

    save() {
        try {
            localStorage.setItem('demoState', JSON.stringify(this.state));
        } catch {
            // Private windows can refuse storage; the demo still works for this page.
        }
    },

    reset() {
        try {
            localStorage.removeItem('demoState');
        } catch {}
        this.state = null;
    }
};

async function demoApi(params) {
    const state = await demo.load();
    const group = () => {
        const found = state.groups.find(g => g.name === params.sheet);
        if (!found) throw new Error('Address group sheet not found.');
        return found;
    };
    switch (params.action) {
        case 'addDoor': {
            // The demo has no geocoder, so new doors land near the chosen station (or the city centre).
            const station = POLLING_STATIONS.find(s => stationLabel(s) === params.routeArea) || { lat: 49.2706, lng: -122.8196 };
            const record = { ...params, latitude: station.lat + (Math.random() - 0.5) * 0.006, longitude: station.lng + (Math.random() - 0.5) * 0.009 };
            delete record.action;
            delete record.key;
            state.responses.push(record);
            demo.save();
            return { message: 'Saved: ' + params.doorId, doorId: params.doorId };
        }
        case 'getAllData':
            return state.responses;
        case 'getAddressGroups':
            return state.groups.map(g => ({ name: g.name, rowCount: g.rows.length }));
        case 'getAddressGroup':
            return group().rows;
        case 'geocodeAddressGroup':
            return { sheetName: group().name, updated: 0, skipped: group().rows.length, failed: 0, limit: 100 };
        case 'getSavedRoutes':
            return state.routes;
        case 'saveRoute': {
            const route = {
                routeId: 'demo-' + Date.now(),
                routeName: params.routeName,
                assignedTo: params.assignedTo,
                routeDate: params.routeDate,
                createdAt: new Date().toISOString(),
                targets: JSON.parse(params.targetsJson)
            };
            state.routes.push(route);
            demo.save();
            return route;
        }
        case 'deleteSavedRoute':
            state.routes = state.routes.filter(route => route.routeId !== params.routeId);
            demo.save();
            return { routeId: params.routeId };
        default:
            throw new Error(`The demo can't do "${params.action}".`);
    }
}
