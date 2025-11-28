/**
 * Flexible date parser with support for multiple formats and sentinel date detection.
 * 
 * Supported formats:
 * - DD/MM/YYYY
 * - MM/DD/YYYY (when day > 12)
 * - YYYY-MM-DD
 * - DD-MM-YYYY
 * - DD.MM.YYYY
 * 
 * Sentinel detection: Year 1900 is treated as an invalid/placeholder date.
 */

export interface ParsedDate {
  date: Date | null;
  isSentinel: boolean;
  error?: string;
}

const SENTINEL_YEAR = 1900;

/**
 * Parses a date string into a Date object.
 * Detects sentinel dates (year 1900) that indicate placeholder or invalid data.
 * 
 * @param dateStr - The date string to parse
 * @param options - Optional configuration
 * @returns ParsedDate with the parsed date, sentinel flag, and optional error
 */
export function parseDate(
  dateStr: string | null | undefined,
  options: { minYear?: number; maxYear?: number } = {}
): ParsedDate {
  const { minYear = 2020, maxYear = 2030 } = options;

  if (!dateStr || typeof dateStr !== 'string') {
    return { date: null, isSentinel: false, error: 'Empty or invalid input' };
  }

  const trimmed = dateStr.trim();
  if (!trimmed) {
    return { date: null, isSentinel: false, error: 'Empty input' };
  }

  // Try different separators: /, -, .
  const separators = ['/', '-', '.'];
  let parts: string[] = [];
  let separator = '';
  
  for (const sep of separators) {
    if (trimmed.includes(sep)) {
      parts = trimmed.split(sep);
      separator = sep;
      break;
    }
  }

  // Handle ISO format (YYYY-MM-DD)
  if (separator === '-' && parts.length === 3 && parts[0].length === 4) {
    const [yearStr, monthStr, dayStr] = parts;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);

    if (year === SENTINEL_YEAR) {
      return { date: null, isSentinel: true, error: 'Sentinel date detected (year 1900)' };
    }

    if (year < minYear || year > maxYear) {
      return { date: null, isSentinel: false, error: `Year ${year} outside valid range (${minYear}-${maxYear})` };
    }

    const date = new Date(year, month, day);
    if (isValidDate(date, month, day)) {
      return { date, isSentinel: false };
    }
    return { date: null, isSentinel: false, error: 'Invalid date' };
  }

  // Handle DD/MM/YYYY or MM/DD/YYYY format
  if (parts.length === 3) {
    const [part1, part2, part3] = parts.map(p => parseInt(p, 10));
    
    if (isNaN(part1) || isNaN(part2) || isNaN(part3)) {
      return { date: null, isSentinel: false, error: 'Invalid number in date' };
    }

    let day: number, month: number, year: number;

    // If part3 is a 2-digit year, convert to 4-digit
    let yearValue = part3;
    if (part3 < 100) {
      yearValue = part3 > 50 ? 1900 + part3 : 2000 + part3;
    }

    // Check for sentinel year
    if (yearValue === SENTINEL_YEAR) {
      return { date: null, isSentinel: true, error: 'Sentinel date detected (year 1900)' };
    }

    // If part1 > 12, it must be DD/MM/YYYY
    if (part1 > 12) {
      day = part1;
      month = part2 - 1;
      year = yearValue;
    }
    // If part2 > 12, it must be MM/DD/YYYY
    else if (part2 > 12) {
      month = part1 - 1;
      day = part2;
      year = yearValue;
    }
    // Ambiguous case – assume DD/MM/YYYY (Brazilian format)
    else {
      day = part1;
      month = part2 - 1;
      year = yearValue;
    }

    if (year < minYear || year > maxYear) {
      return { date: null, isSentinel: false, error: `Year ${year} outside valid range (${minYear}-${maxYear})` };
    }

    const date = new Date(year, month, day);
    if (isValidDate(date, month, day)) {
      return { date, isSentinel: false };
    }
    return { date: null, isSentinel: false, error: 'Invalid date' };
  }

  return { date: null, isSentinel: false, error: 'Unrecognized date format' };
}

/**
 * Validates that a Date object has the expected month and day.
 * This catches issues like February 30 being auto-corrected to March 2.
 */
function isValidDate(date: Date, expectedMonth: number, expectedDay: number): boolean {
  return (
    !isNaN(date.getTime()) &&
    date.getMonth() === expectedMonth &&
    date.getDate() === expectedDay
  );
}

/**
 * Formats a Date object to DD/MM/YYYY format.
 */
export function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Gets the difference in days between two dates.
 */
export function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}
