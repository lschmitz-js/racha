import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPhone, formatPhoneInput, phoneHref } from './phone.js';

test('formatPhone renders NANP numbers as +1 123-456-7891', () => {
  assert.equal(formatPhone('1234567891'), '+1 123-456-7891');
  assert.equal(formatPhone('123 456 7891'), '+1 123-456-7891');
  assert.equal(formatPhone('(123) 456-7891'), '+1 123-456-7891');
  assert.equal(formatPhone('+1 (123) 456 7891'), '+1 123-456-7891');
  assert.equal(formatPhone('11234567891'), '+1 123-456-7891');
});

test('formatPhone leaves blanks and unrecognized numbers alone', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone('  '), '');
  assert.equal(formatPhone('+55 11 91234-5678'), '+55 11 91234-5678'); // Brazil
  assert.equal(formatPhone('123-4567'), '123-4567'); // too short to guess
  assert.equal(formatPhone('123 456 7891 x22'), '123 456 7891 x22'); // extension
});

test('formatPhoneInput formats partial input as it is typed', () => {
  assert.equal(formatPhoneInput('1'), '+1 1');
  assert.equal(formatPhoneInput('2'), '+1 2');
  assert.equal(formatPhoneInput('123'), '+1 123');
  assert.equal(formatPhoneInput('12345'), '+1 123-45');
  assert.equal(formatPhoneInput('1234567891'), '+1 123-456-7891');
  assert.equal(formatPhoneInput('+1 123-456-7891'), '+1 123-456-7891');
  assert.equal(formatPhoneInput(''), '');
});

test('formatPhoneInput leaves what cannot be a NANP number alone', () => {
  assert.equal(formatPhoneInput('123456789123456'), '123456789123456'); // too long
  assert.equal(formatPhoneInput('+55 11 9123'), '+55 11 9123'); // Brazil
  assert.equal(formatPhoneInput('+'), '+'); // mid-typing a country code
});

test('every prefix of a number stays stable as it is retyped', () => {
  // Each keystroke re-formats the previous render, so the `+1 ` prefix must not
  // be re-read as an area-code digit.
  let field = '';
  for (const digit of '1234567891') {
    field = formatPhoneInput(field + digit);
  }
  assert.equal(field, '+1 123-456-7891');
});

test('a formatted number survives another round trip', () => {
  const once = formatPhoneInput('1234567891');
  assert.equal(once, '+1 123-456-7891');
  assert.equal(formatPhoneInput(once), once);
  assert.equal(formatPhone(once), once);
});

test('phoneHref builds a dialable tel: URI', () => {
  assert.equal(phoneHref('+1 123-456-7891'), 'tel:+11234567891');
  assert.equal(phoneHref('1234567891'), 'tel:+11234567891');
  assert.equal(phoneHref('(123) 456 7891'), 'tel:+11234567891');
  assert.equal(phoneHref('+55 11 91234-5678'), 'tel:+5511912345678');
  assert.equal(phoneHref('604-555'), 'tel:604555'); // partial — still dialable
});
