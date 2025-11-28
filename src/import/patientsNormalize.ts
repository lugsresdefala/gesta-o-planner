/**
 * Patient Data Normalization Module
 * 
 * Normalizes raw patient data by:
 * - Mapping Portuguese column names to English snake_case
 * - Parsing dates with sentinel detection
 * - Parsing gestational age in multiple formats
 * - Parsing ultrasound blocks
 * - Normalizing phone numbers
 * - Conditionally calculating GA at scheduled dates (only if future)
 * 
 * Preserves raw data and never removes rows; errors are recorded per-row.
 */

import { RawPatientRecord, RawImportResult } from './patientsRaw';
import { parseDate, daysBetween, ParsedDate } from '../lib/parsers/date';
import { parseGestationalAge, GestationalAge, formatGA as formatGAUtil } from '../lib/parsers/gestationalAge';
import { parseUltrasoundBlock, ParsedUSG } from '../lib/parsers/ultrasound';
import { parsePhones, NormalizedPhone } from '../lib/parsers/phones';
import { calculateGAAtTargetDate, GAAtTargetDate } from '../lib/gestationalAgeCalc';

// Column mapping from Portuguese (original) to English (normalized)
export const COLUMN_MAPPING: Record<string, string[]> = {
  id: ['ID', 'id'],
  start_time: ['Hora de início', 'hora de inicio'],
  full_name: ['Nome completo da paciente', 'nome completo'],
  birth_date: ['Data de nascimento da gestante', 'data nascimento'],
  card_number: ['CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)', 'carteirinha'],
  num_pregnancies: ['Número de Gestações', 'numero gestacoes'],
  num_cesareans: ['Número de Partos Cesáreas', 'cesareas'],
  num_vaginal_births: ['Número de Partos Normais', 'partos normais'],
  num_abortions: ['Número de Abortos', 'abortos'],
  phones: [
    'Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital',
    'telefones contato'
  ],
  procedures: ['Informe o procedimento(s) que será(ão) realizado(s)', 'procedimentos'],
  lmp_status: ['DUM', 'dum status'],
  lmp_date: ['Data da DUM', 'data dum'],
  first_usg_date: ['Data do Primeiro USG', 'data primeiro usg'],
  first_usg_weeks: [
    'Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF',
    'semanas primeiro usg'
  ],
  first_usg_days: [
    'Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF',
    'dias primeiro usg'
  ],
  recent_usg: [
    'USG mais recente (Inserir data, apresentação, PFE com percentil, ILA/MBV e doppler)',
    'usg recente'
  ],
  intended_ga: [
    'Informe IG pretendida para o procedimento \n* Não confirmar essa data para a paciente, dependendo da agenda hospitalar poderemos ter uma variação\n* Para laqueaduras favor colocar data que completa 60 d',
    'ig pretendida'
  ],
  procedure_indication: ['Informe a indicação do procedimento', 'indicacao'],
  medications: ['Indique qual medicação e dosagem que a paciente utiliza.', 'medicacoes'],
  maternal_diagnoses: [
    'Indique os Diagnósticos Obstétricos Maternos ATUAIS ( ex. DMG com/sem insulina, Pre-eclampsia, Hipertensão gestacional, TPP na gestação atual, RPMO na gestação atual, hipotireoidismo gestacional, etc)',
    'diagnosticos maternos'
  ],
  placenta_previa_acretism: ['Placenta previa centro total com acretismo confirmado ou suspeito', 'placenta previa'],
  fetal_diagnoses: [
    'Indique os Diagnósticos Fetais (ex: RCF, Oligo/Polidramnio, Macrossomia, malformação fetal - especificar, cardiopatia fetal - especificar, etc)',
    'diagnosticos fetais'
  ],
  obstetric_history: [
    'Informe História Obstétrica Prévia Relevante e Diagnósticos clínicos cirúrgicos (ex. Aborto tardio, parto prematuro,  óbito fetal, DMG, macrossomia, eclampsia, pré eclampsia precoce, cardiopatia - esp',
    'historia obstetrica'
  ],
  maternal_icu_needed: ['Necessidade de reserva de UTI materna', 'uti materna'],
  blood_reserve_needed: ['Necessidade de reserva de Sangue', 'reserva sangue'],
  preferred_maternity: ['Maternidade que a paciente deseja', 'maternidade desejada'],
  responsible_physician: ['Médico responsável pelo agendamento', 'medico responsavel'],
  email: ['E-mail da paciente', 'email'],
  edd_lmp: ['DPP DUM', 'dpp dum'],
  edd_usg: ['DPP USG', 'dpp usg'],
  age: ['Idade', 'idade'],
  primary_scheduled_date: ['DATA AGENDADA', 'data agendada primaria'],
  final_scheduled_date: ['Data_Agendada', 'data agendada final'],
};

