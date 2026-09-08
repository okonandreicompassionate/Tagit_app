/**
 * Covers the pure parts of the Snapchat integration. The network call in
 * `verifyHandle` isn't tested here — what's worth pinning down is the handle
 * rules and the display-name parser, since the parser reads an undocumented
 * page that will change shape eventually and must degrade quietly when it does.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanHandle,
  looksLikeHandle,
  parseDisplayName,
  snapProfileUrl,
  snapcodeUrl,
} from '../snapchat.ts';

test('handles are normalised, @ and case stripped', () => {
  assert.equal(cleanHandle('  @BigSho_ '), 'bigsho_');
  assert.equal(cleanHandle('@@tolu'), 'tolu');
  assert.equal(cleanHandle('a m a k a'), 'amaka');
});

test('handle shape follows Snapchat rules', () => {
  assert.ok(looksLikeHandle('bigsho_'));
  assert.ok(looksLikeHandle('amaka.o'));
  assert.ok(!looksLikeHandle('ab'), 'too short');
  assert.ok(!looksLikeHandle('1abc'), 'must start with a letter');
  assert.ok(!looksLikeHandle('averyveryverylonghandle'), 'too long');
  // Spaces are stripped rather than rejected — the same forgiveness applied to
  // a leading '@'. If the result isn't a real account, verifyHandle 404s it.
  assert.ok(looksLikeHandle('has space'));
  assert.equal(cleanHandle('has space'), 'hasspace');
});

test('urls are built against the cleaned handle and escaped', () => {
  assert.ok(snapcodeUrl('@BigSho_').includes('username=bigsho_'));
  assert.ok(snapcodeUrl('x', 600).includes('size=600'));
  assert.ok(snapcodeUrl('x').includes('type=PNG'), 'PNG renders with a plain Image');
  assert.equal(snapProfileUrl('@Tolu'), 'https://www.snapchat.com/add/tolu');
});

/* ---- display name parsing ---- */

test('reads a name from embedded JSON', () => {
  const html = '<html><body><script>{"displayName":"Team Snapchat"}</script></body></html>';
  assert.equal(parseDisplayName(html, 'teamsnapchat'), 'Team Snapchat');
});

test('reads a name from og:title and strips site furniture', () => {
  const html = '<meta property="og:title" content="Toluwani Ige (@toluu) | Snapchat">';
  assert.equal(parseDisplayName(html, 'toluu'), 'Toluwani Ige');
});

test('strips the "on Snapchat" suffix from a title', () => {
  const html = '<title>Amaka Obi on Snapchat</title>';
  assert.equal(parseDisplayName(html, 'amaka.o'), 'Amaka Obi');
});

test('gives up quietly rather than returning junk', () => {
  // A generic page title is not a person's name.
  assert.equal(parseDisplayName('<title>Snapchat</title>', 'someone'), undefined);
  // Nor is an echo of the handle itself.
  assert.equal(parseDisplayName('<title>bigsho_</title>', 'bigsho_'), undefined);
  // And a page we can't parse at all is not an error.
  assert.equal(parseDisplayName('<html><body>hello</body></html>', 'x'), undefined);
});
