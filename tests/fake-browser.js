// Runs a page's scripts (shared.js, then the page's own <script>) against a stub DOM.
// Pass `backend` to stand in for the Apps Script web app; leave it out to run the built-in demo.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TEST_URL = 'https://script.test/exec';

function makeElement(tag = 'div') {
    const el = {
        tagName: tag, innerHTML: '', textContent: '', value: '', checked: false, title: '', className: '', disabled: false,
        style: {}, rows: [], options: [], attributes: {}, download: '', href: '', listeners: {},
        classList: {
            set: new Set(),
            add(c) { this.set.add(c); },
            remove(c) { this.set.delete(c); },
            toggle(c) { return this.set.has(c) ? (this.set.delete(c), false) : (this.set.add(c), true); }
        },
        setAttribute(k, v) { el.attributes[k] = v; },
        getAttribute(k) { return el.attributes[k] ?? null; },
        appendChild(child) { el.rows.push(child); },
        add(option) { el.options.push(option); },
        addEventListener(type, fn) { el.listeners[type] = fn; },
        querySelector: () => makeElement(),
        querySelectorAll: () => [],
        getContext: () => ({}),
        reset() {},
        focus() {},
        click() {}
    };
    return el;
}

function load(page, { backend, hash = '', storage = {} } = {}) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const pageScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
    let shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
    if (backend) shared = shared.replace("const WEBAPP_URL = '';", `const WEBAPP_URL = '${TEST_URL}';`);

    const elements = {};
    const log = { requests: [], downloads: [], alerts: [], opened: [] };
    const blobs = {};
    const document = {
        addEventListener() {},
        getElementById: id => (elements[id] ||= makeElement()),
        createElement: tag => {
            const el = makeElement(tag);
            if (tag === 'a') el.click = () => log.downloads.push({ name: el.download, csv: blobs[el.href] });
            return el;
        },
        querySelector: () => makeElement(),
        querySelectorAll: () => []
    };

    const layer = () => ({ items: [], addTo() { return this; }, clearLayers() { this.items = []; } });
    const L = {
        map: () => ({ setView() { return this; }, fitBounds() { return this; }, invalidateSize() {}, getSize: () => ({ x: 0, y: 0 }) }),
        tileLayer: () => ({ addTo() { return this; } }),
        layerGroup: layer,
        divIcon: options => options,
        marker: (at, options) => ({ at, icon: options.icon, bindPopup(html) { this.popup = html; return this; }, addTo(l) { l.items.push(this); return this; } }),
        circle: (at, options) => ({ at, options, addTo(l) { l.items.push(this); return this; } })
    };

    async function fetch(url, options = {}) {
        url = String(url);
        const method = options.method || 'GET';
        const params = Object.fromEntries(new URLSearchParams(options.body ? String(options.body) : url.split('?')[1] || ''));
        log.requests.push({ method, url: url.split('?')[0], params });
        let result;
        if (url === 'demo/data.json') result = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo', 'data.json'), 'utf8'));
        else if (url.startsWith(TEST_URL)) result = backend(params, method);
        else throw new TypeError('Failed to fetch');
        return { json: async () => structuredClone(result) };
    }

    let blobId = 0;
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        document,
        window: { open: (...args) => log.opened.push(args) },
        location: { hash },
        localStorage: {
            getItem: k => (k in storage ? storage[k] : null),
            setItem: (k, v) => { storage[k] = String(v); },
            removeItem: k => { delete storage[k]; }
        },
        fetch, L,
        Chart: class { constructor(_, config) { log.charts = (log.charts || []).concat([config.data]); } destroy() {} },
        Option: class { constructor(text, value = text) { this.text = text; this.value = value; } },
        Blob: class { constructor(parts) { this.text = parts.join(''); } },
        URL: { createObjectURL: blob => { const id = 'blob:' + (++blobId); blobs[id] = blob.text; return id; }, revokeObjectURL() {} },
        confirm: () => true,
        alert: message => log.alerts.push(message),
        setTimeout: fn => { fn(); return 0; },
        structuredClone, URLSearchParams
    };
    vm.createContext(ctx);
    vm.runInContext(shared, ctx, { filename: 'shared.js' });
    vm.runInContext(pageScript + '\n;globalThis.page = typeof analytics !== "undefined" ? analytics : doorKnocker;', ctx, { filename: page });
    if (ctx.page.sleep) ctx.page.sleep = async () => {};
    return { page: ctx.page, ctx, elements, log, storage, el: id => document.getElementById(id) };
}

// Starts the dashboard and waits until its first load (data, routes, groups, map) is done.
async function openDashboard(options) {
    const browser = load('dashboard.html', options);
    let loading;
    const loadData = browser.page.loadData.bind(browser.page);
    browser.page.loadData = () => (loading = loadData());
    browser.page.init();
    await loading;
    return browser;
}

// Reads onclick/onchange attributes the way a browser does (up to the closing quote, entities decoded).
function inlineHandlers(html) {
    const decode = v => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return [...html.matchAll(/on(?:click|change)=(["'])([\s\S]*?)\1/g)].map(m => decode(m[2]));
}

// Runs one inline handler and returns the analytics calls it made.
function runHandler(handler) {
    const calls = [];
    const analytics = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
    new Function('analytics', 'event', handler).call({ value: '#000000' }, analytics, { stopPropagation() {} });
    return calls;
}

module.exports = { load, openDashboard, inlineHandlers, runHandler, TEST_URL };
