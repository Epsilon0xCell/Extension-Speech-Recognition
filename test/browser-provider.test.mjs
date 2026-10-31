// Behavioral tests for the Browser speech recognition provider
// (browser.js) and the mic icon helpers in index.js, driven through a
// stub SillyTavern host (see harness.mjs). Run with: node --test
// The suite runs against the repo's own files; set STT_SRC_DIR to a
// directory holding another copy of them to run it against that copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyExtensionSource, installGlobals, importExtension, FakeEl, FakeRecognition, resultEvent } from './harness.mjs';

copyExtensionSource();
const host = installGlobals();
const { index, BrowserSttProvider } = await importExtension();

const VA_BOX = '#speech_recognition_voice_activation_enabled';
const LANG_SELECT = '#speech_recognition_browser_provider_language';
const TEXTAREA = '#send_textarea';
const BUTTON = '#microphone_button';

function freshProvider({ voiceActivation = false, supported = true } = {}) {
    FakeRecognition.instances = [];
    host.intervals.clear();
    host.clearedIntervals.length = 0;
    host.toastrCalls.length = 0;
    host.elFor(VA_BOX)._checked = voiceActivation;
    host.elFor(TEXTAREA)._val = '';
    host.elFor(BUTTON)._hidden = false;
    globalThis.window.SpeechRecognition = supported ? FakeRecognition : undefined;
    const provider = new BrowserSttProvider();
    const processed = [];
    provider.processTranscriptFunction = (t) => processed.push(t);
    return { provider, processed };
}

test('mic icon helpers set state instead of toggling it', () => {
    const btn = new FakeEl('btn');
    index.activateMicIcon(btn);
    index.activateMicIcon(btn);
    assert.ok(btn.classes.has('fa-microphone-slash'));
    assert.ok(!btn.classes.has('fa-microphone'));
    assert.equal(btn._title, 'Click to end and transcribe');
    index.deactivateMicIcon(btn);
    index.deactivateMicIcon(btn);
    assert.ok(btn.classes.has('fa-microphone'));
    assert.ok(!btn.classes.has('fa-microphone-slash'));
    assert.equal(btn._title, 'Click to speak');
});

test('settings load as a copy: mutating them never rewrites the defaults', () => {
    const { provider } = freshProvider();
    provider.loadSettings({});
    assert.equal(provider.settings.language, 'en-US');
    provider.settings.language = 'xx-XX';
    assert.equal(provider.defaultSettings.language, 'en-US');
    provider.loadSettings({});
    assert.equal(provider.settings.language, 'en-US', 'a reload restores the default');
});

test('a settings value reaches the recognition object and the language select', () => {
    const { provider } = freshProvider();
    provider.loadSettings({ language: 'de-DE' });
    assert.equal(FakeRecognition.instances[0].lang, 'de-DE');
    assert.equal(host.elFor(LANG_SELECT)._val, 'de-DE');
});

test('an unknown setting key is rejected', () => {
    const { provider } = freshProvider();
    let caught;
    try { provider.loadSettings({ bogus: 1 }); } catch (e) { caught = e; }
    assert.ok(String(caught).includes('Invalid setting'));
});

test('reloading settings stops the previous heartbeat and stacks no handlers', () => {
    const { provider } = freshProvider({ voiceActivation: true });
    provider.loadSettings({});
    assert.equal(host.liveIntervalIds().length, 1);
    const firstId = host.liveIntervalIds()[0];
    assert.equal(FakeRecognition.instances[0].startCount, 1, 'voice activation starts recognition');

    provider.loadSettings({});
    assert.ok(host.clearedIntervals.includes(firstId), 'the first heartbeat was cleared by the reload');
    assert.equal(host.liveIntervalIds().length, 1, 'exactly one heartbeat is alive');
    assert.equal(host.elFor(VA_BOX).handlers.size, 1, 'the checkbox keeps exactly one change handler');
    assert.equal(FakeRecognition.instances.length, 2, 'each load builds a fresh recognition object');

    provider.cleanup();
    assert.equal(host.liveIntervalIds().length, 0, 'cleanup stops the live heartbeat');
});

