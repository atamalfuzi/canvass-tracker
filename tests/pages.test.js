const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, openDashboard, inlineHandlers, runHandler, TEST_URL } = require('./fake-browser');
const demoData = require('../demo/data.json');

function liveBackend(records = []) {
    return params => {
        const ok = data => ({ success: true, data });
        switch (params.action) {
            case 'getAllData': return ok(records);
            case 'getSavedRoutes': return ok([]);
            case 'getAddressGroups': return ok([]);
            case 'addDoor': return ok({ doorId: params.doorId });
            default: return { success: false, error: 'Invalid action' };
        }
    };
}

function fillDoor(browser, fields) {
    for (const [id, value] of Object.entries(fields)) browser.el(id).value = value;
}

test('demo: the dashboard loads the made-up data without calling any outside service', async () => {
    const browser = await openDashboard();
    assert.equal(browser.page.allData.length, demoData.responses.length);
    assert.deepEqual(browser.log.requests.map(r => r.url), ['demo/data.json']);
    assert.equal(browser.el('connection-status').textContent, 'Demo data');
    assert.equal(String(browser.el('total-doors').textContent), String(demoData.responses.length));
    assert.equal(browser.page.mapLayers.records.items.length, demoData.responses.length);
    assert.equal(browser.page.mapLayers.stations.items.length, 23, 'advance-voting stations start hidden');
    assert.match(browser.el('route-table-body').innerHTML, /Hillcrest undecided/);
});

test('demo: a door saved on the volunteer form shows up on the dashboard', async () => {
    const storage = {};
    const form = load('door-knocker.html', { storage });
    form.page.init();
    fillDoor(form, { 'street-address': '5 Test Way', 'route-area': '12 - Nestor', 'support-level': 'Undecided', 'follow-up-needed': 'Yes', notes: 'Back on Friday' });
    await form.page.submitRecord();
    assert.equal(form.el('message').textContent, 'Saved 5 Test Way');

    const browser = await openDashboard({ storage });
    const saved = browser.page.allData.at(-1);
    assert.equal(browser.page.allData.length, demoData.responses.length + 1);
    assert.equal(saved.streetAddress, '5 Test Way');
    assert.equal(saved.routeArea, '12 - Nestor');
    assert.ok(Math.abs(saved.latitude - 49.29024) < 0.01 && Math.abs(saved.longitude + 122.77984) < 0.01, 'placed near the Nestor station');
    assert.match(browser.el('followup-table-body').rows.map(r => r.innerHTML).join(), /5 Test Way/);
});

test('the volunteer form lists the 23 regular stations and the five door results', () => {
    const form = load('door-knocker.html');
    form.page.init();
    const stations = form.el('route-area').options.map(o => o.value);
    assert.equal(stations.length, 23);
    assert.equal(stations[0], '1 - Hillcrest');
    assert.deepEqual(form.el('support-level').options.map(o => o.value),
        ['Supporter', 'Undecided', 'Not a Supporter', 'Not Home/No Answer', "Not Voting/Can't Vote"]);
});

test('live: the volunteer form pings the web app and posts doors with no admin key', async () => {
    const form = load('door-knocker.html', { backend: liveBackend() });
    form.page.init();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(form.el('connection-status').textContent, 'Connected');
    fillDoor(form, { 'street-address': '7 Saltmarsh Lane', 'support-level': 'Supporter' });
    await form.page.submitRecord();
    const post = form.log.requests.find(r => r.method === 'POST');
    assert.equal(post.params.action, 'addDoor');
    assert.equal(post.params.key, '');
    assert.equal(form.el('message').textContent, 'Saved 7 Saltmarsh Lane');
});

test('live: the dashboard sends the admin key with every request', async () => {
    const browser = await openDashboard({ backend: liveBackend(), hash: '#key=K' });
    const toBackend = browser.log.requests.filter(r => r.url === TEST_URL);
    assert.deepEqual(toBackend.map(r => r.params.action), ['getAllData', 'getSavedRoutes', 'getAddressGroups']);
    assert.ok(toBackend.every(r => r.params.key === 'K'));
    assert.equal(browser.el('connection-status').textContent, 'Connected');
});

test('live: a wrong key shows an error with the reason on hover', async () => {
    const browser = await openDashboard({ backend: () => ({ success: false, error: 'Missing or wrong admin key.' }) });
    assert.equal(browser.el('connection-status').textContent, 'Error loading data');
    assert.equal(browser.el('connection-status').title, 'Missing or wrong admin key.');
});

