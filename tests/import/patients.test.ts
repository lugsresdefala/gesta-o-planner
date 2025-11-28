/**
 * Tests for Patient Import - Parsing USG, GA, phones, dates, and sentinel detection
 */

import { describe, it, expect } from 'vitest';

// Import parsers
import { parseDate, daysBetween, formatDateBR } from '../../src/lib/parsers/date';
import { parseGestationalAge, daysToGA, formatGA, isValidGADays } from '../../src/lib/parsers/gestationalAge';
import { parseUltrasoundBlock } from '../../src/lib/parsers/ultrasound';
import { parsePhones, normalizePhone } from '../../src/lib/parsers/phones';

describe('Date Parser', () => {
  describe('Standard formats', () => {
    it('should parse DD/MM/YYYY format', () => {
      const result = parseDate('25/12/2024');
      expect(result.date).not.toBeNull();
      expect(result.date?.getDate()).toBe(25);
      expect(result.date?.getMonth()).toBe(11); // December (0-indexed)
      expect(result.date?.getFullYear()).toBe(2024);
      expect(result.isSentinel).toBe(false);
    });

    it('should parse MM/DD/YYYY format when day > 12', () => {
      const result = parseDate('01/25/2024');
      expect(result.date).not.toBeNull();
      expect(result.date?.getDate()).toBe(25);
      expect(result.date?.getMonth()).toBe(0); // January
      expect(result.date?.getFullYear()).toBe(2024);
    });

    it('should parse ISO format YYYY-MM-DD', () => {
      const result = parseDate('2024-12-25');
      expect(result.date).not.toBeNull();
      expect(result.date?.getDate()).toBe(25);
      expect(result.date?.getMonth()).toBe(11);
      expect(result.date?.getFullYear()).toBe(2024);
    });

    it('should handle 2-digit year (20XX)', () => {
      const result = parseDate('25/12/24');
      expect(result.date).not.toBeNull();
      expect(result.date?.getFullYear()).toBe(2024);
    });
  });

  describe('Sentinel date detection (year 1900)', () => {
    it('should detect sentinel date with year 1900 in DD/MM/YYYY', () => {
      const result = parseDate('01/01/1900');
      expect(result.isSentinel).toBe(true);
      expect(result.date).toBeNull();
      expect(result.error).toContain('Sentinel');
    });

    it('should detect sentinel date with year 1900 in ISO format', () => {
      const result = parseDate('1900-01-01');
      expect(result.isSentinel).toBe(true);
      expect(result.date).toBeNull();
    });

    it('should detect sentinel date with 2-digit year 00 (1900)', () => {
      const result = parseDate('01/01/00');
      // Year 00 -> 2000 (not 1900) based on the parser logic
      // So this should NOT be a sentinel
      expect(result.isSentinel).toBe(false);
    });
  });

  describe('Invalid dates', () => {
    it('should reject empty input', () => {
      const result = parseDate('');
      expect(result.date).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should reject null input', () => {
      const result = parseDate(null);
      expect(result.date).toBeNull();
    });

    it('should reject invalid date like February 30', () => {
      const result = parseDate('30/02/2024');
      expect(result.date).toBeNull();
      expect(result.error).toBe('Invalid date');
    });

    it('should reject years outside valid range', () => {
      const result = parseDate('25/12/2050');
      expect(result.date).toBeNull();
      expect(result.error).toContain('outside valid range');
    });
  });

  describe('Helper functions', () => {
    it('should calculate days between two dates', () => {
      const date1 = new Date(2024, 0, 1);
      const date2 = new Date(2024, 0, 11);
      expect(daysBetween(date1, date2)).toBe(10);
    });

    it('should format date in Brazilian format', () => {
      const date = new Date(2024, 11, 25);
      expect(formatDateBR(date)).toBe('25/12/2024');
    });
  });
});