test('a final result bundled with interim text is held, then delivered once at end', () => {
    const { provider, processed } = freshProvider({ voiceActivation: true });
    provider.loadSettings({});
    const rec = FakeRecognition.instances[0];
    rec.onstart();
    rec.onresult(resultEvent([[' hello world', true], [' more', false]]));
    assert.deepEqual(processed, [], 'nothing is sent while interim text is still arriving');
    rec.onend();
    assert.deepEqual(processed, ['Hello world.'], 'the held transcript is delivered at end');
    assert.equal(rec.startCount, 2, 'voice activation restarts recognition');
    rec.onend();
    assert.deepEqual(processed, ['Hello world.'], 'the transcript is not delivered twice');
});

test('a clean final result in voice activation mode is processed without stopping', () => {
    const { provider, processed } = freshProvider({ voiceActivation: true });
    provider.loadSettings({});
    const rec = FakeRecognition.instances[0];
    rec.onstart();
    rec.onresult(resultEvent([[' quick note', true]]));
    assert.deepEqual(processed, ['Quick note.']);
    assert.equal(rec.stopCount, 0, 'recognition keeps running in voice activation mode');
});

test('manual mode: click starts, a final result stops, end delivers the transcript', () => {
    const { provider, processed } = freshProvider({ voiceActivation: false });
    provider.loadSettings({});
    const rec = FakeRecognition.instances[0];
    assert.equal(rec.startCount, 0, 'nothing starts on its own in manual mode');
    assert.equal(host.liveIntervalIds().length, 0, 'manual sessions get no heartbeat');

    const click = host.elFor(BUTTON).handlers.get('click');
    click.call(host.elFor(BUTTON));
    assert.equal(rec.startCount, 1);
    rec.onstart();
    rec.onresult(resultEvent([[' test message', true]]));
    assert.equal(rec.stopCount, 1, 'the final result stops the manual session');
    assert.deepEqual(processed, [], 'sending waits for the stop to land');
    rec.onend();
    assert.deepEqual(processed, ['Test message.']);
    assert.ok(host.elFor(BUTTON).classes.has('fa-microphone'), 'the icon is back to idle');
});

test('no-speech errors leave the session alone; other errors hand restart to the heartbeat', () => {
    const { provider } = freshProvider({ voiceActivation: true });
    provider.loadSettings({});
    const rec = FakeRecognition.instances[0];
    const heartbeatId = host.liveIntervalIds()[0];
    rec.onerror({ error: 'no-speech' });
    host.tick(heartbeatId);
    assert.equal(rec.startCount, 1, 'silence does not trigger a second recognition');
    rec.onerror({ error: 'network' });
    host.tick(heartbeatId);
    assert.equal(rec.startCount, 2, 'a real error lets the heartbeat restart the session');
});

test('an unsupported browser hides the button and reports the failure', () => {
    const { provider } = freshProvider({ supported: false });
    provider.loadSettings({});
    assert.equal(host.elFor(BUTTON)._hidden, true);
    assert.ok(host.toastrCalls.some(([kind]) => kind === 'error'));
    assert.equal(host.liveIntervalIds().length, 0);
});

test('capitalizeInterim and composeValues follow the documented shaping', () => {
    assert.equal(BrowserSttProvider.capitalizeInterim(''), '');
    assert.equal(BrowserSttProvider.capitalizeInterim('a'), 'a');
    assert.equal(BrowserSttProvider.capitalizeInterim('ab'), 'Ab');
    assert.equal(BrowserSttProvider.capitalizeInterim(' abc'), 'Abc');
    assert.equal(BrowserSttProvider.capitalizeInterim('a b'), 'A b');
    assert.equal(BrowserSttProvider.composeValues('Hi.', 'there'), 'Hi. there');
    assert.equal(BrowserSttProvider.composeValues('Hi', 'there'), 'Hithere');
    assert.equal(BrowserSttProvider.composeValues('', 'x'), 'x');
});
