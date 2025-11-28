/**
 * Raw Patient Import Module
 * 
 * Loads TSV/CSV data preserving ALL original columns without any transformation.
 * Creates a "raw" layer that maintains data integrity for audit and debugging.
 */

export interface RawPatientRecord {
  [key: string]: string;  // All columns as string values
}

export interface RawImportResult {
  patients: RawPatientRecord[];
  columns: string[];
  rowCount: number;
  errors: Array<{ row: number; message: string }>;
}

/**
 * Parses TSV/CSV content into raw patient records.
 * Preserves all original columns including auxiliary columns like "Coluna*".
 * 
 * @param content - The TSV or CSV content as string
 * @param delimiter - The delimiter character (default: tab for TSV)
 * @returns RawImportResult with all data preserved
 */
export function parseRawPatients(
  content: string,
  delimiter: string = '\t'
): RawImportResult {
  const result: RawImportResult = {
    patients: [],
    columns: [],
    rowCount: 0,
    errors: []
  };

  if (!content || typeof content !== 'string') {
    result.errors.push({ row: 0, message: 'Empty or invalid content' });
    return result;
  }

  // Split into lines, handling both \n and \r\n
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    result.errors.push({ row: 0, message: 'No lines found in content' });
    return result;
  }

  // First line is header
  const headerLine = lines[0];
  if (!headerLine.trim()) {
    result.errors.push({ row: 1, message: 'Empty header line' });
    return result;
  }

  // Parse header columns
  result.columns = parseDelimitedLine(headerLine, delimiter);
  if (result.columns.length === 0) {
    result.errors.push({ row: 1, message: 'No columns found in header' });
    return result;
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    const values = parseDelimitedLine(line, delimiter);
    
    // Create record with all columns
    const record: RawPatientRecord = {};
    let hasData = false;

    for (let j = 0; j < result.columns.length; j++) {
      const columnName = result.columns[j];
      const value = j < values.length ? values[j] : '';
      record[columnName] = value;
      if (value.trim()) {
        hasData = true;
      }
    }

    // Also capture any extra columns beyond the header
    for (let j = result.columns.length; j < values.length; j++) {
      const extraColumnName = `_ExtraColumn${j}`;
      record[extraColumnName] = values[j];
      if (!result.columns.includes(extraColumnName)) {
        result.columns.push(extraColumnName);
      }
    }

    // Only add rows that have at least some data
    if (hasData) {
      result.patients.push(record);
      result.rowCount++;
    }
  }

  return result;
}

/**
 * Parses a delimited line handling quoted fields.
 * 
 * @param line - The line to parse
 * @param delimiter - The delimiter character
 * @returns Array of field values
 */
function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  
  return result;
}

/**
 * Loads raw patient data from an ArrayBuffer (e.g., from file upload).
 * 
 * @param buffer - The file content as ArrayBuffer
 * @param delimiter - The delimiter character
 * @returns RawImportResult
 */
export function loadRawPatientsFromBuffer(
  buffer: ArrayBuffer,
  delimiter: string = '\t'
): RawImportResult {
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(buffer);
  return parseRawPatients(content, delimiter);
}

/**
 * Gets the list of original column names.
 * Useful for displaying column mapping UI.
 * 
 * @param result - The raw import result
 * @returns Array of column names
 */
export function getOriginalColumns(result: RawImportResult): string[] {
  return [...result.columns];
}

/**
 * Gets a specific row by index.
 * 
 * @param result - The raw import result
 * @param index - Row index (0-based)
 * @returns The raw patient record or null if not found
 */
export function getRawPatientByIndex(
  result: RawImportResult,
  index: number
): RawPatientRecord | null {
  if (index < 0 || index >= result.patients.length) {
    return null;
  }
  return result.patients[index];
}

/**
 * Creates a copy of the raw data.
 * Use this to preserve the original data before any transformations.
 * 
 * @param result - The raw import result
 * @returns Deep copy of the raw import result
 */
export function cloneRawResult(result: RawImportResult): RawImportResult {
  return {
    patients: result.patients.map(p => ({ ...p })),
    columns: [...result.columns],
    rowCount: result.rowCount,
    errors: result.errors.map(e => ({ ...e }))
  };
}