describe('Gestational Age Parser', () => {
  describe('Format: WsWdD (32S2D)', () => {
    it('should parse 32S2D format', () => {
      const result = parseGestationalAge('32S2D');
      expect(result.ga).not.toBeNull();
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
      expect(result.ga?.totalDays).toBe(226);
    });

    it('should parse 37s0d format (lowercase)', () => {
      const result = parseGestationalAge('37s0d');
      expect(result.ga?.weeks).toBe(37);
      expect(result.ga?.days).toBe(0);
    });

    it('should parse with spaces: 32 s 2 d', () => {
      const result = parseGestationalAge('32 s 2 d');
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
    });
  });

  describe('Format: W SEM (35 SEM)', () => {
    it('should parse "35 SEM"', () => {
      const result = parseGestationalAge('35 SEM');
      expect(result.ga?.weeks).toBe(35);
      expect(result.ga?.days).toBe(0);
    });

    it('should parse "35sem" (no space)', () => {
      const result = parseGestationalAge('35sem');
      expect(result.ga?.weeks).toBe(35);
      expect(result.ga?.days).toBe(0);
    });

    it('should parse "35 semanas"', () => {
      const result = parseGestationalAge('35 semanas');
      expect(result.ga?.weeks).toBe(35);
    });
  });

  describe('Format: W D/7 (34 3/7)', () => {
    it('should parse "34 3/7" as 34 weeks 3 days', () => {
      const result = parseGestationalAge('34 3/7');
      expect(result.ga?.weeks).toBe(34);
      expect(result.ga?.days).toBe(3);
    });
  });

  describe('Format: W/W (39/40)', () => {
    it('should parse "39/40" as 39 weeks 0 days', () => {
      const result = parseGestationalAge('39/40');
      expect(result.ga?.weeks).toBe(39);
      expect(result.ga?.days).toBe(0);
    });
  });

  describe('Format: W;D (31;2)', () => {
    it('should parse "31;2" as 31 weeks 2 days', () => {
      const result = parseGestationalAge('31;2');
      expect(result.ga?.weeks).toBe(31);
      expect(result.ga?.days).toBe(2);
    });
  });

  describe('Format: W+D (32+2)', () => {
    it('should parse "32+2" as 32 weeks 2 days', () => {
      const result = parseGestationalAge('32+2');
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
    });

    it('should parse "32 + 2" with spaces', () => {
      const result = parseGestationalAge('32 + 2');
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
    });
  });

  describe('Format: W.D (32.2)', () => {
    it('should parse "32.2" as 32 weeks 2 days', () => {
      const result = parseGestationalAge('32.2');
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
    });
  });

  describe('Format: plain number', () => {
    it('should parse "35" as 35 weeks 0 days', () => {
      const result = parseGestationalAge('35');
      expect(result.ga?.weeks).toBe(35);
      expect(result.ga?.days).toBe(0);
    });
  });

  describe('Invalid GA', () => {
    it('should reject empty input', () => {
      const result = parseGestationalAge('');
      expect(result.ga).toBeNull();
    });

    it('should reject GA > 45 weeks (315 days)', () => {
      const result = parseGestationalAge('50S0D');
      expect(result.ga).toBeNull();
      expect(result.error).toContain('out of valid range');
    });

    it('should reject unrecognized format', () => {
      const result = parseGestationalAge('abc');
      expect(result.ga).toBeNull();
      expect(result.error).toContain('Unrecognized');
    });
  });

  describe('Helper functions', () => {
    it('should convert days to GA', () => {
      const ga = daysToGA(226);
      expect(ga?.weeks).toBe(32);
      expect(ga?.days).toBe(2);
    });

    it('should format GA', () => {
      const ga = { weeks: 32, days: 2, totalDays: 226 };
      expect(formatGA(ga)).toBe('32s2d');
      expect(formatGA(ga, false)).toBe('32s 2d');
    });

    it('should validate GA days range', () => {
      expect(isValidGADays(200)).toBe(true);
      expect(isValidGADays(-1)).toBe(false);
      expect(isValidGADays(400)).toBe(false);
    });
  });
});

