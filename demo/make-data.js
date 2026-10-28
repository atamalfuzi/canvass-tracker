// Writes demo/data.json: made-up door-knocking results for the demo. Run: node demo/make-data.js
// People, streets and notes are invented. Only the polling stations are real (they are public venues).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const shared = { location: { hash: '' }, URLSearchParams };
vm.createContext(shared);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8') + ';this.POLLING_STATIONS = POLLING_STATIONS; this.stationLabel = stationLabel;', shared);
const { POLLING_STATIONS, stationLabel } = shared;

// Same seed, same data, so the demo and the screenshots don't change between runs.
let seed = 2026;
function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = list => list[Math.floor(random() * list.length)];
const chance = p => random() < p;
const round = n => Math.round(n * 1e5) / 1e5;
function weighted(pairs) {
    let r = random() * pairs.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of pairs) if ((r -= w) < 0) return value;
    return pairs[pairs.length - 1][0];
}

// Checked against OpenStreetMap: no street in Coquitlam, Port Coquitlam or Port Moody has any of these names.
const STREETS = ['Amberlight Way', 'Bellfield Rd', 'Cedar Hollow Rd', 'Brambleton Pl', 'Elmridge Ave', 'Fernbank St', 'Copperleaf Ct',
    'Hollin Ct', 'Harrowfield Dr', 'Glimmer Lane', 'Kettlewood Pl', 'Larchmere Ave', 'Maplegate Rd', 'Nettle Way', 'Oakmere St',
    'Pebblecreek Way', 'Quarry Hill Rd', 'Rowan Pl', 'Saltmarsh Lane', 'Tumbleweed Pl', 'Upland Cres', 'Vetch Rd', 'Willowbrook Dr',
    'Wrenfield Ct', 'Lanternfield Way', 'Bracken Way', 'Cinderwood Rd', 'Driftwood Ave', 'Ember Pl', 'Fiddlehead Lane', 'Gull Ct', 'Hearthstone Pl',
    'Mossbank St', 'Silverthorn Way', 'Whistlewood Dr', 'Lowmoor Cres', 'Meadowlark St', 'Nook Rd', 'Northvale Rd', 'Plover Way',
    'Quill Ct', 'Ridgeback Rd', 'Brookhollow Pl', 'Quarrystone Ct', 'Umber St', 'Vireo Ct'];
const FIRST = ['Amira', 'Ben', 'Chloe', 'Daniel', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jonah', 'Kiran', 'Lena', 'Marco',
    'Nadia', 'Owen', 'Priya', 'Quinn', 'Reza', 'Sofia', 'Tom', 'Uma', 'Victor', 'Wen', 'Yara', 'Zack', 'Mei', 'Arash', 'Leila'];
const LAST = ['Ahmadi', 'Brooks', 'Chen', 'Dhillon', 'Evans', 'Fraser', 'Gill', 'Hughes', 'Ito', 'Jensen', 'Kim', 'Lam', 'Moreau',
    'Nguyen', 'Okafor', 'Park', 'Rossi', 'Singh', 'Tran', 'Wong', 'Young', 'Zhao', 'Karimi', 'Lopez', 'MacLeod', 'Novak'];
const ISSUES = ['Housing', 'Taxes', 'Transit', 'Traffic', 'Public safety', 'Parks and recreation', 'Small business',
    'Climate / environment', 'Development / zoning', 'City services'];
const NOTES = ['Asked about the new bus route.', 'Wants more townhouses near transit.', 'Worried about property tax.',
    'Has a dog, knock loudly.', 'Call back after 6 pm.', 'Busy, try again on the weekend.', 'Concerned about traffic on the hill.',
    'Happy to volunteer.', 'Wants to know where to vote.', 'Supports the park upgrade.', 'Renting, worried about rent increases.'];

const regular = POLLING_STATIONS.filter(s => s.kind === 'regular');
// Each station's area gets its own few streets, so addresses cluster the way a real walk list does.
const streetsFor = new Map(regular.map((station, i) => [station.code, STREETS.slice((i * 2) % STREETS.length, (i * 2) % STREETS.length + 3)]));
const near = (station, metres) => ({
    latitude: round(station.lat + ((random() - 0.5) * 2 * metres) / 111320),
    longitude: round(station.lng + ((random() - 0.5) * 2 * metres) / (111320 * Math.cos(station.lat * Math.PI / 180)))
});
const phone = () => `604-555-01${String(Math.floor(random() * 100)).padStart(2, '0')}`;
const recordKey = row => [row.streetAddress, row.unitNumber, row.postalCode, row.routeArea].join('|').toLowerCase();

