import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseLibraryProperties } from '../../src/transforms/library-properties.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', 'fixtures');

describe('parseLibraryProperties', () => {
  describe('basic parsing', () => {
    it('parses a simple key=value pair', () => {
      const out = parseLibraryProperties('name=Adafruit_BusIO');
      expect(out).toEqual({ name: 'Adafruit_BusIO' });
    });

    it('parses multiple key=value pairs across separate lines', () => {
      const out = parseLibraryProperties(
        'name=Foo\nversion=1.2.3\ncategory=Sensors'
      );
      expect(out).toEqual({
        name: 'Foo',
        version: '1.2.3',
        category: 'Sensors',
      });
    });

    it('handles whitespace around the equals sign', () => {
      const out = parseLibraryProperties(
        'name = Foo\nversion  =  1.2.3\n  category  =Sensors'
      );
      expect(out).toEqual({
        name: 'Foo',
        version: '1.2.3',
        category: 'Sensors',
      });
    });

    it('returns an empty object for an empty string', () => {
      expect(parseLibraryProperties('')).toEqual({});
    });

    it('returns an empty object for whitespace-only input', () => {
      expect(parseLibraryProperties('\n   \n\t\n')).toEqual({});
    });
  });

  describe('comments and blank lines', () => {
    it('skips comment lines beginning with #', () => {
      const out = parseLibraryProperties(
        '# this is a comment\nname=Foo\n# another comment\nversion=1.0'
      );
      expect(out).toEqual({ name: 'Foo', version: '1.0' });
    });

    it('skips blank lines', () => {
      const out = parseLibraryProperties(
        'name=Foo\n\n\nversion=1.0\n  \ncategory=Sensors'
      );
      expect(out).toEqual({ name: 'Foo', version: '1.0', category: 'Sensors' });
    });
  });

  describe('values with equals signs', () => {
    it('preserves equals signs inside a value', () => {
      const out = parseLibraryProperties(
        'url=https://example.com?foo=bar&baz=qux'
      );
      expect(out).toEqual({
        url: 'https://example.com?foo=bar&baz=qux',
      });
    });

    it('treats the first equals as the delimiter', () => {
      const out = parseLibraryProperties(
        'docs=https://example.com?topic=bus&mode=api'
      );
      expect(out.docs).toBe('https://example.com?topic=bus&mode=api');
    });
  });

  describe('quoted values', () => {
    it('strips surrounding double quotes', () => {
      const out = parseLibraryProperties('sentence="Library for sensors"');
      expect(out).toEqual({ sentence: 'Library for sensors' });
    });

    it('strips surrounding single quotes', () => {
      const out = parseLibraryProperties("sentence='Library for sensors'");
      expect(out).toEqual({ sentence: 'Library for sensors' });
    });

    it('preserves spaces inside quoted values', () => {
      const out = parseLibraryProperties(
        'long_description="A long description with many spaces"'
      );
      expect(out).toEqual({
        long_description: 'A long description with many spaces',
      });
    });

    it('leaves unquoted values with spaces untouched (after trim)', () => {
      const out = parseLibraryProperties('maintainer = Ada <a@b.com>');
      expect(out).toEqual({ maintainer: 'Ada <a@b.com>' });
    });
  });

  describe('backslash continuations', () => {
    it('joins a line continued with a trailing backslash onto the next line', () => {
      const out = parseLibraryProperties(
        'depends=Adafruit Unified Sensor,\\\n         Adafruit IO Arduino,\\\n         ArduinoJson'
      );
      expect(out.depends).toBe(
        'Adafruit Unified Sensor,\n         Adafruit IO Arduino,\n         ArduinoJson'
      );
    });
  });

  describe('malformed keys', () => {
    let warn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      warn = vi.fn();
    });

    it('rejects keys containing spaces (bug-fix: garbage keys)', () => {
      const out = parseLibraryProperties(
        'name=Good\nbad key with spaces=value\nauthor=Ada',
        { logger: { warn } as unknown as never }
      );
      expect(out).toEqual({ name: 'Good', author: 'Ada' });
      expect(out['bad key with spaces']).toBeUndefined();
    });

    it('rejects keys starting with a digit', () => {
      const out = parseLibraryProperties(
        'name=Good\n1version=1.0',
        { logger: { warn } as unknown as never }
      );
      expect(out).toEqual({ name: 'Good' });
      expect(out['1version']).toBeUndefined();
    });

    it('rejects keys containing dots or other punctuation', () => {
      const out = parseLibraryProperties(
        'name=Good\nweird.key=v\nkey!bad=v2',
        { logger: { warn } as unknown as never }
      );
      expect(out).toEqual({ name: 'Good' });
    });

    it('logs a warning when rejecting malformed keys', () => {
      parseLibraryProperties('bad key=v', {
        logger: { warn } as unknown as never,
      });
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('real-world fixture', () => {
    it('parses the sample Adafruit BusIO library.properties fixture', () => {
      const fixturePath = resolve(fixturesDir, 'sample-library.properties');
      const text = readFileSync(fixturePath, 'utf-8');
      const out = parseLibraryProperties(text);

      expect(out.name).toBe('Adafruit BusIO');
      expect(out.version).toBe('1.16.1');
      expect(out.author).toBe('Adafruit <info@adafruit.com>');
      expect(out.category).toBe('Sensors');
      expect(out.url).toBe('https://github.com/adafruit/Adafruit_BusIO');
      expect(out.architectures).toBe('*');
      expect(out.license).toBe('MIT');
      expect(out.docs_url).toBe('https://example.com/docs?topic=bus&mode=api');
      expect(out.include).toBe(
        'BusIO_Register.h,Adafruit_I2CDevice.h,Adafruit_SPIDevice.h'
      );
      expect(out.sentence_alt).toBe('Library for sensors and actuators');
      expect(out.long_description).toBe(
        'I2C, SPI, GPIO and ADC helpers for Arduino'
      );
      expect(out.depends).toBe(
        'Adafruit Unified Sensor,\n         Adafruit IO Arduino,\n         ArduinoJson'
      );
      expect(out.dot_a_linkage).toBe('');
      expect(out.types).toBe('Contributed');
      expect(out.repository).toBe(
        'https://github.com/adafruit/Adafruit_BusIO'
      );
    });
  });
});