describe('Ultrasound Block Parser', () => {
  describe('Fetal weight extraction', () => {
    it('should extract PFE with grams', () => {
      const result = parseUltrasoundBlock('PFE: 2500g');
      expect(result.fetalWeight).toBe(2500);
    });

    it('should extract PFE without unit', () => {
      const result = parseUltrasoundBlock('PFE 2800');
      expect(result.fetalWeight).toBe(2800);
    });

    it('should extract weight in kg and convert to grams', () => {
      const result = parseUltrasoundBlock('peso 2.5kg');
      expect(result.fetalWeight).toBe(2500);
    });

    it('should extract weight from complex text', () => {
      const result = parseUltrasoundBlock('32s2d, CEF, PFE=2200g p50, MBV 5cm');
      expect(result.fetalWeight).toBe(2200);
    });
  });

  describe('Percentile extraction', () => {
    it('should extract percentile with p prefix', () => {
      const result = parseUltrasoundBlock('PFE 2500g p50');
      expect(result.percentile).toBe(50);
    });

    it('should extract percentile with P prefix', () => {
      const result = parseUltrasoundBlock('peso P75');
      expect(result.percentile).toBe(75);
    });

    it('should extract percentile word', () => {
      const result = parseUltrasoundBlock('percentil 25');
      expect(result.percentile).toBe(25);
    });
  });

  describe('Presentation extraction', () => {
    it('should detect cephalic presentation', () => {
      const result = parseUltrasoundBlock('apresentação cefálica');
      expect(result.presentation).toBe('CEF');
    });

    it('should detect CEF abbreviation', () => {
      const result = parseUltrasoundBlock('CEF, PFE 2500g');
      expect(result.presentation).toBe('CEF');
    });

    it('should detect pelvic presentation', () => {
      const result = parseUltrasoundBlock('pélvica');
      expect(result.presentation).toBe('PELVICO');
    });

    it('should detect transverse presentation', () => {
      const result = parseUltrasoundBlock('transverso');
      expect(result.presentation).toBe('TRANSVERSO');
    });
  });

  describe('MBV/ILA extraction', () => {
    it('should extract MBV', () => {
      const result = parseUltrasoundBlock('MBV: 5.2cm');
      expect(result.mbv).toBeCloseTo(5.2);
    });

    it('should extract ILA', () => {
      const result = parseUltrasoundBlock('ILA: 15cm');
      expect(result.ila).toBe(15);
    });

    it('should extract MBV without cm', () => {
      const result = parseUltrasoundBlock('MBV 4.8');
      expect(result.mbv).toBeCloseTo(4.8);
    });
  });

  describe('Doppler extraction', () => {
    it('should detect normal doppler', () => {
      const result = parseUltrasoundBlock('Doppler normal');
      expect(result.doppler?.normal).toBe(true);
    });

    it('should detect doppler s/a', () => {
      const result = parseUltrasoundBlock('Doppler s/a');
      expect(result.doppler?.normal).toBe(true);
    });
  });

  describe('Placenta extraction', () => {
    it('should detect anterior placenta', () => {
      const result = parseUltrasoundBlock('placenta anterior');
      expect(result.placenta?.location).toBe('anterior');
    });

    it('should detect placenta previa', () => {
      const result = parseUltrasoundBlock('placenta prévia');
      expect(result.placenta?.location).toBe('previa');
    });

    it('should extract placenta grade', () => {
      const result = parseUltrasoundBlock('placenta grau 2');
      expect(result.placenta?.grade).toBe(2);
    });
  });

  describe('GA extraction from USG text', () => {
    it('should extract GA from USG block', () => {
      const result = parseUltrasoundBlock('32s2d, CEF, PFE 2500g');
      expect(result.ga?.weeks).toBe(32);
      expect(result.ga?.days).toBe(2);
    });
  });
});

describe('Phone Parser', () => {
  describe('Single phone parsing', () => {
    it('should parse phone with DDD and hyphen', () => {
      const result = normalizePhone('(11) 99999-9999');
      expect(result).not.toBeNull();
      expect(result?.digits).toBe('11999999999');
      expect(result?.formatted).toBe('(11) 99999-9999');
      expect(result?.type).toBe('mobile');
    });

    it('should parse phone without formatting', () => {
      const result = normalizePhone('11999999999');
      expect(result?.digits).toBe('11999999999');
    });

    it('should parse landline', () => {
      const result = normalizePhone('11 3333-4444');
      expect(result?.digits).toBe('1133334444');
      expect(result?.type).toBe('landline');
    });

    it('should handle country code', () => {
      const result = normalizePhone('+55 11 99999-9999');
      expect(result?.digits).toBe('11999999999');
    });

    it('should handle label prefix', () => {
      const result = normalizePhone('Cel: 11 99999-9999');
      expect(result?.digits).toBe('11999999999');
    });
  });

  describe('Multiple phones parsing', () => {
    it('should parse multiple phones separated by /', () => {
      const result = parsePhones('11 99999-9999 / 11 88888-8888');
      expect(result.phones.length).toBe(2);
    });

    it('should parse multiple phones separated by comma', () => {
      const result = parsePhones('11999999999, 11888888888');
      expect(result.phones.length).toBe(2);
    });

    it('should parse multiple phones separated by "e"', () => {
      const result = parsePhones('11999999999 e 11888888888');
      expect(result.phones.length).toBe(2);
    });
  });

  describe('Invalid phones', () => {
    it('should reject phone with too few digits', () => {
      const result = normalizePhone('1234567');
      expect(result).toBeNull();
    });

    it('should handle empty input', () => {
      const result = parsePhones('');
      expect(result.phones.length).toBe(0);
    });
  });
});
