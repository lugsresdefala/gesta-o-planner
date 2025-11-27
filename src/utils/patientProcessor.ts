import { PatientData, ProcessedResult, GestationalAge } from "@/types/patient";
import { CalendarManager } from "./maternityCalendar";

export { CalendarManager };

// Simulate processing delay for demonstration
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const processPatients = async (
  patients: PatientData[]
): Promise<{ results: ProcessedResult[]; calendarManager: CalendarManager }> => {
  const results: ProcessedResult[] = [];
  const referenceDate = new Date();
  const calendarManager = new CalendarManager();

  for (const patient of patients) {
    await delay(50); // Simulate processing time

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
        maternidade_desejada: patient["Maternidade que a paciente deseja"],
        status: "ERRO",
        observacoes: ["Erro ao processar dados do paciente"],
      });
    }
  }

  return { results, calendarManager };
};

// Normalize maternity names from TSV to system names
const normalizeMaternityName = (raw: string): string | null => {
  if (!raw) return null;
  
  const normalized = raw.toLowerCase().trim().replace(/\s+/g, ' '); // Normaliza espaços
  
  // Map common variations to system names (always return PascalCase used by CalendarManager)
  if (normalized.includes('guarulhos') || 
      normalized.includes('guaru')) return 'Guarulhos';
  if (normalized.includes('notrecare') || 
      normalized.includes('notre care') || 
      normalized.includes('notre-care') ||
      normalized.includes('notre')) return 'NotreCare';
  if (normalized.includes('salvalus') ||
      normalized.includes('salva lus')) return 'Salvalus';
  if (normalized.includes('cruzeiro') || 
      normalized.includes('do carmo') ||
      normalized.includes('ns do carmo') ||
      normalized.includes('nossa senhora')) return 'Cruzeiro';
  
  // Handle "no preference" variations
  if (normalized === 'ndn' || 
      normalized === '--' || 
      normalized === '-' ||
      normalized === '' ||
      normalized === 'nada' ||
      normalized === 'n/a' ||
      normalized === 'na' ||
      normalized === 'sem preferencia' ||
      normalized === 'sem preferência' ||
      normalized === 'qualquer' ||
      normalized === 'qualquer uma' ||
      normalized === 'tanto faz' ||
      normalized === 'nenhuma') {
    return null; // Will allocate to any available maternity
  }
  
  // Preservar valor original para análise/debug
  // Isso permite identificar erros de digitação nos logs
  console.warn(`Maternidade não reconhecida: "${raw}". Usando valor original.`);
  return raw.trim(); // Retorna o valor original limpo
};

