![Extension-Speech-Recognition](banner.png)

# Extension-Speech-Recognition

A SillyTavern extension that converts speech to text. It descends from the
upstream SillyTavern speech recognition extension (see the credits below);
this copy carries local changes to the Browser provider, described under
Local changes.

Documentation: <https://docs.sillytavern.app/extensions/speech-recognition/>

## Providers

Selected in the extension settings in SillyTavern:

- Browser: the Web Speech API (`SpeechRecognition` /
  `webkitSpeechRecognition`) in Chromium based browsers, no server needed.
- Whisper (OpenAI), Whisper (Extras), Whisper (Local), KoboldCpp, and Vosk:
  microphone audio is recorded in the browser and sent to the configured
  transcription backend.
- Streaming: continuous transcription through a streaming backend, with
  optional trigger words and message mapping.

Message modes (append, replace, auto send), message mapping, push to talk,
and voice activation are configured in the same settings panel.

## Local changes

The Browser provider in this copy differs from upstream:

- Voice activation mode keeps recognition running: a heartbeat restarts it
  if it stops, ending a session processes any pending final transcript
  before the restart, and switching the provider off clears the heartbeat.
- Reloading the provider settings (for example on a language change) stops
  the previous heartbeat instead of leaking it.
- Provider settings are loaded as a copy of the defaults, so a reload
  restores the default language instead of keeping the previous one.
- The microphone icon is set to an explicit active or inactive state
  instead of being toggled, so the duplicate start signals (click handler
  and `onstart`) no longer cancel each other out.

## Verified behavior

All JavaScript files pass a Node module parse check. The Browser provider
is covered by a persistent Node test suite in test/ (11 tests) that runs
browser.js and the mic icon helpers from index.js against a stub
SillyTavern host: settings loading and defaults, heartbeat cleanup on
reload and on provider cleanup, the voice activation transcript paths,
manual click sessions, error handling, and the transcript shaping
helpers. Run it with Node 20 or newer:

    node --test test/browser-provider.test.mjs

A running SillyTavern instance and a real microphone were not available
in the test environment, so live transcription itself was not exercised.

## License and credits

GPLv3

vad.js by [kdavis-mozilla](https://github.com/kdavis-mozilla) is from <https://github.com/kdavis-mozilla/vad.js> (BSD-3-Clause).
