// Backend for door-knocker.html and analysis.html.
// Deploy as a web app: Execute as me, Who has access: Anyone.
// Anyone with the URL can add door-knocker responses. Every other action needs the admin key,
// set as the ADMIN_KEY script property (Project Settings > Script properties).

const CANVASS_SHEET_NAME = 'Canvass Responses';
const ADDRESS_TEMPLATE_SHEET_NAME = 'Address List Template';
const SAVED_ROUTES_SHEET_NAME = 'Saved Routes';
const SAVED_ROUTE_HEADERS = [
  'Route ID', 'Route Name', 'Assigned To', 'Route Date', 'Created At', 'Targets JSON'
];
const ADDRESS_LIST_HEADERS = [
  'First Name', 'Last Name', 'Street Address', 'City', 'Province', 'Postal Code',
  'Latitude', 'Longitude'
];
const CANONICAL_HEADERS = [
  'Timestamp', 'Street Address', 'Unit Number', 'Postal Code', 'Route / Area', 'Support Level',
  'Main Issue Discussed', 'Follow-up Needed?', 'First Name', 'Last Name', 'Email', 'Phone',
  'Lawn Sign', 'Contacted', 'Notes', 'Map Address', 'Latitude', 'Longitude', 'Door ID'
];

const ACTIONS = {
  getAllData,
  geocodeAddress: geocodeSingleAddress,
  getAddressGroups,
  getAddressGroup,
  geocodeAddressGroup,
  getSavedRoutes,
  saveRoute,
  deleteSavedRoute
};

function doGet(e) {
  return handle(e, ACTIONS);
}

function doPost(e) {
  return handle(e, { ...ACTIONS, addDoor: addDoorRecord });
}

function handle(e, actions) {
  try {
    const action = e.parameter.action;
    if (!Object.prototype.hasOwnProperty.call(actions, action)) return jsonResponse(false, 'Invalid action');
    if (action !== 'addDoor' && e.parameter.key !== PropertiesService.getScriptProperties().getProperty('ADMIN_KEY')) {
      return jsonResponse(false, 'Missing or wrong admin key.');
    }
    return actions[action](e);
  } catch (error) {
    return jsonResponse(false, error.toString());
  }
}

function jsonResponse(success, dataOrError) {
  const response = { success, ...(success ? { data: dataOrError } : { error: dataOrError }) };
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function addDoorRecord(e) {
  // The door knocker sends each column under its camelCase header name, e.g. streetAddress.
  const newRow = CANONICAL_HEADERS.map(header => e.parameter[toCamelCase(header)] || '');
  if (!newRow[0]) newRow[0] = new Date().toISOString();
  getCanvassSheet().appendRow(newRow);
  
  return jsonResponse(true, {
    message: 'Saved: ' + (e.parameter.doorId || e.parameter.streetAddress),
    doorId: e.parameter.doorId || e.parameter.streetAddress
  });
}

function getAllData() {
  const sheet = getCanvassSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    return jsonResponse(true, []);
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dataRows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  const records = dataRows.map(row => {
    const record = {};
    headers.forEach((header, index) => {
      record[toCamelCase(header)] = row[index];
    });
    return record;
  });
  
  return jsonResponse(true, records);
}

function geocodeSingleAddress(e) {
  const query = String((e.parameter && e.parameter.q) || '').trim();
  if (!query) return jsonResponse(false, 'Missing address.');

  const point = geocode(Maps.newGeocoder().setRegion('ca'), query);
  if (!point) return jsonResponse(false, 'Address could not be geocoded.');
  return jsonResponse(true, { ...point, formattedAddress: point.formattedAddress || query });
}

function geocode(geocoder, address) {
  const result = geocoder.geocode(address);
  const match = result && result.results && result.results[0];
  const location = match && match.geometry && match.geometry.location;
  if (!location || !location.lat || !location.lng) return null;
  return { lat: location.lat, lng: location.lng, formattedAddress: match.formatted_address };
}

function getCanvassSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CANVASS_SHEET_NAME) || spreadsheet.insertSheet(CANVASS_SHEET_NAME);
  ensureCanonicalSheet(sheet);
  return sheet;
}

function setupAddressTemplate() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ADDRESS_TEMPLATE_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(ADDRESS_TEMPLATE_SHEET_NAME);

  const headerWidth = Math.max(sheet.getLastColumn(), ADDRESS_LIST_HEADERS.length);
  sheet.getRange(1, 1, 1, headerWidth).clearContent();
  sheet.getRange(1, 1, 1, ADDRESS_LIST_HEADERS.length).setValues([ADDRESS_LIST_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, ADDRESS_LIST_HEADERS.length);
}

function getSavedRoutesSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SAVED_ROUTES_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SAVED_ROUTES_SHEET_NAME);
  sheet.getRange(1, 1, 1, SAVED_ROUTE_HEADERS.length).setValues([SAVED_ROUTE_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getAddressGroups() {
  setupAddressTemplate();
  const groups = SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .filter(isAddressGroupSheet)
    .map(sheet => ({
      name: sheet.getName(),
      rowCount: Math.max(0, sheet.getLastRow() - 1)
    }));

  return jsonResponse(true, groups);
}

function isAddressGroupSheet(sheet) {
  return ![CANVASS_SHEET_NAME, ADDRESS_TEMPLATE_SHEET_NAME, SAVED_ROUTES_SHEET_NAME].includes(sheet.getName());
}

function getAddressGroupSheet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(String(e.parameter.sheet || '').trim());
  return sheet && isAddressGroupSheet(sheet) ? sheet : null;
}

function getAddressGroup(e) {
  const sheet = getAddressGroupSheet(e);
  if (!sheet) return jsonResponse(false, 'Address group sheet not found.');

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn === 0) return jsonResponse(true, []);

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(toCamelCase);
  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const records = rows.map((row, index) => {
    const record = { sheetName: sheet.getName(), sheetRow: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (header) record[header] = row[columnIndex];
    });
    return record;
  }).filter(record => record.streetAddress || (record.latitude && record.longitude));

  return jsonResponse(true, records);
}

