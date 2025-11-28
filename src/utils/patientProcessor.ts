import { PatientData, ProcessedResult, GestationalAge } from "@/types/patient";
import { CalendarManager } from "./maternityCalendar";
import { findColumn } from "./columnMatcher";

export { CalendarManager };

// Column name alternatives for maternity preference
const MATERNITY_COLUMN_KEYWORDS = [
  'maternidade que a paciente deseja',
  'maternidade desejada',
  'maternidade'
];

export const processPatients = async (
  patients: PatientData[]
): Promise<{ results: ProcessedResult[]; calendarManager: CalendarManager }> => {
  const results: ProcessedResult[] = [];
  const referenceDate = new Date();
  const calendarManager = new CalendarManager();

  for (const patient of patients) {
    try {
      const result = processPatient(patient, referenceDate, calendarManager);
      results.push(result);
    } catch (error) {
      console.error(`Error processing patient ${patient.ID}:`, error);
      results.push({
        id: patient.ID,
        nome: patient["Nome completo da paciente"],
        carteirinha: patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"],
        telefone: patient["Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"] || undefined,
        maternidade_desejada: findColumn(patient, MATERNITY_COLUMN_KEYWORDS),
        status: "ERRO",
        observacoes: ["Erro ao processar dados do paciente"],
      });
    }
  }

  return { results, calendarManager };
};

// Pre-defined set for "no preference" values - O(1) lookup
const NO_PREFERENCE_VALUES = new Set([
  'ndn', '--', '-', '', 'nada', 'n/a', 'na',
  'sem preferencia', 'sem preferência', 'qualquer',
  'qualquer uma', 'tanto faz', 'nenhuma'
]);

// Valid maternities with canonical names - O(1) lookup
const VALID_MATERNITIES = new Map<string, string>([
  ['guarulhos', 'Guarulhos'],
  ['guaru', 'Guarulhos'],
  ['notrecare', 'NotreCare'],
  ['notre care', 'NotreCare'],
  ['notre-care', 'NotreCare'],
  ['salvalus', 'Salvalus'],
  ['cruzeiro', 'Cruzeiro'],
]);

// Normalize maternity names from TSV to system names
const normalizeMaternityName = (raw: string): string | null => {
  if (!raw) return null;
  
  const normalized = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Fast O(1) lookup for "no preference" values
  if (NO_PREFERENCE_VALUES.has(normalized)) {
    return null;
  }
  
  // Direct lookup - O(1)
  const found = VALID_MATERNITIES.get(normalized);
  if (found) return found;
  
  // Fallback: check if contains any valid maternity name
  for (const [key, value] of VALID_MATERNITIES) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  console.warn(`Maternidade não reconhecida: "${raw}".`);
  return null;
};

