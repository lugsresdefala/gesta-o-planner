/**
 * Ultrasound (USG) block parser for extracting structured data from free-text USG descriptions.
 * 
 * Extracts:
 * - Gestational age (GA) at USG
 * - Presentation (CEF/cefálica, PELVICO/pélvica, TRANSVERSO, etc.)
 * - Fetal weight (PFE - Peso Fetal Estimado) in grams
 * - Percentile
 * - MBV (Maior Bolsão Vertical) / ILA (Índice de Líquido Amniótico)
 * - Doppler findings
 * - Placenta location
 */

import { parseGestationalAge, GestationalAge } from './gestationalAge';

export type FetalPresentation = 
  | 'CEF'       // Cefálica (head down)
  | 'PELVICO'   // Pélvica (breech)
  | 'TRANSVERSO' // Transverse
  | 'OBLIQUO'   // Oblique
  | null;

export interface DopplerFindings {
  umbilicalArtery?: string;    // AU - Artéria umbilical
  middleCerebralArtery?: string; // ACM - Artéria cerebral média
  uterineArtery?: string;      // AUt - Artérias uterinas
  ductusVenosus?: string;      // DV - Ducto venoso
  normal?: boolean;            // If Doppler is described as normal/normal
  description?: string;        // Raw description
}

export interface PlacentaInfo {
  location?: string;           // anterior, posterior, fundica, lateral, previa
  grade?: number;              // 0, 1, 2, 3
}

export interface ParsedUSG {
  ga: GestationalAge | null;
  presentation: FetalPresentation;
  fetalWeight: number | null;        // in grams
  percentile: number | null;
  mbv: number | null;                // Maior Bolsão Vertical in cm
  ila: number | null;                // Índice Líquido Amniótico in cm
  doppler: DopplerFindings | null;
  placenta: PlacentaInfo | null;
  rawText: string;
  errors: string[];
}

/**
 * Parses an ultrasound description block into structured data.
 * 
 * @param usgText - The raw ultrasound description text
 * @returns ParsedUSG with extracted fields
 */
export function parseUltrasoundBlock(usgText: string | null | undefined): ParsedUSG {
  const result: ParsedUSG = {
    ga: null,
    presentation: null,
    fetalWeight: null,
    percentile: null,
    mbv: null,
    ila: null,
    doppler: null,
    placenta: null,
    rawText: usgText || '',
    errors: []
  };

  if (!usgText || typeof usgText !== 'string') {
    return result;
  }

  const text = usgText.trim();
  if (!text) {
    return result;
  }

  // Extract GA
  result.ga = extractGA(text);

  // Extract presentation
  result.presentation = extractPresentation(text);

  // Extract fetal weight
  result.fetalWeight = extractFetalWeight(text);

  // Extract percentile
  result.percentile = extractPercentile(text);

  // Extract MBV/ILA
  const amnioticFluid = extractAmnioticFluid(text);
  result.mbv = amnioticFluid.mbv;
  result.ila = amnioticFluid.ila;

  // Extract Doppler
  result.doppler = extractDoppler(text);

  // Extract Placenta
  result.placenta = extractPlacenta(text);

  return result;
}

/**
 * Extracts gestational age from USG text.
 */
function extractGA(text: string): GestationalAge | null {
  // Look for GA patterns in the text
  const patterns = [
    /(\d{1,2})\s*s\s*(\d{1})\s*d/i,           // 32s2d
    /ig\s*[:\-=]?\s*(\d{1,2})\s*s\s*(\d{1})\s*d/i, // IG: 32s2d
    /ig\s*[:\-=]?\s*(\d{1,2})\s*\+\s*(\d{1})/i,    // IG: 32+2
    /(\d{1,2})\s*semanas?\s*e?\s*(\d{1})?\s*dias?/i, // 32 semanas e 2 dias
    /(\d{1,2})\s*sem/i,                       // 32 sem
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const weeks = parseInt(match[1], 10);
      const days = match[2] ? parseInt(match[2], 10) : 0;
      const parsed = parseGestationalAge(`${weeks}s${days}d`);
      if (parsed.ga) {
        return parsed.ga;
      }
    }
  }

  return null;
}

/**
 * Extracts fetal presentation from USG text.
 */
function extractPresentation(text: string): FetalPresentation {
  const normalizedText = text.toLowerCase();

  // Check for specific presentations
  if (/\b(cef[aá]lic[ao]?|cef\b)/i.test(normalizedText)) {
    return 'CEF';
  }
  if (/\b(p[ée]lvic[ao]?|pelvico)\b/i.test(normalizedText)) {
    return 'PELVICO';
  }
  if (/\b(transvers[ao]?)\b/i.test(normalizedText)) {
    return 'TRANSVERSO';
  }
  if (/\b(obl[ií]qu[ao]?)\b/i.test(normalizedText)) {
    return 'OBLIQUO';
  }

  return null;
}

/**
 * Extracts fetal weight (PFE) from USG text.
 */