export interface NormalizedPatient {
  // Identity
  id: string;
  full_name: string;
  birth_date: ParsedDate;
  card_number: string;
  age: string;
  
  // Contact
  phones: NormalizedPhone[];
  email: string;
  
  // Obstetric history
  num_pregnancies: string;
  num_cesareans: string;
  num_vaginal_births: string;
  num_abortions: string;
  
  // LMP/DUM data
  lmp_status: string;
  lmp_date: ParsedDate;
  lmp_reliable: boolean;
  
  // First USG data
  first_usg_date: ParsedDate;
  first_usg_weeks: number | null;
  first_usg_days: number | null;
  first_usg_ga: GestationalAge | null;
  
  // Recent USG (parsed block)
  recent_usg: ParsedUSG;
  
  // Scheduling
  intended_ga: string;
  primary_scheduled_date: ParsedDate;
  final_scheduled_date: ParsedDate;
  
  // Calculated GA at scheduled dates (only if future)
  scheduled_primary_ga_days: number | null;
  scheduled_primary_ga_formatted: string | null;
  scheduled_final_ga_days: number | null;
  scheduled_final_ga_formatted: string | null;
  
  // Clinical data
  procedures: string;
  procedure_indication: string;
  medications: string;
  maternal_diagnoses: string;
  fetal_diagnoses: string;
  obstetric_history: string;
  placenta_previa_acretism: string;
  
  // Hospital/maternity
  preferred_maternity: string;
  maternal_icu_needed: string;
  blood_reserve_needed: string;
  responsible_physician: string;
  
  // Estimated due dates
  edd_lmp: ParsedDate;
  edd_usg: ParsedDate;
  
  // Metadata
  ga_method: 'USG' | 'DUM' | null;  // Which method was used for baseline
  row_errors: string[];  // Any errors encountered during normalization
  
  // Raw data reference
  _raw: RawPatientRecord;
}

export interface NormalizationResult {
  patients: NormalizedPatient[];
  rawPatients: RawPatientRecord[];  // Preserved raw layer
  columns: {
    original: string[];
    normalized: string[];
  };
  errors: Array<{ row: number; field: string; message: string }>;
}

/**
 * Normalizes raw patient data into structured format.
 * 
 * @param rawResult - The raw import result
 * @param today - Reference date for conditional GA calculation (defaults to current date)
 * @returns NormalizationResult with normalized patients and preserved raw data
 */
export function normalizePatients(
  rawResult: RawImportResult,
  today: Date = new Date()
): NormalizationResult {
  const result: NormalizationResult = {
    patients: [],
    rawPatients: rawResult.patients.map(p => ({ ...p })),  // Clone raw data
    columns: {
      original: [...rawResult.columns],
      normalized: Object.keys(COLUMN_MAPPING)
    },
    errors: []
  };

  for (let i = 0; i < rawResult.patients.length; i++) {
    const rawPatient = rawResult.patients[i];
    try {
      const normalized = normalizePatient(rawPatient, today, i);
      result.patients.push(normalized);
      
      // Collect row errors into result errors
      for (const err of normalized.row_errors) {
        result.errors.push({ row: i + 1, field: '', message: err });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ row: i + 1, field: '', message: `Failed to normalize: ${message}` });
      
      // Still create a minimal record to preserve the row
      result.patients.push(createErrorPatient(rawPatient, message));
    }
  }

  return result;
}

/**
 * Finds a column value by trying multiple possible column names.
 */