// Doors are knocked between 9 am and 7 pm Pacific (16:00 to 02:00 UTC), June 1 to October 16.
const firstDay = Date.parse('2026-06-01T16:00:00Z');
const days = 138;
const knockTime = () => new Date(firstDay + Math.floor(random() * days) * 86400000 + random() * 10 * 3600000).toISOString();
const responses = [];
for (let i = 0; i < 300; i++) {
    const station = pick(regular);
    const street = `${100 + Math.floor(random() * 3900)} ${pick(streetsFor.get(station.code))}`;
    const unit = chance(0.12) ? String(100 + Math.floor(random() * 400)) : '';
    const supportLevel = weighted([['Not Home/No Answer', 35], ['Supporter', 25], ['Undecided', 18], ['Not a Supporter', 15], ["Not Voting/Can't Vote", 7]]);
    const home = supportLevel !== 'Not Home/No Answer';
    const named = home && chance(0.55);
    const firstName = named ? pick(FIRST) : '';
    const lastName = named && chance(0.8) ? pick(LAST) : '';
    const interested = supportLevel === 'Supporter' || supportLevel === 'Undecided';
    responses.push({
        timestamp: knockTime(),
        streetAddress: street,
        unitNumber: unit,
        postalCode: '',
        routeArea: stationLabel(station),
        supportLevel,
        mainIssueDiscussed: home ? [...new Set([pick(ISSUES), chance(0.4) ? pick(ISSUES) : ''])].filter(Boolean).join('; ') : '',
        followUpNeeded: interested && chance(0.3) ? 'Yes' : home ? 'No' : '',
        firstName,
        lastName,
        email: named && chance(0.4) ? `${firstName}.${lastName || 'home'}@example.com`.toLowerCase() : '',
        phone: named && chance(0.4) ? phone() : '',
        lawnSign: supportLevel === 'Supporter' && chance(0.35) ? 'Yes' : 'No',
        contacted: 'Yes',
        notes: home && chance(0.3) ? pick(NOTES) : '',
        mapAddress: `${street}, Coquitlam, BC`,
        ...near(station, 550),
        doorId: unit ? `${street} Unit ${unit}` : street
    });
}
responses.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

function groupRows(name, count, stations) {
    return Array.from({ length: count }, (_, i) => {
        const station = pick(stations);
        return {
            sheetName: name,
            sheetRow: i + 2,
            firstName: pick(FIRST),
            lastName: pick(LAST),
            streetAddress: `${100 + Math.floor(random() * 3900)} ${pick(streetsFor.get(station.code))}`,
            city: 'Coquitlam',
            province: 'BC',
            postalCode: '',
            ...near(station, 500)
        };
    });
}
const groups = [
    { name: 'Friends of the campaign', rows: groupRows('Friends of the campaign', 18, regular) },
    { name: 'Cape Horn leads', rows: groupRows('Cape Horn leads', 12, regular.filter(s => ['13', '2', '23'].includes(s.code))) }
];

function routeFrom(name, assignedTo, routeDate, stationCode, size) {
    const targets = responses
        .filter(row => row.routeArea.startsWith(stationCode + ' - ') && (row.supportLevel === 'Undecided' || row.supportLevel === 'Supporter'))
        .slice(0, size)
        .map(row => ({
            key: recordKey(row),
            label: row.doorId,
            addressQuery: [row.streetAddress, 'Coquitlam', 'BC', 'Canada'].join(', '),
            city: 'Coquitlam',
            province: 'BC',
            postalCode: '',
            supportLevel: row.supportLevel,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            lawnSign: row.lawnSign,
            contacted: 'Yes',
            source: row.routeArea,
            notes: row.notes,
            coords: { lat: row.latitude, lng: row.longitude }
        }));
    return { routeId: `demo-route-${stationCode}`, routeName: name, assignedTo, routeDate, createdAt: `${routeDate}T15:00:00.000Z`, targets };
}
const routes = [
    routeFrom('Hillcrest undecided', 'Priya', '2026-09-26', '1', 8),
    routeFrom('Nestor follow-ups', 'Marco', '2026-10-03', '12', 6)
];

fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify({ responses, groups, routes }, null, 1) + '\n');
console.log(`${responses.length} responses, ${groups.length} groups, ${routes.length} routes`);
