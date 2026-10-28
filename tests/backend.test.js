const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./fake-sheets');

const KEY = 'test-key';
const RESPONSE_HEADERS = ['Timestamp', 'Street Address', 'Unit Number', 'Postal Code', 'Route / Area', 'Support Level',
    'Main Issue Discussed', 'Follow-up Needed?', 'First Name', 'Last Name', 'Email', 'Phone',
    'Lawn Sign', 'Contacted', 'Notes', 'Map Address', 'Latitude', 'Longitude', 'Door ID'];
const GROUP_HEADERS = ['First Name', 'Last Name', 'Street Address', 'City', 'Province', 'Postal Code', 'Latitude', 'Longitude'];

const door = {
    action: 'addDoor', timestamp: '2026-06-01T17:00:00Z', streetAddress: '12 Amberlight Way', unitNumber: '4', postalCode: '',
    routeArea: '1 - Hillcrest', supportLevel: 'Undecided', mainIssueDiscussed: 'Housing; Transit', followUpNeeded: 'Yes',
    firstName: "Ann O'Neil", lastName: 'Lee', email: 'ann@example.com', phone: '604-555-0100', lawnSign: 'No', contacted: 'Yes',
    notes: 'Call after 6', mapAddress: '12 Amberlight Way, Coquitlam, BC', latitude: '', longitude: '', doorId: '12 Amberlight Way Unit 4'
};

test('a volunteer can add a door without the admin key, and it lands in column order', () => {
    const backend = loadBackend({ adminKey: KEY });
    assert.deepEqual(backend.post(door), { success: true, data: { message: 'Saved: 12 Amberlight Way Unit 4', doorId: '12 Amberlight Way Unit 4' } });
    const sheet = backend.sheet('Canvass Responses');
    assert.deepEqual(sheet.rows[0], RESPONSE_HEADERS);
    assert.deepEqual(sheet.rows[1], ['2026-06-01T17:00:00Z', '12 Amberlight Way', '4', '', '1 - Hillcrest', 'Undecided', 'Housing; Transit',
        'Yes', "Ann O'Neil", 'Lee', 'ann@example.com', '604-555-0100', 'No', 'Yes', 'Call after 6', '12 Amberlight Way, Coquitlam, BC', '', '', '12 Amberlight Way Unit 4']);
});

test('a missing timestamp is filled in by the server', () => {
    const backend = loadBackend({ adminKey: KEY });
    backend.post({ action: 'addDoor', streetAddress: '1 A St', doorId: '1 A St' });
    assert.equal(backend.sheet('Canvass Responses').rows[1][0], '2026-06-10T12:00:00.000Z');
});

test('everything except adding a door needs the admin key', () => {
    const refused = { success: false, error: 'Missing or wrong admin key.' };
    const backend = loadBackend({ adminKey: KEY });
    assert.deepEqual(backend.get({ action: 'getAllData' }), refused);
    assert.deepEqual(backend.get({ action: 'getAllData', key: 'guess' }), refused);
    assert.deepEqual(backend.post({ action: 'deleteSavedRoute', routeId: 'x' }), refused);
    assert.equal(backend.get({ action: 'getAllData', key: KEY }).success, true);

    const noKeySet = loadBackend({ adminKey: null });
    assert.deepEqual(noKeySet.get({ action: 'getAllData', key: '' }), refused);
    assert.equal(noKeySet.post({ action: 'addDoor', streetAddress: '1 A St' }).success, true);
});

test('unknown actions, inherited names and adding a door by GET are rejected', () => {
    const backend = loadBackend({ adminKey: KEY });
    for (const action of ['bogus', 'toString', 'constructor', '__proto__', undefined]) {
        assert.deepEqual(backend.get({ action, key: KEY }), { success: false, error: 'Invalid action' });
    }
    assert.deepEqual(backend.get({ ...door, key: KEY }), { success: false, error: 'Invalid action' });
});

test('responses come back keyed by camelCase header', () => {
    const backend = loadBackend({ adminKey: KEY });
    assert.deepEqual(backend.get({ action: 'getAllData', key: KEY }), { success: true, data: [] });
    backend.post(door);
    const [record] = backend.get({ action: 'getAllData', key: KEY }).data;
    assert.equal(record.streetAddress, '12 Amberlight Way');
    assert.equal(record.followUpNeeded, 'Yes');
    assert.equal(record.doorId, '12 Amberlight Way Unit 4');
});

