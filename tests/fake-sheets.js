// In-memory stand-ins for the Apps Script services backend/Code.gs uses, so the backend runs under Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name, id) {
    const sheet = {
        name, id, rows: [],
        getName: () => sheet.name,
        getSheetId: () => sheet.id,
        getLastRow: () => {
            for (let r = sheet.rows.length; r > 0; r--) if (sheet.rows[r - 1].some(v => v !== '')) return r;
            return 0;
        },
        getLastColumn: () => Math.max(0, ...sheet.rows.map(row => {
            for (let c = row.length; c > 0; c--) if (row[c - 1] !== '') return c;
            return 0;
        })),
        cell: (r, c) => (sheet.rows[r - 1] || [])[c - 1] ?? '',
        put: (r, c, v) => {
            while (sheet.rows.length < r) sheet.rows.push([]);
            const row = sheet.rows[r - 1];
            while (row.length < c) row.push('');
            row[c - 1] = v;
        },
        fill: rows => rows.forEach((row, i) => row.forEach((v, j) => sheet.put(i + 1, j + 1, v))),
        getRange: (r, c, nr = 1, nc = 1) => ({
            getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.cell(r + i, c + j))),
            setValues: values => {
                if (values.length !== nr || values.some(v => v.length !== nc)) throw new Error('setValues size mismatch');
                values.forEach((row, i) => row.forEach((v, j) => sheet.put(r + i, c + j, v)));
            },
            clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sheet.put(r + i, c + j, ''); }
        }),
        appendRow: values => { const r = sheet.getLastRow() + 1; values.forEach((v, j) => sheet.put(r, j + 1, v)); },
        deleteRow: r => { sheet.rows.splice(r - 1, 1); },
        setFrozenRows: () => {},
        autoResizeColumns: () => {}
    };
    return sheet;
}

// geocodes maps an address string to { lat, lng }; anything else geocodes to nothing.
function loadBackend({ adminKey = null, geocodes = {} } = {}) {
    let nextId = 1;
    let uuid = 0;
    const sheets = [];
    const spreadsheet = {
        getSheetByName: name => sheets.find(s => s.name === name) || null,
        insertSheet: name => { const s = makeSheet(name, nextId++); sheets.push(s); return s; },
        getSheets: () => sheets.slice()
    };
    const geocoded = [];
    let beforeGeocode = () => {};
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-06-10T12:00:00Z'])); }
    }
    const ctx = {
        Date: FixedDate,
        SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
        Maps: {
            newGeocoder: () => ({
                setRegion() { return this; },
                geocode: address => {
                    geocoded.push(address);
                    beforeGeocode(address);
                    const hit = geocodes[address];
                    return { results: hit ? [{ geometry: { location: hit }, formatted_address: address }] : [] };
                }
            })
        },
        Utilities: { sleep() {}, getUuid: () => 'uuid-' + (++uuid) },
        PropertiesService: { getScriptProperties: () => ({ getProperty: key => (key === 'ADMIN_KEY' ? adminKey : null) }) }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

    const call = (method, parameter) => JSON.parse(ctx[method === 'POST' ? 'doPost' : 'doGet']({ parameter }).text);
    return {
        get: parameter => call('GET', parameter),
        post: parameter => call('POST', parameter),
        sheet: name => spreadsheet.getSheetByName(name),
        addSheet: (name, rows = []) => { const s = spreadsheet.insertSheet(name); s.fill(rows); return s; },
        sheetNames: () => sheets.map(s => s.name),
        geocoded,
        onGeocode: fn => { beforeGeocode = fn; }
    };
}

module.exports = { loadBackend };
