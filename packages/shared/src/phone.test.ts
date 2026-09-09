import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPhone, formatPhoneInput, phoneHref } from './phone.js';

test('formatPhone renders North American numbers as +1 604-555-1234', () => {
  assert.equal(formatPhone('6045551234'), '+1 604-555-1234');
  assert.equal(formatPhone('604 555 1234'), '+1 604-555-1234');
  assert.equal(formatPhone('(604) 555-1234'), '+1 604-555-1234');
  assert.equal(formatPhone('+1 604 555 1234'), '+1 604-555-1234');
  assert.equal(formatPhone('16045551234'), '+1 604-555-1234');
  assert.equal(formatPhone('2125551234'), '+1 212-555-1234'); // a US number, same plan
});

test('formatPhone keeps an extension attached to the number', () => {
  assert.equal(formatPhone('604 555 1234 x22'), '+1 604-555-1234 ext. 22');
  assert.equal(phoneHref('604 555 1234 x22'), 'tel:+16045551234;ext=22');
});

test('formatPhone keeps each country to its own grouping', () => {
  assert.equal(formatPhone('+55 11 91234-5678'), '+55 11 91234 5678'); // Brazil, DDI + DD
  assert.equal(formatPhone('+5511912345678'), '+55 11 91234 5678');
  assert.equal(formatPhone('+61 2 1234 5678'), '+61 2 1234 5678'); // Australia
  assert.equal(formatPhone('+351 912345678'), '+351 912 345 678'); // Portugal
  assert.equal(formatPhone('+44 7911 123456'), '+44 7911 123456'); // UK
});

test('formatPhone leaves blanks and anything it cannot verify alone', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone('  '), '');
  assert.equal(formatPhone('604-555'), '604-555'); // half a number
  assert.equal(formatPhone('ext. 22 only'), 'ext. 22 only');
  assert.equal(formatPhone('ask Bruno'), 'ask Bruno'); // not a number at all
});

test('a Brazilian number typed without its DDI is never turned into a +1 number', () => {
  // The critical case: DD 11 + a 9-digit mobile is 11 digits, exactly like a
  // NANP number with its leading country code. Metadata rejects it as CA/US, so
  // it stays as the player typed it rather than becoming +1 191-234-5678.
  for (const typed of ['11 91234-5678', '(11) 91234-5678', '11912345678', '11 3123-4567']) {
    assert.equal(formatPhone(typed), typed, typed);
    assert.ok(!formatPhone(typed).startsWith('+1'), typed);
  }
});

test('formatPhoneInput groups partial input without inventing a country', () => {
  // No `+`: local (national) style, which carries no country code at all.
  assert.equal(formatPhoneInput('604'), '(604)');
  assert.equal(formatPhoneInput('60455'), '(604) 55');
  assert.equal(formatPhoneInput('9123456'), '(912) 345-6');
  assert.ok(!formatPhoneInput('912345678').includes('+'), 'no country code before the number validates');
  // Complete and valid — snaps to the canonical form.
  assert.equal(formatPhoneInput('6045551234'), '+1 604-555-1234');
  assert.equal(formatPhoneInput(''), '');
});

test('formatPhoneInput follows the country code the typist gives', () => {
  assert.equal(formatPhoneInput('+55 11 9123'), '+55 11 9123');
  assert.equal(formatPhoneInput('+5511912345678'), '+55 11 91234 5678');
  assert.equal(formatPhoneInput('+61 2 1234 5678'), '+61 2 1234 5678');
  assert.equal(formatPhoneInput('+'), '+');
});

test('typing never changes the digits, one keystroke at a time', () => {
  const digitsOf = (s: string) => s.replace(/\D/g, '');
  for (const seq of ['6045551234', '+5511912345678', '11912345678', '+61212345678', '912345678']) {
    let field = '';
    for (const ch of seq) field = formatPhoneInput(field + ch);
    const expected = digitsOf(seq);
    const got = digitsOf(field);
    // A validated NANP number gains its implied leading 1 and nothing else.
    assert.ok(got === expected || got === `1${expected}`, `${seq} -> ${field}`);
  }
});

test('formatted output is stable when re-fed to either formatter', () => {
  for (const raw of ['6045551234', '+55 11 91234-5678', '+61 2 1234 5678', '11 91234-5678', 'ask Bruno']) {
    const once = formatPhone(raw);
    assert.equal(formatPhone(once), once, raw);
    assert.equal(formatPhoneInput(once), once, raw); // editing it back doesn't reshuffle it
  }
});

test('phoneHref builds a dialable tel: URI', () => {
  assert.equal(phoneHref('+1 604-555-1234'), 'tel:+16045551234');
  assert.equal(phoneHref('6045551234'), 'tel:+16045551234');
  assert.equal(phoneHref('(604) 555 1234'), 'tel:+16045551234');
  assert.equal(phoneHref('+55 11 91234 5678'), 'tel:+5511912345678');
  assert.equal(phoneHref('11 91234-5678'), 'tel:11912345678'); // unverifiable — dial the digits as given
  assert.equal(phoneHref('604-555'), 'tel:604555');
});