function findColumnValue(raw: RawPatientRecord, possibleNames: string[]): string {
  for (const name of possibleNames) {
    // Try exact match
    if (raw[name] !== undefined) {
      return raw[name];
    }
    // Try case-insensitive match
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(raw)) {
      if (key.toLowerCase() === lowerName || key.toLowerCase().includes(lowerName)) {
        return raw[key];
      }
    }
  }
  return '';
}

/**
 * Normalizes a single patient record.
 */
function normalizePatient(
  raw: RawPatientRecord,
  today: Date,
  rowIndex: number
): NormalizedPatient {
  const errors: string[] = [];

  // Helper to get column value
  const get = (field: string): string => {
    const names = COLUMN_MAPPING[field];
    return names ? findColumnValue(raw, names) : '';
  };

  // Parse dates
  const birthDate = parseDate(get('birth_date'));
  const lmpDate = parseDate(get('lmp_date'));
  const firstUsgDate = parseDate(get('first_usg_date'));
  const primaryScheduledDate = parseDate(get('primary_scheduled_date'));
  const finalScheduledDate = parseDate(get('final_scheduled_date'));
  const eddLmp = parseDate(get('edd_lmp'));
  const eddUsg = parseDate(get('edd_usg'));

  // Check LMP reliability
  const lmpStatus = get('lmp_status');
  const lmpReliable = !lmpStatus || 
    (!lmpStatus.toLowerCase().includes('incerta') &&
     !lmpStatus.toLowerCase().includes('não sabe') &&
     !lmpStatus.toLowerCase().includes('nao sabe'));

  // Parse first USG GA
  const usgWeeksStr = get('first_usg_weeks');
  const usgDaysStr = get('first_usg_days');
  const firstUsgWeeks = usgWeeksStr ? parseInt(usgWeeksStr, 10) : null;
  const firstUsgDays = usgDaysStr ? parseInt(usgDaysStr, 10) : null;
  
  let firstUsgGa: GestationalAge | null = null;
  if (firstUsgWeeks !== null && !isNaN(firstUsgWeeks)) {
    const days = firstUsgDays !== null && !isNaN(firstUsgDays) ? firstUsgDays : 0;
    firstUsgGa = {
      weeks: firstUsgWeeks,
      days,
      totalDays: firstUsgWeeks * 7 + days
    };
  }

  // Parse phones
  const phoneResult = parsePhones(get('phones'));
  if (phoneResult.errors.length > 0) {
    errors.push(...phoneResult.errors);
  }

  // Parse recent USG block
  const recentUsg = parseUltrasoundBlock(get('recent_usg'));

  // Calculate GA at scheduled dates (only if future)
  let scheduledPrimaryGaDays: number | null = null;
  let scheduledPrimaryGaFormatted: string | null = null;
  let scheduledFinalGaDays: number | null = null;
  let scheduledFinalGaFormatted: string | null = null;
  let gaMethod: 'USG' | 'DUM' | null = null;

  // Primary scheduled date
  if (primaryScheduledDate.date && !primaryScheduledDate.isSentinel) {
    const gaResult = calculateGAAtTargetDate({
      usgDate: get('first_usg_date'),
      usgWeeks: firstUsgWeeks,
      usgDays: firstUsgDays,
      dumDate: get('lmp_date'),
      dumReliable: lmpReliable,
      targetDate: primaryScheduledDate.date,
      today
    });

    if (gaResult.calculated) {
      scheduledPrimaryGaDays = gaResult.gaDays;
      scheduledPrimaryGaFormatted = gaResult.gaFormatted;
      gaMethod = gaResult.method;
      
      if (gaResult.error) {
        errors.push(`Primary scheduled GA: ${gaResult.error}`);
      }
    }
  }

  // Final scheduled date
  if (finalScheduledDate.date && !finalScheduledDate.isSentinel) {
    const gaResult = calculateGAAtTargetDate({
      usgDate: get('first_usg_date'),
      usgWeeks: firstUsgWeeks,
      usgDays: firstUsgDays,
      dumDate: get('lmp_date'),
      dumReliable: lmpReliable,
      targetDate: finalScheduledDate.date,
      today
    });

    if (gaResult.calculated) {
      scheduledFinalGaDays = gaResult.gaDays;
      scheduledFinalGaFormatted = gaResult.gaFormatted;
      if (!gaMethod) {
        gaMethod = gaResult.method;
      }
      
      if (gaResult.error) {
        errors.push(`Final scheduled GA: ${gaResult.error}`);
      }
    }
  }

  return {
    id: get('id') || `row_${rowIndex + 1}`,
    full_name: get('full_name'),
    birth_date: birthDate,
    card_number: get('card_number'),
    age: get('age'),
    
    phones: phoneResult.phones,
    email: get('email'),
    
    num_pregnancies: get('num_pregnancies'),
    num_cesareans: get('num_cesareans'),
    num_vaginal_births: get('num_vaginal_births'),
    num_abortions: get('num_abortions'),
    
    lmp_status: lmpStatus,
    lmp_date: lmpDate,
    lmp_reliable: lmpReliable,
    
    first_usg_date: firstUsgDate,
    first_usg_weeks: firstUsgWeeks,
    first_usg_days: firstUsgDays,
    first_usg_ga: firstUsgGa,
    
    recent_usg: recentUsg,
    
    intended_ga: get('intended_ga'),
    primary_scheduled_date: primaryScheduledDate,
    final_scheduled_date: finalScheduledDate,
    
    scheduled_primary_ga_days: scheduledPrimaryGaDays,
    scheduled_primary_ga_formatted: scheduledPrimaryGaFormatted,
    scheduled_final_ga_days: scheduledFinalGaDays,
    scheduled_final_ga_formatted: scheduledFinalGaFormatted,
    
    procedures: get('procedures'),
    procedure_indication: get('procedure_indication'),
    medications: get('medications'),
    maternal_diagnoses: get('maternal_diagnoses'),
    fetal_diagnoses: get('fetal_diagnoses'),
    obstetric_history: get('obstetric_history'),
    placenta_previa_acretism: get('placenta_previa_acretism'),
    
    preferred_maternity: get('preferred_maternity'),
    maternal_icu_needed: get('maternal_icu_needed'),
    blood_reserve_needed: get('blood_reserve_needed'),
    responsible_physician: get('responsible_physician'),
    
    edd_lmp: eddLmp,
    edd_usg: eddUsg,
    
    ga_method: gaMethod,
    row_errors: errors,
    
    _raw: raw
  };
}