const processPatient = (
  patient: PatientData,
  referenceDate: Date,
  calendarManager: CalendarManager
): ProcessedResult => {
  const carteirinha = patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"];
  const nome = patient["Nome completo da paciente"];
  const maternidadeRaw = patient["Maternidade que a paciente deseja"];
  const maternidade = normalizeMaternityName(maternidadeRaw);
  
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
  const diagnosticos = patient["Indique os Diagnósticos Obstétricos Maternos ATUAIS ( ex. DMG com/sem insulina, Pre-eclampsia, Hipertensão gestacional, TPP na gestação atual, RPMO na gestação atual, hipotireoidismo gestacional, etc)"];
  const indicacao = patient["Informe a indicação do procedimento"];
  const medicacao = patient["Indique qual medicação e dosagem que a paciente utiliza."];
  
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

// Máximo de dias para idade gestacional (42 semanas × 7 dias)
const MAX_IG_DAYS = 294;

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

const determineRecommendedGA = (
  diagnosticos: string,
  indicacao: string,
  medicacao: string
): RecommendedGAResult => {
  const searchText = `${diagnosticos || ''} ${indicacao || ''} ${medicacao || ''}`.toLowerCase();

  // Priority checks - Cerclagem / IIC (15 weeks)
  if (
    searchText.includes("cerclagem") ||
    searchText.includes("iic") ||
    searchText.includes("incompetencia") ||
    searchText.includes("incompetência") ||
    searchText.includes("istmo") ||
    searchText.includes("istmocervical")
  ) {
    return { 
      ga: { totalDays: 105, weeks: 15, days: 0 },
      diagnosis: "Cerclagem/IIC" 
    }; // 15 weeks
  }

  // Hypertensive disorders (37 weeks)
  if (
    searchText.includes("hipertens") ||
    searchText.includes("hipertensao") ||
    searchText.includes("hipertensão") ||
    searchText.includes("pre-eclampsia") ||
    searchText.includes("pré-eclampsia") ||
    searchText.includes("preeclampsia") ||
    searchText.includes("pre eclampsia") ||
    searchText.includes("pré eclampsia") ||
    searchText.includes("eclampsia") ||
    searchText.includes("hac") ||
    searchText.includes("has") ||
    searchText.includes("hag") ||
    searchText.includes("dheg")
  ) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Hipertensão/Pré-eclâmpsia" 
    }; // 37 weeks
  }

  // DMG with insulin (38 weeks) - must have "insulina" but NOT "sem insulina"
  if ((searchText.includes("dmg") || searchText.includes("diabetes mellitus gestacional") || 
       searchText.includes("diabetes gestacional")) && 
      searchText.includes("insulina") && 
      !searchText.includes("sem insulina") &&
      !searchText.includes("s/ insulina")) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "DMG com insulina" 
    }; // 38 weeks
  }

  // Also check for "com insulina" explicitly
  if ((searchText.includes("dmg") || searchText.includes("diabetes mellitus gestacional") || 
       searchText.includes("diabetes gestacional")) && 
      searchText.includes("com insulina")) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "DMG com insulina" 
    }; // 38 weeks
  }

  // DMG without insulin (40 weeks)
  if (searchText.includes("dmg") || searchText.includes("diabetes mellitus gestacional") ||
      searchText.includes("diabetes gestacional")) {
    return { 
      ga: { totalDays: 280, weeks: 40, days: 0 },
      diagnosis: "DMG sem insulina" 
    }; // 40 weeks
  }

  // RCF - Restrição de Crescimento Fetal (37 weeks)
  if (
    searchText.includes("rcf") ||
    searchText.includes("rciu") ||
    searchText.includes("restricao de crescimento") ||
    searchText.includes("restrição de crescimento") ||
    searchText.includes("crescimento restrito")
  ) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "RCF/RCIU" 
    }; // 37 weeks
  }

  // Oligoâmnio (37 weeks)
  if (
    searchText.includes("oligoamnio") ||
    searchText.includes("oligoâmnio") ||
    searchText.includes("oligoidramnio") ||
    searchText.includes("oligoidrâmnio")
  ) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Oligoâmnio" 
    }; // 37 weeks
  }

  // Polidrâmnio (38 weeks)
  if (
    searchText.includes("polidramnio") ||
    searchText.includes("polidrâmnio") ||
    searchText.includes("polihidramnio") ||
    searchText.includes("polihidrâmnio")
  ) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Polidrâmnio" 
    }; // 38 weeks
  }

  // Elective indications (39 weeks)
  if (
    searchText.includes("laqueadura") ||
    searchText.includes("laqueação") ||
    searchText.includes("desejo") ||
    searchText.includes("materno") ||
    searchText.includes("pelvic") ||
    searchText.includes("pélvic") ||
    searchText.includes("iterativ") ||
    searchText.includes("cesarea anterior") ||
    searchText.includes("cesarea anterior") ||
    searchText.includes("cesárea anterior") ||
    searchText.includes("gig") ||
    searchText.includes("macrossomia") ||
    searchText.includes("transvers") ||
    searchText.includes("cormic") ||
    searchText.includes("córmic")
  ) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Indicação eletiva" 
    }; // 39 weeks
  }

  // Default
  return { 
    ga: { totalDays: 273, weeks: 39, days: 0 },
    diagnosis: "Padrão (sem diagnóstico específico)" 
  }; // 39 weeks
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
