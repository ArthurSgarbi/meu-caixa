import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPreferences,
  parsePreferences,
  formatPreferenceMoney,
} from '../lib/user-preferences.ts';

test('preference validation accepts each supported theme and landing area', () => {
  for (const theme of ['dark', 'light', 'system']) {
    for (const defaultArea of [
      'expenses',
      'investments',
      'credit-cards',
      'simulations',
      'assistant',
    ]) {
      const input = { ...defaultPreferences, theme, defaultArea };
      assert.deepEqual(parsePreferences(input), input);
      assert.notEqual(parsePreferences(input), input);
    }
  }
});

test('discreet formatter does not expose positive, negative or zero amounts', () => {
  for (const cents of [0, 12345, -98765])
    assert.equal(formatPreferenceMoney(cents, true), '••••••');
  assert.match(formatPreferenceMoney(12345, false), /123,45/);
  assert.match(formatPreferenceMoney(-98765, false), /987,65/);
});