function extractFetalWeight(text: string): number | null {
  // Common patterns:
  // PFE: 2500g, PFE 2500, peso 2.5kg, PFE = 2500g, PFE ~2500g
  const patterns = [
    /pfe\s*[:\-=~]?\s*(\d+(?:[.,]\d+)?)\s*(g|gr|kg)?/i,
    /peso\s*(?:fetal\s*)?(?:estimado\s*)?[:\-=~]?\s*(\d+(?:[.,]\d+)?)\s*(g|gr|kg)?/i,
    /(\d{3,4})\s*g\b/i,  // 2500g without prefix
    /(\d+[.,]\d+)\s*kg\b/i, // 2.5kg
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let weight = parseFloat(match[1].replace(',', '.'));
      const unit = match[2]?.toLowerCase();

      // Convert kg to g if necessary
      if (unit === 'kg' || weight < 100) {
        weight = weight * 1000;
      }

      // Validate reasonable weight range (200g to 6000g)
      if (weight >= 200 && weight <= 6000) {
        return Math.round(weight);
      }
    }
  }

  return null;
}

/**
 * Extracts percentile from USG text.
 */
function extractPercentile(text: string): number | null {
  // Patterns: p50, P50, percentil 50, perc 50, p.50
  const patterns = [
    /\bp\.?\s*(\d{1,2})\b/i,          // p50, p.50, P 50
    /percentil\s*[:\-=]?\s*(\d{1,2})/i,
    /perc\s*[:\-=]?\s*(\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const percentile = parseInt(match[1], 10);
      if (percentile >= 0 && percentile <= 100) {
        return percentile;
      }
    }
  }

  return null;
}

/**
 * Extracts amniotic fluid measurements (MBV/ILA) from USG text.
 */
function extractAmnioticFluid(text: string): { mbv: number | null; ila: number | null } {
  const result = { mbv: null as number | null, ila: null as number | null };

  // MBV patterns: MBV: 5.2cm, MBV 5,2, MBV = 5.2
  const mbvMatch = text.match(/mbv\s*[:\-=]?\s*(\d+(?:[.,]\d+)?)\s*(cm)?/i);
  if (mbvMatch) {
    result.mbv = parseFloat(mbvMatch[1].replace(',', '.'));
  }

  // ILA patterns: ILA: 15cm, ILA 15.2, LA = 14
  const ilaMatch = text.match(/(?:ila|la)\s*[:\-=]?\s*(\d+(?:[.,]\d+)?)\s*(cm)?/i);
  if (ilaMatch) {
    result.ila = parseFloat(ilaMatch[1].replace(',', '.'));
  }

  return result;
}

/**
 * Extracts Doppler findings from USG text.
 */
function extractDoppler(text: string): DopplerFindings | null {
  const normalizedText = text.toLowerCase();

  // Check if Doppler is mentioned at all
  if (!normalizedText.includes('doppler') && 
      !normalizedText.includes('au ') &&
      !normalizedText.includes('acm') &&
      !normalizedText.includes('aut')) {
    return null;
  }

  const findings: DopplerFindings = {};

  // Check for normal doppler
  if (/doppler\s*(?:normal|nl|s\/a)/i.test(text)) {
    findings.normal = true;
    findings.description = 'Normal';
    return findings;
  }

  // Extract specific vessels
  const auMatch = text.match(/au\s*[:\-=]?\s*([^,;]+)/i);
  if (auMatch) {
    findings.umbilicalArtery = auMatch[1].trim();
  }

  const acmMatch = text.match(/acm\s*[:\-=]?\s*([^,;]+)/i);
  if (acmMatch) {
    findings.middleCerebralArtery = acmMatch[1].trim();
  }

  const autMatch = text.match(/aut\s*[:\-=]?\s*([^,;]+)/i);
  if (autMatch) {
    findings.uterineArtery = autMatch[1].trim();
  }

  const dvMatch = text.match(/dv\s*[:\-=]?\s*([^,;]+)/i);
  if (dvMatch) {
    findings.ductusVenosus = dvMatch[1].trim();
  }

  // Get full doppler description
  const dopplerMatch = text.match(/doppler\s*[:\-=]?\s*([^.]+)/i);
  if (dopplerMatch) {
    findings.description = dopplerMatch[1].trim();
  }

  return Object.keys(findings).length > 0 ? findings : null;
}

/**
 * Extracts placenta information from USG text.
 */
function extractPlacenta(text: string): PlacentaInfo | null {
  const normalizedText = text.toLowerCase();

  if (!normalizedText.includes('placenta')) {
    return null;
  }

  const info: PlacentaInfo = {};

  // Location
  if (/placenta\s*(anterior|ant)/i.test(text)) {
    info.location = 'anterior';
  } else if (/placenta\s*(posterior|post)/i.test(text)) {
    info.location = 'posterior';
  } else if (/placenta\s*(f[úu]ndica|fundal)/i.test(text)) {
    info.location = 'fundica';
  } else if (/placenta\s*(lateral)/i.test(text)) {
    info.location = 'lateral';
  } else if (/placenta\s*(pr[ée]via)/i.test(text)) {
    info.location = 'previa';
  }

  // Grade
  const gradeMatch = text.match(/placenta\s*(?:grau|gr)\s*(\d)/i);
  if (gradeMatch) {
    info.grade = parseInt(gradeMatch[1], 10);
  }

  return Object.keys(info).length > 0 ? info : null;
}