const processPatient = (
  patient: PatientData,
  referenceDate: Date,
  calendarManager: CalendarManager
): ProcessedResult => {
  const carteirinha = patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"];
  const nome = patient["Nome completo da paciente"];
  const maternidadeRaw = findColumn(patient, MATERNITY_COLUMN_KEYWORDS);
  const maternidade = normalizeMaternityName(maternidadeRaw || '');
  
  // Check if already scheduled
  const igPretendida = patient["Informe IG pretendida para o procedimento \n* Não confirmar essa data para a paciente, dependendo da agenda hospitalar poderemos ter uma variação\n* Para laqueaduras favor colocar data que completa 60 d"];
  if (igPretendida && igPretendida.toLowerCase().includes("agendada")) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      telefone: patient["Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"] || undefined,
      maternidade_desejada: maternidade || "Sem preferência",
      status: "JÁ_AGENDADA",
      observacoes: ["Paciente já possui data agendada: " + igPretendida],
    };
  }

  // Patients without preference can still be scheduled
  // Only error if they explicitly provided invalid data

  const dumData = patient["Data da DUM"];
  const usgData = patient["Data do Primeiro USG"];
  const usgWeeks = patient["Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF"];
  const usgDays = patient["Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF"];

  if (!dumData && !usgData) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      telefone: patient["Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"] || undefined,
      maternidade_desejada: maternidade || "Sem preferência",
      status: "ERRO",
      observacoes: ["Dados insuficientes: sem DUM e sem USG"],
    };
  }

  // Calculate current gestational age
  const igResult = calculateGestationalAge(
    referenceDate,
    patient.DUM,
    dumData,
    usgData,
    usgWeeks,
    usgDays
  );

  if (!igResult) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      maternidade_desejada: maternidade,
      status: "ERRO",
      observacoes: ["Não foi possível calcular idade gestacional"],
    };
  }

  // Determine recommended gestational age based on diagnosis
  const diagnosticos = findColumn(patient, [
    'diagnósticos obstétricos',
    'diagnósticos maternos',
    'diagnóstico',
    'dmg',
    'hipertensão',
    'pre-eclampsia'
  ]);

  const indicacao = findColumn(patient, [
    'indicação do procedimento',
    'indicacao',
    'procedimento'
  ]);

  const medicacao = findColumn(patient, [
    'qual medicação',
    'medicação e dosagem',
    'medicacao e dosagem'
  ]);
  
  // Validate diagnosticos field
  const diagnosticosWarnings: string[] = [];
  const diagnosticosNormalized = (diagnosticos || '').toLowerCase().trim();
  if (!diagnosticos || 
      diagnosticosNormalized === '' || 
      diagnosticosNormalized === 'ndn' || 
      diagnosticosNormalized === '--' ||
      diagnosticosNormalized === '-' ||
      diagnosticosNormalized === 'n/a' ||
      diagnosticosNormalized === 'na' ||
      diagnosticosNormalized === 'nenhum' ||
      diagnosticosNormalized === 'nada') {
    diagnosticosWarnings.push("⚠️ Campo de diagnósticos vazio ou não informado - usando IG padrão de 39 semanas");
  }
  
  const igRecomendadaResult = determineRecommendedGA(diagnosticos, indicacao, medicacao);
  const igRecomendada = igRecomendadaResult.ga;
  const diagnosticoDetectado = igRecomendadaResult.diagnosis;

  // Calculate ideal delivery date
  const daysRemaining = igRecomendada.totalDays - igResult.age.totalDays;
  const dataIdeal = new Date(referenceDate);
  dataIdeal.setDate(dataIdeal.getDate() + daysRemaining);

  // Calculate minimum scheduling date (10 business days)
  const dataMinima = calculateMinimumDate(referenceDate, 10);

  // Calculate scheduling window
  // Start date must be at least the minimum booking date
  const dataInicio = dataIdeal > dataMinima ? dataIdeal : dataMinima;
  // End date is 7 days after the START date (not ideal date) to ensure valid window
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + 7);

  // Extract phone number
  const telefone = patient["Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"];
  
  // Try to allocate a slot
  let agendamento;
  
  if (maternidade) {
    // Patient has a specific maternity preference
    agendamento = calendarManager.tryAllocateSlot(
      maternidade,
      dataInicio,
      dataFim,
      {
        id: patient.ID,
        name: nome,
        carteirinha,
        phone: telefone,
      }
    );
  } else {
    // Patient has no preference - try all maternities
    const maternities = ['Guarulhos', 'NotreCare', 'Salvalus', 'Cruzeiro'];
    
    // Initialize with failure
    agendamento = {
      success: false,
      observations: ["Nenhuma vaga disponível em nenhuma maternidade"],
    };
    
    for (const mat of maternities) {
      const attempt = calendarManager.tryAllocateSlot(
        mat,
        dataInicio,
        dataFim,
        {
          id: patient.ID,
          name: nome,
          carteirinha,
          phone: telefone,
        }
      );
      
      if (attempt.success) {
        agendamento = attempt;
        break; // Found a slot!
      }
    }
  }

  // Build observations with diagnostic info
  const observacoesFinais: string[] = [
    ...diagnosticosWarnings,
    `📋 Diagnóstico detectado: ${diagnosticoDetectado}`,
    `📊 Método IG: ${igResult.method}`,
    `🎯 IG recomendada: ${formatGA(igRecomendada)} (${igRecomendada.weeks} semanas)`,
    ...agendamento.observations,
  ];

  return {
    id: patient.ID,
    nome,
    carteirinha,
    telefone: patient["Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"] || undefined,
    maternidade_desejada: maternidadeRaw || "Sem preferência",
    maternidade_alocada: agendamento.maternity,
    status: agendamento.success ? "AGENDADA" : "NÃO_AGENDADA",
    ig_atual: formatGA(igResult.age),
    metodo_ig: igResult.method,
    ig_recomendada: formatGA(igRecomendada),
    data_ideal: dataIdeal,
    data_agendamento: agendamento.date,
    observacoes: observacoesFinais,
  };
};

interface GAResult {
  age: GestationalAge;
  method: "DUM" | "USG" | "AMBOS";
}

