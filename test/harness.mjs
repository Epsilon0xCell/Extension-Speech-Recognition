// Shared test harness: installs a stub SillyTavern host around the
// repo's real extension files and hands the test the recorded seams.
//
// The extension files are copied into a fake host tree because their
// imports are relative paths out of the extensions folder; the stubs
// under host/ stand in for the host modules at exactly those relative
// positions. Each test process gets its own tree copy (test files run
// in parallel processes). Set STT_SRC_DIR to a directory holding
// another copy of the extension files to run the suite against it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(here);
const EXT_FILES = ['index.js', 'browser.js', 'vosk.js', 'whisper-extras.js', 'whisper-openai.js', 'whisper-local.js', 'streaming.js', 'koboldcpp.js', 'vad.js'];

const treeRoot = path.join(here, `.host-${process.pid}`);
const treeExtDir = path.join(treeRoot, 'scripts', 'extensions', 'third-party', 'SpeechRecognition');

export function copyExtensionSource() {
    fs.cpSync(path.join(here, 'host'), treeRoot, { recursive: true });
    process.on('exit', () => fs.rmSync(treeRoot, { recursive: true, force: true }));
    const srcDir = process.env.STT_SRC_DIR || repoRoot;
    for (const f of EXT_FILES) fs.copyFileSync(path.join(srcDir, f), path.join(treeExtDir, f));
}

export class FakeEl {
    constructor(name) {
        this.name = name;
        this._val = '';
        this._checked = false;
        this._hidden = false;
        this._title = '';
        this.classes = new Set();
        this.handlers = new Map();
        this.length = 0;
    }
    get checked() { return this._checked; }
    set checked(v) { this._checked = v; }
    on(event, fn) { this.handlers.set(event, fn); return this; }
    off(event) { if (event) this.handlers.delete(event); else this.handlers.clear(); return this; }
    ready(fn) { readyCallbacks.push(fn); return this; }
    val(v) { if (v === undefined) return this._val; this._val = v; return this; }
    is(sel) { return sel === ':checked' ? this._checked : false; }
    prop(k, v) {
        if (v === undefined) return k === 'checked' ? this._checked : k === 'title' ? this._title : undefined;
        if (k === 'checked') this._checked = v;
        if (k === 'title') this._title = v;
        return this;
    }
    addClass(c) { this.classes.add(c); return this; }
    removeClass(c) { this.classes.delete(c); return this; }
    hide() { this._hidden = true; return this; }
    show() { this._hidden = false; return this; }
    find() { return this; }
    prepend() { return this; }
    append() { return this; }
    html() { return this; }
    text() { return ''; }
}

const readyCallbacks = [];

export class FakeRecognition {
    static instances = [];
    constructor() {
        this.startCount = 0;
        this.stopCount = 0;
        this.failStart = false;
        this.continuous = false;
        this.interimResults = false;
        this.lang = '';
        FakeRecognition.instances.push(this);
    }
    start() {
        if (this.failStart) throw new Error('start failed (test flag)');
        this.startCount++;
    }
    stop() { this.stopCount++; }
}

export function installGlobals() {
    const registry = new Map();
    const elFor = (name) => {
        if (!registry.has(name)) registry.set(name, new FakeEl(name));
        return registry.get(name);
    };
    function $(arg) {
        if (typeof arg === 'string') return elFor(arg);
        if (arg && typeof arg === 'object') return elFor(arg.__name || 'object');
        return elFor('unknown');
    }

    const toastrCalls = [];
    const intervals = new Map();
    const clearedIntervals = [];
    let nextIntervalId = 1;

    globalThis.$ = $;
    globalThis.document = { __name: 'document', body: { addEventListener() {} } };
    globalThis.window = {};
    globalThis.toastr = {
        error: (m) => toastrCalls.push(['error', m]),
        warning: (m) => toastrCalls.push(['warning', m]),
        info: (m) => toastrCalls.push(['info', m]),
        success: (m) => toastrCalls.push(['success', m]),
    };
    globalThis.setInterval = (fn, ms) => { const id = nextIntervalId++; intervals.set(id, { fn, ms }); return id; };
    globalThis.clearInterval = (id) => { clearedIntervals.push(id); intervals.delete(id); };
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...args) => { const t = realSetTimeout(fn, ms, ...args); t.unref?.(); return t; };
    console.debug = () => {};

    return {
        $, elFor, registry, toastrCalls, intervals, clearedIntervals,
        tick(id) { intervals.get(id)?.fn(); },
        liveIntervalIds() { return [...intervals.keys()]; },
    };
}

export async function importExtension() {
    const index = await import(pathToFileURL(path.join(treeExtDir, 'index.js')).href);
    const browser = await import(pathToFileURL(path.join(treeExtDir, 'browser.js')).href);
    return { index, BrowserSttProvider: browser.BrowserSttProvider };
}

export function resultEvent(entries, resultIndex = 0) {
    return {
        resultIndex,
        results: entries.map(([transcript, isFinal]) => {
            const alt = [{ transcript }];
            alt.isFinal = isFinal;
            return alt;
        }),
    };
}
