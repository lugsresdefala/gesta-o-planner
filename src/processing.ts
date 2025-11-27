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

// Determine recommended gestational age based on diagnosis
export function determineRecommendedGA(diagnosis: string): number {
    const regexMap: Record<string, number> = {
        'DMG.*insulin': 37,
        'DMG.*sem insulin': 38,
        'HAC': 39,
        'Hipertensão gestacional': 40,
        'DHEG': 40,
        'RCF': 39,
        'RCF precoce': 38,
        'Feto GIG': 39,
        'Feto PIG': 38,
        'Polidrâmnio': 40,
        'Iteratividade': 39,
        'Laqueadura': 38,
        'Desejo materno': 37
    };

    for (const [key, week] of Object.entries(regexMap)) {
        if (new RegExp(key).test(diagnosis)) {
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