// Máximo de dias para idade gestacional (40 semanas × 7 dias) - limite clínico para cesárea eletiva
const MAX_IG_DAYS = 280;

const calculateGestationalAge = (
  referenceDate: Date,
  dumStatus: string,
  dumData: string,
  usgData: string,
  usgWeeks: string,
  usgDays: string
): GAResult | null => {
  const dumUnreliable =
    !dumStatus ||
    dumStatus.toLowerCase().includes("incerta") ||
    dumStatus.toLowerCase().includes("não sabe") ||
    dumStatus.toLowerCase().includes("nao sabe");

  // CASE 1: DUM absent or unreliable
  if (dumUnreliable || !dumData) {
    if (!usgData || !usgWeeks) return null;
    
    const usgDate = parseDate(usgData);
    if (!usgDate) return null;

    // Rejeitar USG no futuro
    if (usgDate.getTime() > referenceDate.getTime()) {
      console.warn(`Data do USG é futura: ${usgData}`);
      return null;
    }

    const usgWeeksNum = parseFloat(usgWeeks);
    const usgDaysNum = usgDays ? parseInt(usgDays) : 0;
    const usgTotalDays = Math.floor(usgWeeksNum * 7) + usgDaysNum;

    const daysSinceUSG = Math.floor(
      (referenceDate.getTime() - usgDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentTotalDays = usgTotalDays + daysSinceUSG;

    // Rejeitar IG > 42 semanas (294 dias)
    if (currentTotalDays > MAX_IG_DAYS) {
      console.warn(`IG calculada excede 42 semanas: ${currentTotalDays} dias (${Math.floor(currentTotalDays/7)} semanas)`);
      return null;
    }

    // Rejeitar IG negativa
    if (currentTotalDays < 0) {
      console.warn(`IG calculada é negativa: ${currentTotalDays} dias`);
      return null;
    }

    return {
      age: {
        totalDays: currentTotalDays,
        weeks: Math.floor(currentTotalDays / 7),
        days: currentTotalDays % 7,
      },
      method: "USG",
    };
  }

  // CASE 2: DUM reliable + USG available
  if (dumData && usgData && usgWeeks) {
    const dumDate = parseDate(dumData);
    const usgDate = parseDate(usgData);
    
    if (!dumDate || !usgDate) return null;

    // Rejeitar DUM no futuro
    if (dumDate.getTime() > referenceDate.getTime()) {
      console.warn(`DUM é data futura: ${dumData}`);
      return null;
    }

    // Rejeitar USG no futuro
    if (usgDate.getTime() > referenceDate.getTime()) {
      console.warn(`Data do USG é futura: ${usgData}`);
      return null;
    }

    // Calculate GA by DUM at USG date
    const daysSinceDUM = Math.floor(
      (usgDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Rejeitar DUM posterior ao USG
    if (daysSinceDUM < 0) {
      console.warn(`DUM (${dumData}) é posterior ao USG (${usgData})`);
      return null;
    }

    const gaByDUMAtUSG = {
      totalDays: daysSinceDUM,
      weeks: Math.floor(daysSinceDUM / 7),
      days: daysSinceDUM % 7,
    };

    // Calculate GA by USG
    const usgWeeksNum = parseFloat(usgWeeks);
    const usgDaysNum = usgDays ? parseInt(usgDays) : 0;
    const gaByUSGAtUSG = Math.floor(usgWeeksNum * 7) + usgDaysNum;

    // Determine tolerance
    const tolerance = getTolerance(gaByUSGAtUSG);
    const difference = Math.abs(gaByDUMAtUSG.totalDays - gaByUSGAtUSG);

    // Choose method
    const useDUM = difference <= tolerance;
    const chosenDate = useDUM ? dumDate : usgDate;
    const chosenGA = useDUM ? 0 : gaByUSGAtUSG;

    const daysSinceChosen = Math.floor(
      (referenceDate.getTime() - chosenDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentTotalDays = chosenGA + daysSinceChosen;

    // Rejeitar IG > 42 semanas
    if (currentTotalDays > MAX_IG_DAYS) {
      console.warn(`IG calculada excede 42 semanas: ${currentTotalDays} dias`);
      return null;
    }

    // Rejeitar IG negativa
    if (currentTotalDays < 0) {
      console.warn(`IG calculada é negativa: ${currentTotalDays} dias`);
      return null;
    }

    return {
      age: {
        totalDays: currentTotalDays,
        weeks: Math.floor(currentTotalDays / 7),
        days: currentTotalDays % 7,
      },
      method: useDUM ? "DUM" : "USG",
    };
  }

  // CASE 3: Only DUM available
  if (dumData) {
    const dumDate = parseDate(dumData);
    if (!dumDate) return null;

    // Rejeitar DUM no futuro
    if (dumDate.getTime() > referenceDate.getTime()) {
      console.warn(`DUM é data futura: ${dumData}`);
      return null;
    }

    const daysSinceDUM = Math.floor(
      (referenceDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Rejeitar IG > 42 semanas
    if (daysSinceDUM > MAX_IG_DAYS) {
      console.warn(`IG pela DUM excede 42 semanas: ${daysSinceDUM} dias (${Math.floor(daysSinceDUM/7)} semanas)`);
      return null;
    }

    // Rejeitar IG negativa
    if (daysSinceDUM < 0) {
      console.warn(`IG pela DUM é negativa: ${daysSinceDUM} dias`);
      return null;
    }

    return {
      age: {
        totalDays: daysSinceDUM,
        weeks: Math.floor(daysSinceDUM / 7),
        days: daysSinceDUM % 7,
      },
      method: "DUM",
    };
  }

  return null;
};

const getTolerance = (gaInDays: number): number => {
  const weeks = Math.floor(gaInDays / 7);
  
  if (weeks >= 8 && weeks <= 9) return 5;
  if (weeks >= 10 && weeks <= 11) return 7;
  if (weeks >= 12 && weeks <= 13) return 10;
  if (weeks >= 14 && weeks <= 15) return 14;
  if (weeks >= 16 && weeks <= 19) return 21;
  return 21; // > 19 weeks
};

interface RecommendedGAResult {
  ga: GestationalAge;
  diagnosis: string;
}

// Pre-compiled regex patterns for diagnosis matching - avoids re-creating patterns on each call
const DIAGNOSIS_PATTERNS = {
  cerclagem: /cerclagem|iic|incompetencia|incompetência|istmo|istmocervical/i,
  
  hypertension: /hipertens[aã]o|hipertensao|pre[-\s]?eclampsia|pré[-\s]?eclampsia|eclampsia|hac|has|hag|dheg|press[aã]o\s+alta|hipertens\s+descompensad/i,
  
  dmg: /dmg|diabetes\s+mellitus\s+gestacional|diabetes\s+gestacional|diabete\s+gestacional|dmg\s+a1|dmg\s+a2/i,
  
  insulinWith: /com\s+insulina|uso\s+de\s+insulina|em\s+uso\s+de\s+insulina|insulina\s+nph|insulina\s+regular|a2(?!\d)/i,
  
  insulinWithout: /sem\s+insulina|s[/\\]\s*insulina|dieta|a1(?!\d)|controlada\s+com\s+dieta/i,
  
  insulin: /insulina/i,
  
  rcf: /rcf|rciu|restri[cç][aã]o\s+de\s+crescimento|crescimento\s+restrito|feto\s+pig|pequeno\s+para\s+idade/i,
  
  oligoamnio: /oligo[aâ]mnio|oligoidr[aâ]mnio/i,
  
  polidramnio: /polidr[aâ]mnio|polihidr[aâ]mnio/i,
  
  elective: /laqueadura|laquea[cç][aã]o|desejo\s+materno|desejo\s+da\s+paciente|iterativ|ces[aá]rea\s+anterior|gig|macrossomia|transvers|p[eé]lvic|c[oó]rmic|apresenta[cç][aã]o\s+p[eé]lvica/i,
};

// Pre-defined GA results to avoid object creation on each call
const GA_RESULTS: Record<string, RecommendedGAResult> = {
  cerclagem: { ga: { totalDays: 105, weeks: 15, days: 0 }, diagnosis: "Cerclagem/IIC" },
  hypertension: { ga: { totalDays: 259, weeks: 37, days: 0 }, diagnosis: "Hipertensão/Pré-eclâmpsia" },
  dmgWithInsulin: { ga: { totalDays: 266, weeks: 38, days: 0 }, diagnosis: "DMG com insulina" },
  dmgWithoutInsulin: { ga: { totalDays: 280, weeks: 40, days: 0 }, diagnosis: "DMG sem insulina" },
  rcf: { ga: { totalDays: 259, weeks: 37, days: 0 }, diagnosis: "RCF/RCIU" },
  oligoamnio: { ga: { totalDays: 259, weeks: 37, days: 0 }, diagnosis: "Oligoâmnio" },
  polidramnio: { ga: { totalDays: 266, weeks: 38, days: 0 }, diagnosis: "Polidrâmnio" },
  elective: { ga: { totalDays: 273, weeks: 39, days: 0 }, diagnosis: "Indicação eletiva" },
  default: { ga: { totalDays: 273, weeks: 39, days: 0 }, diagnosis: "Padrão (sem diagnóstico específico)" },
};

const determineRecommendedGA = (
  diagnosticos: string,
  indicacao: string,
  medicacao: string
): RecommendedGAResult => {
  const searchText = `${diagnosticos || ''} ${indicacao || ''} ${medicacao || ''}`.toLowerCase();

  // Priority checks - Cerclagem / IIC (15 weeks)
  if (DIAGNOSIS_PATTERNS.cerclagem.test(searchText)) {
    return GA_RESULTS.cerclagem;
  }

  // Hypertensive disorders (37 weeks)
  if (DIAGNOSIS_PATTERNS.hypertension.test(searchText)) {
    return GA_RESULTS.hypertension;
  }

  // DMG checks - more complex logic due to insulin conditions
  if (DIAGNOSIS_PATTERNS.dmg.test(searchText)) {
    // DMG with insulin (38 weeks) - must have "insulina" but NOT "sem insulina"
    if (DIAGNOSIS_PATTERNS.insulin.test(searchText) && 
        !DIAGNOSIS_PATTERNS.insulinWithout.test(searchText)) {
      return GA_RESULTS.dmgWithInsulin;
    }
    // Also check for "com insulina" explicitly
    if (DIAGNOSIS_PATTERNS.insulinWith.test(searchText)) {
      return GA_RESULTS.dmgWithInsulin;
    }
    // DMG without insulin (40 weeks)
    return GA_RESULTS.dmgWithoutInsulin;
  }

  // RCF - Restrição de Crescimento Fetal (37 weeks)
  if (DIAGNOSIS_PATTERNS.rcf.test(searchText)) {
    return GA_RESULTS.rcf;
  }

  // Oligoâmnio (37 weeks)
  if (DIAGNOSIS_PATTERNS.oligoamnio.test(searchText)) {
    return GA_RESULTS.oligoamnio;
  }

  // Polidrâmnio (38 weeks)
  if (DIAGNOSIS_PATTERNS.polidramnio.test(searchText)) {
    return GA_RESULTS.polidramnio;
  }

  // Elective indications (39 weeks)
  if (DIAGNOSIS_PATTERNS.elective.test(searchText)) {
    return GA_RESULTS.elective;
  }

  // Default
  return GA_RESULTS.default;
};

const calculateMinimumDate = (referenceDate: Date, businessDays: number): Date => {
  const result = new Date(referenceDate);
  let counted = 0;

  while (counted < businessDays) {
    result.setDate(result.getDate() + 1);
    
    // Skip Sundays (0 = Sunday)
    if (result.getDay() !== 0) {
      counted++;
    }
  }

  return result;
};

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  const isValidDate = (date: Date, month: number, day: number): boolean => {
    return !isNaN(date.getTime()) && date.getMonth() === month && date.getDate() === day;
  };
  
  try {
    const parts = dateStr.trim().split("/");
    if (parts.length !== 3) return null;

    const [part1, part2, part3] = parts.map(p => parseInt(p, 10));
    
    // Detect format based on numeric values
    // If part1 > 12, it's DD/MM/YYYY (Brazilian format)
    if (part1 > 12) {
      const day = part1;
      const month = part2 - 1; // 0-indexed
      const year = part3;
      const date = new Date(year, month, day);
      return isValidDate(date, month, day) ? date : null;
    }
    
    // If part2 > 12, it's MM/DD/YYYY (American format)
    if (part2 > 12) {
      const month = part1 - 1; // 0-indexed
      const day = part2;
      const year = part3;
      const date = new Date(year, month, day);
      return isValidDate(date, month, day) ? date : null;
    }
    
    // Ambiguous case (e.g., 05/03/2025) - assume DD/MM/YYYY (Brazilian standard)
    const day = part1;
    const month = part2 - 1;
    const year = part3;
    const date = new Date(year, month, day);
    return isValidDate(date, month, day) ? date : null;
    
  } catch (error) {
    console.error("Error parsing date:", dateStr, error);
    return null;
  }
};

const formatGA = (ga: GestationalAge): string => {
  return `${ga.weeks}s ${ga.days}d`;
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};
