// Safe to import under plain node: the only top-level import of
// node-global-key-listener is `import type` (erased), and the value is loaded
// lazily via dynamic import inside start(). resolveMainKey is pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMainKey } from './hotkey-manager.ts';

test('resolveMainKey maps the trailing letter of an accelerator', () => {
  assert.equal(resolveMainKey('CommandOrControl+Alt+A'), 'A');
  assert.equal(resolveMainKey('Cmd+Shift+z'), 'Z'); // upper-cased identity
  assert.equal(resolveMainKey('Ctrl+F5'), 'F5');
});

test('resolveMainKey maps Space to the SPACE key name', () => {
  assert.equal(resolveMainKey('CommandOrControl+Alt+Space'), 'SPACE');
});

test('resolveMainKey returns null for modifier-only or empty input', () => {
  assert.equal(resolveMainKey(''), null);
  assert.equal(resolveMainKey('Ctrl+Shift'), null); // last token is a modifier
  assert.equal(resolveMainKey('Cmd'), null); // bare modifier
});
