import { CalendarManager, calculateGestationalAge } from './calendarManager';
import { PatientData, GestationalAge } from './types';

// Mapping of maternity names for normalization
const maternityMapping: Record<string, string> = {
    'Salvalus': 'Salvalus',
    'NotreCare': 'NotreCare',
    'Cruzeiro': 'Cruzeiro',
    'Guarulhos': 'Guarulhos',
    'NDN': 'NDN',
    'sem preferência': 'sem preferência'
};

// Normalize maternity name based on exact mapping
export function normalizeMaternityName(maternity: string): string {
    return maternityMapping[maternity] || maternity;
}

// Pre-compiled regex patterns for efficient diagnosis matching
const DIAGNOSIS_REGEX_MAP: Array<{ pattern: RegExp; week: number }> = [
    { pattern: /DMG.*insulin/, week: 37 },
    { pattern: /DMG.*sem insulin/, week: 38 },
    { pattern: /HAC/, week: 39 },
    { pattern: /Hipertensão gestacional/, week: 40 },
    { pattern: /DHEG/, week: 40 },
    { pattern: /RCF precoce/, week: 38 },  // More specific pattern first
    { pattern: /RCF/, week: 39 },
    { pattern: /Feto GIG/, week: 39 },
    { pattern: /Feto PIG/, week: 38 },
    { pattern: /Polidrâmnio/, week: 40 },
    { pattern: /Iteratividade/, week: 39 },
    { pattern: /Laqueadura/, week: 38 },
    { pattern: /Desejo materno/, week: 37 }
];

// Determine recommended gestational age based on diagnosis
export function determineRecommendedGA(diagnosis: string): number {
    for (const { pattern, week } of DIAGNOSIS_REGEX_MAP) {
        if (pattern.test(diagnosis)) {
            return week;
        }
    }
    return 40; // Default case
}

// Process patient and track original and normalized maternity
export function processPatient(patient: PatientData): ProcessedResult {
    const normalizedMaternity = normalizeMaternityName(patient.maternityName);
    const recommendedGA = determineRecommendedGA(patient.diagnosis);
    const gestationalAge: GestationalAge = calculateGestationalAge(patient.conceptionDate);

    return {
        originalMaternity: patient.maternityName,
        normalizedMaternity: normalizedMaternity,
        originalGA: gestationalAge,
        recommendedGA: recommendedGA
    };
}