/**
 * Creates a minimal patient record for error cases.
 */
function createErrorPatient(raw: RawPatientRecord, errorMessage: string): NormalizedPatient {
  return {
    id: raw['ID'] || 'error',
    full_name: raw['Nome completo da paciente'] || '',
    birth_date: { date: null, isSentinel: false, error: 'Not parsed' },
    card_number: '',
    age: '',
    
    phones: [],
    email: '',
    
    num_pregnancies: '',
    num_cesareans: '',
    num_vaginal_births: '',
    num_abortions: '',
    
    lmp_status: '',
    lmp_date: { date: null, isSentinel: false, error: 'Not parsed' },
    lmp_reliable: false,
    
    first_usg_date: { date: null, isSentinel: false, error: 'Not parsed' },
    first_usg_weeks: null,
    first_usg_days: null,
    first_usg_ga: null,
    
    recent_usg: {
      ga: null,
      presentation: null,
      fetalWeight: null,
      percentile: null,
      mbv: null,
      ila: null,
      doppler: null,
      placenta: null,
      rawText: '',
      errors: []
    },
    
    intended_ga: '',
    primary_scheduled_date: { date: null, isSentinel: false, error: 'Not parsed' },
    final_scheduled_date: { date: null, isSentinel: false, error: 'Not parsed' },
    
    scheduled_primary_ga_days: null,
    scheduled_primary_ga_formatted: null,
    scheduled_final_ga_days: null,
    scheduled_final_ga_formatted: null,
    
    procedures: '',
    procedure_indication: '',
    medications: '',
    maternal_diagnoses: '',
    fetal_diagnoses: '',
    obstetric_history: '',
    placenta_previa_acretism: '',
    
    preferred_maternity: '',
    maternal_icu_needed: '',
    blood_reserve_needed: '',
    responsible_physician: '',
    
    edd_lmp: { date: null, isSentinel: false, error: 'Not parsed' },
    edd_usg: { date: null, isSentinel: false, error: 'Not parsed' },
    
    ga_method: null,
    row_errors: [errorMessage],
    
    _raw: raw
  };
}
