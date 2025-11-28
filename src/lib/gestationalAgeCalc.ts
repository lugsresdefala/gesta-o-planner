/**
 * Gestational Age Calculator
 * 
 * Calculates gestational age at a target date based on baseline established from:
 * 1. USG data (preferred) - uses USG date + GA at that time
 * 2. DUM (LMP) as fallback - uses last menstrual period date
 * 
 * Key rule: GA is only calculated for scheduled dates that are AFTER the reference "today" date.
 */

import { parseDate, daysBetween } from './parsers/date';
import { parseGestationalAge, GestationalAge, daysToGA, isValidGADays, formatGA } from './parsers/gestationalAge';

export interface BaselineData {
  method: 'USG' | 'DUM' | null;
  referenceDate: Date;     // The date from which GA is calculated
  gaAtReference: number;   // GA in days at the reference date
  error?: string;
}

export interface GAAtTargetDate {
  gaDays: number | null;
  gaFormatted: string | null;
  ga: GestationalAge | null;
  method: 'USG' | 'DUM' | null;
  calculated: boolean;     // Whether GA was actually calculated (false for past dates)
  error?: string;
}

export interface GACalculationInput {
  // USG data
  usgDate?: string | null;
  usgWeeks?: string | number | null;
  usgDays?: string | number | null;
  
  // DUM data
  dumDate?: string | null;
  dumReliable?: boolean;  // If false, DUM won't be used
  
  // Target date
  targetDate: string | Date;
  
  // Reference "today" date (for testing purposes, can be overridden)
  today?: Date;
}

/**
 * Establishes the baseline for GA calculation, preferring USG over DUM.
 * 
 * @param input - The input data containing USG and/or DUM information
 * @returns BaselineData with the reference point for GA calculation
 */
export function establishBaseline(
  input: Omit<GACalculationInput, 'targetDate' | 'today'>
): BaselineData {
  const { usgDate, usgWeeks, usgDays, dumDate, dumReliable = true } = input;

  // Try USG first (preferred method)
  if (usgDate && (usgWeeks !== null && usgWeeks !== undefined)) {
    const parsedUSGDate = parseDate(usgDate);
    if (parsedUSGDate.date && !parsedUSGDate.isSentinel) {
      const weeks = typeof usgWeeks === 'string' ? parseInt(usgWeeks, 10) : usgWeeks;
      const days = typeof usgDays === 'string' ? parseInt(usgDays, 10) : (usgDays || 0);
      
      if (!isNaN(weeks)) {
        const gaAtUSG = weeks * 7 + (isNaN(days) ? 0 : days);
        
        if (isValidGADays(gaAtUSG)) {
          return {
            method: 'USG',
            referenceDate: parsedUSGDate.date,
            gaAtReference: gaAtUSG
          };
        }
      }
    }
  }

  // Fallback to DUM if reliable
  if (dumDate && dumReliable !== false) {
    const parsedDUM = parseDate(dumDate);
    if (parsedDUM.date && !parsedDUM.isSentinel) {
      return {
        method: 'DUM',
        referenceDate: parsedDUM.date,
        gaAtReference: 0  // GA at DUM is 0 by definition
      };
    }
  }

  return {
    method: null,
    referenceDate: new Date(),
    gaAtReference: 0,
    error: 'No valid USG or DUM data available to establish baseline'
  };
}

/**
 * Calculates the gestational age at a target date.
 * 
 * CRITICAL RULE: GA is only calculated if the target date is AFTER today.
 * For past dates, the function returns calculated: false.
 * 
 * @param input - The calculation input with USG/DUM data and target date
 * @returns GAAtTargetDate with the calculated GA or indication that calculation was skipped
 */
export function calculateGAAtTargetDate(input: GACalculationInput): GAAtTargetDate {
  const today = input.today || new Date();
  
  // Normalize "today" to start of day for consistent comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Parse target date
  let targetDate: Date;
  if (input.targetDate instanceof Date) {
    targetDate = input.targetDate;
  } else {
    const parsed = parseDate(input.targetDate);
    if (!parsed.date) {
      return {
        gaDays: null,
        gaFormatted: null,
        ga: null,
        method: null,
        calculated: false,
        error: parsed.error || 'Invalid target date'
      };
    }
    if (parsed.isSentinel) {
      return {
        gaDays: null,
        gaFormatted: null,
        ga: null,
        method: null,
        calculated: false,
        error: 'Target date is a sentinel date (year 1900)'
      };
    }
    targetDate = parsed.date;
  }

  // Normalize target date to start of day
  const targetStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  // CRITICAL CHECK: Only calculate if target date is AFTER today
  // Business rule: GA calculation is only relevant for future scheduled appointments
  // to assist with planning. Past dates do not need GA projections.
  if (targetStart.getTime() <= todayStart.getTime()) {
    return {
      gaDays: null,
      gaFormatted: null,
      ga: null,
      method: null,
      calculated: false,
      error: 'Target date is not in the future; GA calculation skipped per business rule (IG só é calculada se a data agendada for futura em relação ao hoje do sistema)'
    };
  }

  // Establish baseline
  const baseline = establishBaseline(input);
  if (!baseline.method) {
    return {
      gaDays: null,
      gaFormatted: null,
      ga: null,
      method: null,
      calculated: false,
      error: baseline.error || 'Could not establish baseline'
    };
  }

  // Calculate days from baseline reference to target date
  const daysSinceBaseline = daysBetween(baseline.referenceDate, targetDate);
  
  // Calculate GA in days at target date
  const gaDays = baseline.gaAtReference + daysSinceBaseline;

  // Validate result
  if (!isValidGADays(gaDays)) {
    return {
      gaDays: null,
      gaFormatted: null,
      ga: null,
      method: baseline.method,
      calculated: true,
      error: `Calculated GA (${gaDays} days) is outside valid range (0-315 days)`
    };
  }

  const ga = daysToGA(gaDays);
  if (!ga) {
    return {
      gaDays: null,
      gaFormatted: null,
      ga: null,
      method: baseline.method,
      calculated: true,
      error: 'Failed to convert days to GA'
    };
  }

  return {
    gaDays,
    gaFormatted: formatGA(ga),
    ga,
    method: baseline.method,
    calculated: true
  };
}

/**
 * Convenience function to calculate GA at primary and final scheduled dates.
 * 
 * @param input - The calculation input
 * @param primaryScheduledDate - Primary scheduled date (DATA AGENDADA)
 * @param finalScheduledDate - Final scheduled date (Data_Agendada)
 * @param today - Optional reference date for testing
 * @returns Object with both calculated GA values
 */
export function calculateScheduledGAs(
  input: Omit<GACalculationInput, 'targetDate' | 'today'>,
  primaryScheduledDate: string | Date | null | undefined,
  finalScheduledDate: string | Date | null | undefined,
  today?: Date
): {
  primary: GAAtTargetDate | null;
  final: GAAtTargetDate | null;
} {
  let primary: GAAtTargetDate | null = null;
  let final: GAAtTargetDate | null = null;

  if (primaryScheduledDate) {
    primary = calculateGAAtTargetDate({
      ...input,
      targetDate: primaryScheduledDate,
      today
    });
  }

  if (finalScheduledDate) {
    final = calculateGAAtTargetDate({
      ...input,
      targetDate: finalScheduledDate,
      today
    });
  }

  return { primary, final };
}
