/**
 * Gestational Age (GA) parser with support for multiple formats.
 * 
 * Supported formats:
 * - 32S2D, 32s2d (weeks S days D)
 * - 37s0d, 37S0D
 * - 35 SEM, 35sem, 35 semanas
 * - 34 3/7 (34 weeks and 3/7 of a week = 3 days)
 * - 39/40 (interpreted as 39 weeks, "close to 40")
 * - 31;2 (31 weeks and 2 days, semicolon separator)
 * - 32+2, 32 + 2 (32 weeks and 2 days)
 * - 32.2 (32 weeks and 2 days)
 * - Plain number: 35 (interpreted as 35 weeks and 0 days)
 */

export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
}

export interface ParsedGA {
  ga: GestationalAge | null;
  error?: string;
  originalFormat?: string;
}

// Maximum valid gestational age in days (45 weeks = 315 days)
// Extended beyond normal 40-week pregnancy to accommodate post-term pregnancies
// and calculation edge cases. Standard pregnancy is 280 days (40 weeks).
const MAX_GA_DAYS = 315;
const MIN_GA_DAYS = 0;

/**
 * Parses a gestational age string into a structured format.
 * 
 * @param gaStr - The gestational age string to parse
 * @returns ParsedGA with the parsed GA, or null if parsing failed
 */
export function parseGestationalAge(gaStr: string | null | undefined): ParsedGA {
  if (!gaStr || typeof gaStr !== 'string') {
    return { ga: null, error: 'Empty or invalid input' };
  }

  const trimmed = gaStr.trim().toLowerCase();
  if (!trimmed) {
    return { ga: null, error: 'Empty input' };
  }

  // Try each pattern in order of specificity
  
  // Pattern: 32S2D or 32s2d (weeks + days with S/D markers)
  const sdPattern = /^(\d{1,2})\s*s\s*(\d{1})\s*d$/i;
  let match = trimmed.match(sdPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    return validateAndReturn(weeks, days, 'WsWdD');
  }

  // Pattern: 32+2 or 32 + 2 (weeks plus days)
  const plusPattern = /^(\d{1,2})\s*\+\s*(\d{1})$/;
  match = trimmed.match(plusPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    return validateAndReturn(weeks, days, 'W+D');
  }

  // Pattern: 31;2 (semicolon separator)
  const semicolonPattern = /^(\d{1,2})\s*;\s*(\d{1})$/;
  match = trimmed.match(semicolonPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    return validateAndReturn(weeks, days, 'W;D');
  }

  // Pattern: 34 3/7 (weeks and fraction)
  const fractionPattern = /^(\d{1,2})\s+(\d{1})\/7$/;
  match = trimmed.match(fractionPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    return validateAndReturn(weeks, days, 'W D/7');
  }

  // Pattern: 39/40 (interpreted as 39 weeks)
  const slashPattern = /^(\d{1,2})\/(\d{1,2})$/;
  match = trimmed.match(slashPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    // Interpret the second number as context (e.g., "close to 40 weeks")
    // but use only the first number as the week count
    return validateAndReturn(weeks, 0, 'W/W');
  }

  // Pattern: 35 SEM, 35sem, 35 semanas
  const semPattern = /^(\d{1,2})\s*(sem|semanas?)$/i;
  match = trimmed.match(semPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    return validateAndReturn(weeks, 0, 'W SEM');
  }

  // Pattern: 32.2 (decimal weeks, interpreted as weeks.days)
  const decimalPattern = /^(\d{1,2})\.(\d{1})$/;
  match = trimmed.match(decimalPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);
    return validateAndReturn(weeks, days, 'W.D');
  }

  // Pattern: plain number (just weeks)
  const plainPattern = /^(\d{1,2})$/;
  match = trimmed.match(plainPattern);
  if (match) {
    const weeks = parseInt(match[1], 10);
    return validateAndReturn(weeks, 0, 'W');
  }

  return { ga: null, error: `Unrecognized GA format: "${gaStr}"` };
}

/**
 * Validates weeks/days and returns a structured result.
 */
function validateAndReturn(weeks: number, days: number, format: string): ParsedGA {
  // Normalize days > 6 into weeks
  if (days > 6) {
    weeks += Math.floor(days / 7);
    days = days % 7;
  }

  const totalDays = weeks * 7 + days;

  if (totalDays < MIN_GA_DAYS || totalDays > MAX_GA_DAYS) {
    return {
      ga: null,
      error: `GA out of valid range: ${weeks}w${days}d (${totalDays} days). Valid range: ${MIN_GA_DAYS}-${MAX_GA_DAYS} days.`,
      originalFormat: format
    };
  }

  if (weeks < 0 || days < 0) {
    return {
      ga: null,
      error: 'Negative values not allowed',
      originalFormat: format
    };
  }

  return {
    ga: { weeks, days, totalDays },
    originalFormat: format
  };
}

/**
 * Converts gestational age in days to weeks+days format.
 */
export function daysToGA(totalDays: number): GestationalAge | null {
  if (totalDays < MIN_GA_DAYS || totalDays > MAX_GA_DAYS) {
    return null;
  }
  
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return { weeks, days, totalDays };
}

/**
 * Formats a gestational age as a string (e.g., "32s 2d" or "32s2d").
 */
export function formatGA(ga: GestationalAge, compact = true): string {
  if (compact) {
    return `${ga.weeks}s${ga.days}d`;
  }
  return `${ga.weeks}s ${ga.days}d`;
}

/**
 * Checks if a gestational age in days is within a valid range.
 */
export function isValidGADays(days: number): boolean {
  return days >= MIN_GA_DAYS && days <= MAX_GA_DAYS;
}