function geocodeAddressGroup(e) {
  const sheet = getAddressGroupSheet(e);
  if (!sheet) return jsonResponse(false, 'Address group sheet not found.');

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn === 0) return jsonResponse(true, { updated: 0, skipped: 0, failed: 0 });

  const limit = Math.max(1, Math.min(Number(e.parameter.limit || 50), 100));
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const column = {};
  headers.forEach((header, index) => {
    column[toCamelCase(header)] = index;
  });
  if (column.latitude === undefined || column.longitude === undefined || column.streetAddress === undefined) {
    return jsonResponse(false, 'This tab does not match the Address List Template columns.');
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const geocoder = Maps.newGeocoder().setRegion('ca');
  const postalCodeColumn = column.postalCode !== undefined ? column.postalCode : column.zipCode;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  rows.forEach(row => {
    if (updated >= limit) return;
    if ((row[column.latitude] && row[column.longitude]) || !row[column.streetAddress]) {
      skipped++;
      return;
    }
    const address = [
      row[column.streetAddress],
      row[column.city],
      row[column.province],
      postalCodeColumn !== undefined ? row[postalCodeColumn] : '',
      'Canada'
    ].filter(Boolean).join(', ');
    try {
      const point = geocode(geocoder, address);
      if (point) {
        row[column.latitude] = point.lat;
        row[column.longitude] = point.lng;
        updated++;
        Utilities.sleep(250);
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
    }
  });

  // Write back only the coordinate columns, so edits made elsewhere in the tab while this ran survive.
  sheet.getRange(2, column.latitude + 1, rows.length, 1).setValues(rows.map(row => [row[column.latitude]]));
  sheet.getRange(2, column.longitude + 1, rows.length, 1).setValues(rows.map(row => [row[column.longitude]]));
  return jsonResponse(true, { sheetName: sheet.getName(), updated, skipped, failed, limit });
}

function saveRoute(e) {
  const routeName = String(e.parameter.routeName || '').trim();
  const assignedTo = String(e.parameter.assignedTo || '').trim();
  const routeDate = String(e.parameter.routeDate || '').trim();
  const targetsJson = String(e.parameter.targetsJson || '[]');
  let targets;
  try {
    targets = JSON.parse(targetsJson);
  } catch (error) {
    return jsonResponse(false, 'Route targets could not be parsed.');
  }
  if (!routeName) return jsonResponse(false, 'Route name is required.');
  if (!Array.isArray(targets) || targets.length === 0) return jsonResponse(false, 'Select at least one walking-list target.');

  const sheet = getSavedRoutesSheet();
  const routeId = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sheet.appendRow([routeId, routeName, assignedTo, routeDate, createdAt, JSON.stringify(targets)]);
  return jsonResponse(true, { routeId, routeName, assignedTo, routeDate, createdAt, targets });
}

function getSavedRoutes() {
  const sheet = getSavedRoutesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse(true, []);

  const rows = sheet.getRange(2, 1, lastRow - 1, SAVED_ROUTE_HEADERS.length).getValues();
  const routes = rows.map(row => {
    let targets = [];
    try {
      targets = JSON.parse(row[5] || '[]');
    } catch (error) {
      targets = [];
    }
    return {
      routeId: row[0],
      routeName: row[1],
      assignedTo: row[2],
      routeDate: row[3],
      createdAt: row[4],
      targets
    };
  }).filter(route => route.routeId);
  return jsonResponse(true, routes);
}

function deleteSavedRoute(e) {
  const routeId = String(e.parameter.routeId || '').trim();
  if (!routeId) return jsonResponse(false, 'Route ID is required.');

  const sheet = getSavedRoutesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse(false, 'Saved route not found.');

  const routeIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const index = routeIds.findIndex(row => String(row[0]) === routeId);
  if (index < 0) return jsonResponse(false, 'Saved route not found.');

  sheet.deleteRow(index + 2);
  return jsonResponse(true, { routeId });
}

function toCamelCase(str) {
  return str
    .split(/[\s\-_?]+/)  // Split on spaces, dashes, underscores, question marks
    .map((word, index) => {
      if (index === 0) return word.toLowerCase();  // First word: lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();  // Other words: capitalize first letter
    })
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');  // Remove any remaining special characters
}

function ensureCanonicalSheet(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CANONICAL_HEADERS.length).setValues([CANONICAL_HEADERS]);
    return;
  }
  const headers = sheet.getRange(1, 1, 1, CANONICAL_HEADERS.length).getValues()[0].map(value => String(value).trim());
  if (headers.join('|') !== CANONICAL_HEADERS.join('|')) {
    throw new Error(`Row 1 of ${CANVASS_SHEET_NAME} doesn't match the expected headers. Fix the headers in the Sheet and try again.`);
  }
}
