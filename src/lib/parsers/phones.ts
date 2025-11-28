/**
 * Phone number normalizer that extracts and normalizes phone numbers from various formats.
 * 
 * Handles:
 * - Multiple phone numbers separated by: /, ,, ;, e, and, |, or newlines
 * - Various formatting: (11) 99999-9999, 11 99999 9999, 11999999999
 * - Country codes: +55, 55
 * - Extensions and labels: "Cel:", "Fixo:", "Whats:"
 */

export interface NormalizedPhone {
  raw: string;           // Original input
  digits: string;        // Only digits
  formatted: string;     // Formatted as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  type?: 'mobile' | 'landline';
  valid: boolean;
}

export interface PhoneParseResult {
  phones: NormalizedPhone[];
  errors: string[];
}

// Brazilian area codes (DDD)
const VALID_AREA_CODES = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // SP
  '21', '22', '24', // RJ
  '27', '28', // ES
  '31', '32', '33', '34', '35', '37', '38', // MG
  '41', '42', '43', '44', '45', '46', // PR
  '47', '48', '49', // SC
  '51', '53', '54', '55', // RS
  '61', // DF
  '62', '64', // GO
  '63', // TO
  '65', '66', // MT
  '67', // MS
  '68', // AC
  '69', // RO
  '71', '73', '74', '75', '77', // BA
  '79', // SE
  '81', '87', // PE
  '82', // AL
  '83', // PB
  '84', // RN
  '85', '88', // CE
  '86', '89', // PI
  '91', '93', '94', // PA
  '92', '97', // AM
  '95', // RR
  '96', // AP
  '98', '99', // MA
]);

/**
 * Parses and normalizes phone numbers from a string that may contain multiple phones.
 * 
 * @param phoneStr - The raw phone string to parse
 * @returns PhoneParseResult with normalized phone numbers and any errors
 */
export function parsePhones(phoneStr: string | null | undefined): PhoneParseResult {
  const result: PhoneParseResult = {
    phones: [],
    errors: []
  };

  if (!phoneStr || typeof phoneStr !== 'string') {
    return result;
  }

  const trimmed = phoneStr.trim();
  if (!trimmed) {
    return result;
  }

  // Split by common separators
  const separators = /[\/,;|\n]|\be\b|\band\b|\bou\b/gi;
  const parts = trimmed.split(separators);

  for (const part of parts) {
    const cleaned = part.trim();
    if (!cleaned) continue;

    const normalized = normalizePhone(cleaned);
    if (normalized) {
      result.phones.push(normalized);
    } else if (cleaned.length > 0 && /\d/.test(cleaned)) {
      // Only add error if there were digits in the string
      result.errors.push(`Could not parse phone: "${cleaned}"`);
    }
  }

  return result;
}

/**
 * Normalizes a single phone number string.
 * 
 * @param phoneStr - The raw phone string to normalize
 * @returns NormalizedPhone or null if parsing failed
 */
export function normalizePhone(phoneStr: string): NormalizedPhone | null {
  if (!phoneStr || typeof phoneStr !== 'string') {
    return null;
  }

  // Remove labels like "Cel:", "Fixo:", "Whats:", etc.
  let cleaned = phoneStr.replace(/^(cel|fixo|whats|wpp|tel|telefone|fone)[:\-\s]*/i, '');

  // Extract only digits
  const digits = cleaned.replace(/\D/g, '');

  if (digits.length < 8) {
    return null; // Not enough digits
  }

  // Handle country code
  let normalizedDigits = digits;
  if (digits.startsWith('55') && digits.length >= 12) {
    normalizedDigits = digits.substring(2);
  }

  // Validate length
  if (normalizedDigits.length < 10 || normalizedDigits.length > 11) {
    return null; // Invalid length for Brazilian phone
  }

  // Extract DDD (area code)
  const ddd = normalizedDigits.substring(0, 2);
  if (!VALID_AREA_CODES.has(ddd)) {
    // Still try to format, but mark as potentially invalid
  }

  // Determine phone type
  const phoneNumber = normalizedDigits.substring(2);
  const isMobile = normalizedDigits.length === 11 || phoneNumber.startsWith('9');
  const type: 'mobile' | 'landline' = isMobile ? 'mobile' : 'landline';

  // Format the number
  let formatted: string;
  if (normalizedDigits.length === 11) {
    // Mobile: (XX) XXXXX-XXXX
    formatted = `(${ddd}) ${normalizedDigits.substring(2, 7)}-${normalizedDigits.substring(7)}`;
  } else {
    // Landline: (XX) XXXX-XXXX
    formatted = `(${ddd}) ${normalizedDigits.substring(2, 6)}-${normalizedDigits.substring(6)}`;
  }

  return {
    raw: phoneStr,
    digits: normalizedDigits,
    formatted,
    type,
    valid: VALID_AREA_CODES.has(ddd)
  };
}

/**
 * Extracts all phone digits from a string without formatting.
 * Useful for storage and comparison.
 * 
 * @param phoneStr - The phone string
 * @returns Array of digit-only phone numbers
 */
export function extractPhoneDigits(phoneStr: string | null | undefined): string[] {
  const result = parsePhones(phoneStr);
  return result.phones.map(p => p.digits);
}