test('a header renamed by hand stops reads and writes and changes nothing', () => {
    const backend = loadBackend({ adminKey: KEY });
    const sheet = backend.addSheet('Canvass Responses', [RESPONSE_HEADERS.map(h => (h === 'Notes' ? 'Note' : h)), RESPONSE_HEADERS.map((_, i) => 'v' + i)]);
    const before = JSON.stringify(sheet.rows);
    assert.match(backend.get({ action: 'getAllData', key: KEY }).error, /doesn't match the expected headers/);
    assert.match(backend.post(door).error, /doesn't match the expected headers/);
    assert.equal(JSON.stringify(sheet.rows), before);
});

test('an extra column after Door ID is kept and returned', () => {
    const backend = loadBackend({ adminKey: KEY });
    backend.addSheet('Canvass Responses', [[...RESPONSE_HEADERS, 'Volunteer'], [...RESPONSE_HEADERS.map((_, i) => 'v' + i), 'Sam']]);
    assert.equal(backend.get({ action: 'getAllData', key: KEY }).data[0].volunteer, 'Sam');
});

test('address groups are every tab except the three the app owns', () => {
    const backend = loadBackend({ adminKey: KEY });
    backend.get({ action: 'getAllData', key: KEY });
    backend.get({ action: 'getSavedRoutes', key: KEY });
    backend.addSheet("Mom's list", [GROUP_HEADERS, ['Ann', 'A', '1 Amberlight Way', 'Coquitlam', 'BC', '', 49.1, -122.1], [], ['', '', '', '', '', '', '', ''], ['Bo', '', '2 Amberlight Way']]);
    const groups = backend.get({ action: 'getAddressGroups', key: KEY });
    assert.deepEqual(groups.data, [{ name: "Mom's list", rowCount: 4 }]);
    assert.deepEqual(backend.sheetNames().sort(), ['Address List Template', 'Canvass Responses', "Mom's list", 'Saved Routes']);
    assert.deepEqual(backend.sheet('Address List Template').rows[0], GROUP_HEADERS);

    const rows = backend.get({ action: 'getAddressGroup', sheet: "Mom's list", key: KEY }).data;
    assert.deepEqual(rows.map(r => [r.sheetRow, r.firstName]), [[2, 'Ann'], [5, 'Bo']]);
    for (const reserved of ['Canvass Responses', 'Address List Template', 'Saved Routes', 'Nope', '']) {
        assert.deepEqual(backend.get({ action: 'getAddressGroup', sheet: reserved, key: KEY }), { success: false, error: 'Address group sheet not found.' });
    }
});

test('pre-geocoding fills only the coordinates, skips blank rows and keeps edits made meanwhile', () => {
    const backend = loadBackend({ adminKey: KEY, geocodes: { '1 Known St, Coquitlam, BC, Canada': { lat: 49.1, lng: -122.1 } } });
    const sheet = backend.addSheet('Leads', [
        GROUP_HEADERS,
        ['Ann', 'A', '1 Known St', 'Coquitlam', 'BC', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['Bob', 'B', '9 Other Rd', 'Coquitlam', 'BC', '', '', ''],
        ['Cy', 'C', '3 Done St', 'Coquitlam', 'BC', '', 49.3, -122.3]
    ]);
    // Someone types a postal code for Bob while the script is busy geocoding Ann.
    backend.onGeocode(() => sheet.put(4, 6, 'V3K 9Z9'));
    const result = backend.get({ action: 'geocodeAddressGroup', sheet: 'Leads', key: KEY });
    assert.deepEqual(result.data, { sheetName: 'Leads', updated: 1, skipped: 2, failed: 1, limit: 50 });
    assert.deepEqual([sheet.cell(2, 7), sheet.cell(2, 8)], [49.1, -122.1]);
    assert.deepEqual([sheet.cell(3, 7), sheet.cell(3, 8)], ['', '']);
    assert.equal(sheet.cell(4, 6), 'V3K 9Z9');
    assert.deepEqual(backend.geocoded, ['1 Known St, Coquitlam, BC, Canada', '9 Other Rd, Coquitlam, BC, Canada']);
});

test('pre-geocoding refuses a tab without the template columns', () => {
    const backend = loadBackend({ adminKey: KEY });
    backend.addSheet('Notes', [['Name', 'Comment'], ['Ann', 'hi']]);
    assert.deepEqual(backend.get({ action: 'geocodeAddressGroup', sheet: 'Notes', key: KEY }),
        { success: false, error: 'This tab does not match the Address List Template columns.' });
});

test('single addresses geocode through the Maps service', () => {
    const backend = loadBackend({ adminKey: KEY, geocodes: { '2 Known Ave': { lat: 49.2, lng: -122.2 } } });
    assert.deepEqual(backend.get({ action: 'geocodeAddress', q: '2 Known Ave', key: KEY }),
        { success: true, data: { lat: 49.2, lng: -122.2, formattedAddress: '2 Known Ave' } });
    assert.deepEqual(backend.get({ action: 'geocodeAddress', q: 'zzz', key: KEY }), { success: false, error: 'Address could not be geocoded.' });
    assert.deepEqual(backend.get({ action: 'geocodeAddress', q: ' ', key: KEY }), { success: false, error: 'Missing address.' });
});

test('saved routes can be saved, listed and deleted', () => {
    const backend = loadBackend({ adminKey: KEY });
    const targets = [{ key: 'k1', label: '12 Amberlight Way' }];
    const saved = backend.post({ action: 'saveRoute', routeName: 'Hillcrest', assignedTo: 'Sam', routeDate: '2026-06-05', targetsJson: JSON.stringify(targets), key: KEY });
    assert.deepEqual(saved.data, { routeId: 'uuid-1', routeName: 'Hillcrest', assignedTo: 'Sam', routeDate: '2026-06-05', createdAt: '2026-06-10T12:00:00.000Z', targets });
    assert.deepEqual(backend.get({ action: 'getSavedRoutes', key: KEY }).data, [saved.data]);

    assert.equal(backend.post({ action: 'saveRoute', routeName: 'x', targetsJson: '{', key: KEY }).error, 'Route targets could not be parsed.');
    assert.equal(backend.post({ action: 'saveRoute', routeName: ' ', targetsJson: '[1]', key: KEY }).error, 'Route name is required.');
    assert.equal(backend.post({ action: 'saveRoute', routeName: 'x', targetsJson: '[]', key: KEY }).error, 'Select at least one walking-list target.');

    assert.deepEqual(backend.post({ action: 'deleteSavedRoute', routeId: 'uuid-1', key: KEY }), { success: true, data: { routeId: 'uuid-1' } });
    assert.deepEqual(backend.post({ action: 'deleteSavedRoute', routeId: 'uuid-1', key: KEY }), { success: false, error: 'Saved route not found.' });
    assert.deepEqual(backend.get({ action: 'getSavedRoutes', key: KEY }).data, []);
});
