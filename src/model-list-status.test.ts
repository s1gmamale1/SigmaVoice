import test from 'node:test';
import assert from 'node:assert/strict';
import { toModelListItem } from './model-list-status.ts';

const model = { id: 'small.en-q5_1', name: 'Small', sizeMb: 182, isDefault: false };

test('toModelListItem does not mark a selected missing model active', () => {
  assert.deepEqual(toModelListItem(model, 'small.en-q5_1', false, false), {
    id: 'small.en-q5_1',
    name: 'Small',
    sizeMb: 182,
    isDefault: false,
    downloaded: false,
    downloading: false,
    active: false,
  });
});

test('toModelListItem marks a model active only when selected and downloaded', () => {
  assert.equal(toModelListItem(model, 'small.en-q5_1', true, false).active, true);
  assert.equal(toModelListItem(model, 'other', true, false).active, false);
});
