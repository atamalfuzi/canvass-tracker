const { test } = require('node:test');
const assert = require('node:assert/strict');
const { responses, groups, routes } = require('../demo/data.json');

const people = [...responses, ...groups.flatMap(g => g.rows)];

test('demo contact details are the reserved fake kind', () => {
    for (const row of responses) {
        assert.match(row.phone, /^(604-555-01\d\d)?$/, row.phone);
        assert.match(row.email, /^([a-z.]+@example\.com)?$/, row.email);
    }
    assert.ok(people.every(row => row.postalCode === ''), 'no real postal codes');
});

test('every demo door and group row has coordinates inside Coquitlam', () => {
    for (const row of people) {
        assert.ok(row.latitude > 49.22 && row.latitude < 49.32, `${row.streetAddress} latitude ${row.latitude}`);
        assert.ok(row.longitude > -122.90 && row.longitude < -122.72, `${row.streetAddress} longitude ${row.longitude}`);
    }
});

test('saved demo routes point at doors that exist', () => {
    const keys = new Set(responses.map(r => [r.streetAddress, r.unitNumber, r.postalCode, r.routeArea].join('|').toLowerCase()));
    for (const route of routes) {
        assert.ok(route.targets.length > 0, route.routeName);
        for (const target of route.targets) assert.ok(keys.has(target.key), target.key);
    }
});
