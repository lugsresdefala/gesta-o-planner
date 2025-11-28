/**
 * Tests for Conditional GA Calculation at Scheduled Dates
 * 
 * Key rule tested: GA is ONLY calculated if the scheduled date is AFTER the reference "today" date.
 * For past or equal dates, the calculation should be skipped.
 */

import { describe, it, expect } from 'vitest';

import { calculateGAAtTargetDate, establishBaseline, calculateScheduledGAs } from '../../src/lib/gestationalAgeCalc';

describe('Gestational Age Calculation at Scheduled Date', () => {
  // Fixed reference date for tests: 2024-06-15
  const TODAY = new Date(2024, 5, 15); // June 15, 2024

  describe('Conditional calculation - future vs past dates', () => {
    const baseInput = {
      usgDate: '01/01/2024',
      usgWeeks: 10,
      usgDays: 0,
      dumDate: null,
    };

    it('should calculate GA for FUTURE scheduled date', () => {
      const result = calculateGAAtTargetDate({
        ...baseInput,
        targetDate: '20/06/2024', // June 20, 2024 - 5 days in future
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).not.toBeNull();
      expect(result.gaFormatted).not.toBeNull();
      expect(result.method).toBe('USG');
    });

    it('should NOT calculate GA for PAST scheduled date', () => {
      const result = calculateGAAtTargetDate({
        ...baseInput,
        targetDate: '10/06/2024', // June 10, 2024 - 5 days in past
        today: TODAY
      });

      expect(result.calculated).toBe(false);
      expect(result.gaDays).toBeNull();
      expect(result.gaFormatted).toBeNull();
      expect(result.error).toContain('not in the future');
    });

    it('should NOT calculate GA for SAME DAY as today', () => {
      const result = calculateGAAtTargetDate({
        ...baseInput,
        targetDate: '15/06/2024', // Same as TODAY
        today: TODAY
      });

      expect(result.calculated).toBe(false);
      expect(result.gaDays).toBeNull();
      expect(result.error).toContain('not in the future');
    });

    it('should calculate GA for tomorrow', () => {
      const result = calculateGAAtTargetDate({
        ...baseInput,
        targetDate: '16/06/2024', // June 16, 2024 - 1 day in future
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).not.toBeNull();
    });
  });

  describe('Baseline establishment', () => {
    it('should prefer USG over DUM when both available', () => {
      const baseline = establishBaseline({
        usgDate: '01/01/2024',
        usgWeeks: 10,
        usgDays: 2,
        dumDate: '01/11/2023',
        dumReliable: true
      });

      expect(baseline.method).toBe('USG');
      expect(baseline.gaAtReference).toBe(72); // 10*7 + 2 = 72 days
    });

    it('should fallback to DUM when USG not available', () => {
      const baseline = establishBaseline({
        usgDate: null,
        usgWeeks: null,
        usgDays: null,
        dumDate: '01/01/2024',
        dumReliable: true
      });

      expect(baseline.method).toBe('DUM');
      expect(baseline.gaAtReference).toBe(0);
    });

    it('should not use DUM when marked unreliable', () => {
      const baseline = establishBaseline({
        usgDate: null,
        usgWeeks: null,
        usgDays: null,
        dumDate: '01/01/2024',
        dumReliable: false
      });

      expect(baseline.method).toBeNull();
      expect(baseline.error).toBeDefined();
    });

    it('should handle missing both USG and DUM', () => {
      const baseline = establishBaseline({
        usgDate: null,
        usgWeeks: null,
        usgDays: null,
        dumDate: null
      });

      expect(baseline.method).toBeNull();
      expect(baseline.error).toContain('No valid USG or DUM');
    });
  });

  describe('GA calculation accuracy', () => {
    it('should calculate correct GA at target date using USG baseline', () => {
      // USG on Jan 1, 2024 showing 10s0d
      // Target date: June 20, 2024 (171 days later)
      // Expected GA: 10*7 + 171 = 241 days = 34s3d
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: 10,
        usgDays: 0,
        targetDate: '20/06/2024',
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).toBe(241);
      expect(result.ga?.weeks).toBe(34);
      expect(result.ga?.days).toBe(3);
      expect(result.gaFormatted).toBe('34s3d');
    });

    it('should calculate correct GA using DUM baseline', () => {
      // DUM on Jan 1, 2024 (GA = 0 at DUM)
      // Target date: June 20, 2024 (171 days later)
      // Expected GA: 171 days = 24s3d
      const result = calculateGAAtTargetDate({
        dumDate: '01/01/2024',
        dumReliable: true,
        targetDate: '20/06/2024',
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).toBe(171);
      expect(result.ga?.weeks).toBe(24);
      expect(result.ga?.days).toBe(3);
    });
  });

  describe('GA range validation', () => {
    it('should reject GA > 315 days (45 weeks)', () => {
      // USG showing 40 weeks, target date 60 days later
      // Expected GA: 40*7 + 60 = 340 days > 315
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: 40,
        usgDays: 0,
        targetDate: '01/03/2024', // 60 days later
        today: new Date(2024, 0, 15) // Jan 15, 2024 (before target)
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).toBeNull();
      expect(result.error).toContain('outside valid range');
    });
  });

  describe('Sentinel date handling', () => {
    it('should not calculate for sentinel target date (1900)', () => {
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: 10,
        usgDays: 0,
        targetDate: '01/01/1900',
        today: TODAY
      });

      expect(result.calculated).toBe(false);
      expect(result.error?.toLowerCase()).toContain('sentinel');
    });
  });

  describe('calculateScheduledGAs convenience function', () => {
    it('should calculate both primary and final scheduled GAs', () => {
      const result = calculateScheduledGAs(
        {
          usgDate: '01/01/2024',
          usgWeeks: 10,
          usgDays: 0
        },
        '20/06/2024', // Primary - future
        '25/06/2024', // Final - future
        TODAY
      );

      expect(result.primary?.calculated).toBe(true);
      expect(result.final?.calculated).toBe(true);
    });

    it('should skip calculation for past dates in both fields', () => {
      const result = calculateScheduledGAs(
        {
          usgDate: '01/01/2024',
          usgWeeks: 10,
          usgDays: 0
        },
        '01/06/2024', // Primary - past
        '10/06/2024', // Final - past
        TODAY
      );

      expect(result.primary?.calculated).toBe(false);
      expect(result.final?.calculated).toBe(false);
    });

    it('should handle null scheduled dates', () => {
      const result = calculateScheduledGAs(
        {
          usgDate: '01/01/2024',
          usgWeeks: 10,
          usgDays: 0
        },
        null,
        null,
        TODAY
      );

      expect(result.primary).toBeNull();
      expect(result.final).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle target date as Date object', () => {
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: 10,
        usgDays: 0,
        targetDate: new Date(2024, 5, 20), // June 20, 2024
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      expect(result.gaDays).not.toBeNull();
    });

    it('should handle USG with only weeks (no days)', () => {
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: 10,
        // usgDays not provided
        targetDate: '20/06/2024',
        today: TODAY
      });

      expect(result.calculated).toBe(true);
    });

    it('should handle string weeks/days values', () => {
      const result = calculateGAAtTargetDate({
        usgDate: '01/01/2024',
        usgWeeks: '10',
        usgDays: '2',
        targetDate: '20/06/2024',
        today: TODAY
      });

      expect(result.calculated).toBe(true);
      // 10*7 + 2 + 171 days = 243 days = 34s5d
      expect(result.gaDays).toBe(243);
    });
  });
});