test('the follow-ups table shows what volunteers typed as text, not HTML', async () => {
    const records = [{ streetAddress: '<img src=x onerror=alert(1)>', unitNumber: '2', firstName: '<b>Ann</b>', lastName: 'Lee', phone: '"><svg onload=1>',
        email: '', supportLevel: '<i>odd</i>', lawnSign: '<u>Yes</u>', notes: '<script>x</script>', followUpNeeded: 'Yes', latitude: 49.27, longitude: -122.8 }];
    const browser = await openDashboard({ backend: liveBackend(records), hash: '#key=K' });
    const row = browser.el('followup-table-body').rows[0].innerHTML;
    for (const tag of ['<img', '<b>', '<svg', '<i>', '<u>', '<script']) assert.ok(!row.includes(tag), `raw ${tag} in the table`);
    assert.match(row, /&lt;img src=x onerror=alert\(1\)&gt; Unit 2/);
});

test('buttons still work for names with quotes and apostrophes', async () => {
    const names = ["Mom's list", 'Say "hi"', 'A & B <c>'];
    const browser = await openDashboard();
    const page = browser.page;

    page.addressGroups = names.map(name => ({ name, rowCount: 1 }));
    page.renderAddressGroups();
    const groupHandlers = inlineHandlers(browser.el('addressGroupList').innerHTML).filter(h => !h.includes('stopPropagation'));
    names.forEach((name, i) => {
        assert.deepEqual(runHandler(groupHandlers[i * 2]), [['toggleAddressGroup', name]]);
        assert.deepEqual(runHandler(groupHandlers[i * 2 + 1]), [['setAddressGroupColor', name, '#000000']]);
    });

    page.savedRoutes = names.map(name => ({ routeId: name, routeName: name, targets: [] }));
    page.renderSavedRoutes();
    const routeCalls = inlineHandlers(browser.el('route-table-body').innerHTML).map(h => runHandler(h)[0]);
    assert.deepEqual(routeCalls.map(call => call[1]), names.flatMap(name => [name, name, name, name]));

    page.allData = names.map((name, i) => ({ streetAddress: name, _coords: { lat: 49.25 + i / 100, lng: -122.8 } }));
    page.drawMapLayers({ fit: false });
    const popupCalls = page.mapLayers.records.items.map(marker => runHandler(inlineHandlers(marker.popup)[0])[0]);
    assert.deepEqual(popupCalls.map(call => call[1]), page.allData.map(row => page.getRecordKey(row)));
});

test('CSV exports quote commas, quotes and line breaks', async () => {
    const records = [{ streetAddress: '1 Amberlight Way', unitNumber: '', firstName: 'Ann', lastName: '', phone: '', email: '', supportLevel: 'Supporter',
        lawnSign: 'Yes', notes: 'Said "yes", then\nleft', followUpNeeded: '', latitude: 49.27, longitude: -122.8 }];
    const browser = await openDashboard({ backend: liveBackend(records), hash: '#key=K' });
    browser.page.exportLawnSignsCSV();
    assert.deepEqual(browser.log.downloads, [{
        name: 'lawn-signs.csv',
        csv: '"Address","Name","Phone","Email","Notes"\n"1 Amberlight Way","Ann","","","Said ""yes"", then\nleft"'
    }]);
});

test('a walking route visits the nearest unvisited stop next', async () => {
    const browser = await openDashboard();
    const stop = (name, lat) => ({ addressQuery: name, coords: { lat, lng: -122.8 } });
    browser.page.openWalkingRoute([stop('A', 49.20), stop('C', 49.22), stop('B', 49.21), { addressQuery: 'no coordinates' }]);
    const url = new URL(browser.log.opened[0][0]);
    assert.equal(url.searchParams.get('origin'), 'A');
    assert.equal(url.searchParams.get('waypoints'), 'B');
    assert.equal(url.searchParams.get('destination'), 'C');
    assert.equal(url.searchParams.get('travelmode'), 'walking');
});

test('stops at the same address are spread out instead of stacked', async () => {
    const browser = await openDashboard();
    const point = { lat: 49.27, lng: -122.8 };
    browser.page.displayCoordBuckets = {};
    const spots = Array.from({ length: 10 }, () => browser.page.getDisplayCoords(point));
    assert.deepEqual(spots[0], point);
    assert.equal(new Set(spots.map(s => `${s.lat},${s.lng}`)).size, 10);
});
