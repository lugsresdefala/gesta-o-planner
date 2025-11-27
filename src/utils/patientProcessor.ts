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

  // Helper function for keyword detection
  const hasKeyword = (keywords: string[]): boolean => 
    keywords.some(k => searchText.includes(k));

  // ========================================
  // PRIORITY 1: CRITICAL CONDITIONS (earliest GA)
  // ========================================

  // 1. RPMO - Rotura Prematura de Membranas (34 weeks = 238 days)
  if (hasKeyword(["rpmo", "rotura prematura", "ruptura prematura", "amniorrexe", "bolsa rota"])) {
    return { 
      ga: { totalDays: 238, weeks: 34, days: 0 },
      diagnosis: "RPMO (Rotura Prematura de Membranas)" 
    };
  }

  // 2. RCIU/RCF + Oligoâmnio (34 weeks = 238 days) - CRITICAL CORRECTION
  const hasRCIU = hasKeyword(["rcf", "rciu", "restricao de crescimento", "restrição de crescimento", 
                              "crescimento restrito", "crescimento fetal restrito", "ciur"]);
  const hasOligoamnio = hasKeyword(["oligoamnio", "oligoâmnio", "oligoidramnio", "oligoidrâmnio", 
                                    "oligodramnio", "oligodrâmnio"]);
  if (hasRCIU && hasOligoamnio) {
    return { 
      ga: { totalDays: 238, weeks: 34, days: 0 },
      diagnosis: "RCIU + Oligoâmnio" 
    };
  }

  // 3. Polidrâmnio severo (MB ≥160mm) - 35-37 weeks = 245-259 days (use 245)
  const hasPolidramnio = hasKeyword(["polidramnio", "polidrâmnio", "polihidramnio", "polihidrâmnio"]);
  const hasSevero = hasKeyword(["sever", "grave", "acentuad", ">160", "≥160", "160mm"]);
  if (hasPolidramnio && hasSevero) {
    return { 
      ga: { totalDays: 245, weeks: 35, days: 0 },
      diagnosis: "Polidrâmnio severo (MB ≥160mm)" 
    };
  }

  // 4. RCF <p3 com Doppler alterado ou comorbidade (34 weeks = 238 days)
  const hasDopplerAlterado = hasKeyword(["doppler alter", "fluxo alter", "ducto venoso alter", 
                                         "dv alter", "centralização", "diástole zero", 
                                         "diástole reversa", "ausência diástole"]);
  const hasP3 = hasKeyword(["<p3", "< p3", "menor p3", "menor que p3", "abaixo p3", 
                            "<3", "percentil 3", "p3"]);
  if (hasRCIU && hasP3 && hasDopplerAlterado) {
    return { 
      ga: { totalDays: 238, weeks: 34, days: 0 },
      diagnosis: "RCF <p3 com Doppler alterado" 
    };
  }

  // 5. Pré-eclâmpsia COM deterioração / Eclâmpsia (28-37 weeks - use 196 for urgent)
  const hasPreEclampsia = hasKeyword(["pre-eclampsia", "pré-eclampsia", "preeclampsia", 
                                      "pre eclampsia", "pré eclampsia", "pe", "eclampsia", 
                                      "dheg", "sheg"]);
  const hasDeterioration = hasKeyword(["deteriora", "grave", "sever", "iminência", "eminência",
                                       "hellp", "eclampsia", "convuls"]);
  if (hasPreEclampsia && hasDeterioration) {
    return { 
      ga: { totalDays: 196, weeks: 28, days: 0 },
      diagnosis: "Pré-eclâmpsia com deterioração / SHEG >28 semanas" 
    };
  }

  // 6. DM1/DM2 com descontrole ou complicações (36-37 weeks = 252-259 days, use 252)
  const hasDM1DM2 = hasKeyword(["dm1", "dm2", "dm 1", "dm 2", "diabetes mellitus tipo", 
                                "diabetes tipo 1", "diabetes tipo 2", "diabetes prévia", 
                                "diabetes pre-gestacional", "diabetes pré-gestacional",
                                "diabetes pregestacional"]);
  const hasDescontroleDM = hasKeyword(["descontrol", "mau controle", "mal control", 
                                       "hemoglobina glicada", "hba1c", "complicaç", 
                                       "retinopatia", "nefropatia", "vasculopatia"]);
  if (hasDM1DM2 && hasDescontroleDM) {
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "DM1/DM2 com descontrole ou complicações" 
    };
  }

  // ========================================
  // PRIORITY 2: HIGH-PRIORITY CONDITIONS (36-37 weeks)
  // ========================================

  // 7. Oligoâmnio isolado (MBV <20mm) - 36-37 weeks = 252-259 days (use 252)
  const hasOligoIsolado = hasKeyword(["mbv<", "mbv <", "<20mm", "< 20mm", "mbv 0", 
                                      "anidram", "anidrâm"]);
  if (hasOligoamnio && (hasOligoIsolado || !hasRCIU)) {
    // If oligoâmnio is present without RCIU, use 36-37 weeks
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "Oligoâmnio isolado" 
    };
  }

  // 8. Gestação gemelar monocoriônica (36 weeks = 252 days)
  const hasGemelar = hasKeyword(["gemelar", "gêmeos", "gemeos", "gemelares", "dupla", 
                                 "trigêmeos", "trigemelar"]);
  const hasMonocorionica = hasKeyword(["monocorion", "mono/di", "mono/mono", "monoamniot", 
                                       "mcda", "mcma", "mc"]);
  if (hasGemelar && hasMonocorionica) {
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "Gestação gemelar monocoriônica" 
    };
  }

  // 9. Placenta prévia com acretismo (36 weeks = 252 days)
  const hasAcretismo = hasKeyword(["acretismo", "acreta", "increta", "percreta", 
                                   "espectro placentário", "morbidamente aderida"]);
  const hasPlacentaPrevia = hasKeyword(["placenta previa", "placenta prévia", "pp centro", 
                                        "pp marginal", "inserção baixa"]);
  if (hasPlacentaPrevia && hasAcretismo) {
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "Placenta prévia com acretismo" 
    };
  }

  // 10. Aloimunização grave (36 weeks = 252 days)
  const hasAloimunizacao = hasKeyword(["aloimuniza", "isoimuniza", "rh negativ", 
                                       "coombs indireto", "anticorpo irregular", 
                                       "sensibiliza"]);
  const hasGraveAloi = hasKeyword(["grave", "sever", "hidropsia", "anemia fetal", 
                                   "transfus"]);
  if (hasAloimunizacao && hasGraveAloi) {
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "Aloimunização grave" 
    };
  }

  // ========================================
  // PRIORITY 3: MODERATE CONDITIONS (37 weeks)
  // ========================================

  // 11. IIC/Cerclagem - 37 weeks for birth/removal (259 days) - CRITICAL CORRECTION
  if (hasKeyword(["cerclagem", "iic", "incompetencia istmo", "incompetência istmo", 
                  "insuficiencia cervical", "insuficiência cervical", "istmocervical"])) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "IIC/Cerclagem (parto/remoção)" 
    };
  }

  // 12. Hipertensão gestacional (37 weeks = 259 days)
  if (hasKeyword(["hipertensao gestacional", "hipertensão gestacional", "hag", "has gestacional"])) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Hipertensão gestacional" 
    };
  }

  // 13. Pré-eclâmpsia SEM deterioração (37 weeks = 259 days)
  if (hasPreEclampsia && !hasDeterioration) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Pré-eclâmpsia sem deterioração" 
    };
  }

  // 14. Hipertensão crônica de difícil controle (3+ drogas) - 37 weeks = 259 days
  const hasHAC = hasKeyword(["hipertensao cronica", "hipertensão crônica", "hac", 
                             "hipertensao previa", "hipertensão prévia", "has crônica", 
                             "has cronica"]);
  const hasDificilControle = hasKeyword(["dificil controle", "difícil controle", 
                                         "refratária", "refrataria", "3 drogas", 
                                         "três drogas", "multiplas drogas", "múltiplas drogas"]);
  if (hasHAC && hasDificilControle) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "HAC de difícil controle (3+ drogas)" 
    };
  }

  // 15. DMG com insulina e descontrole ou repercussão fetal (37 weeks = 259 days)
  const hasDMG = hasKeyword(["dmg", "diabetes mellitus gestacional", "diabetes gestacional"]);
  const hasInsulina = hasKeyword(["insulina"]) && !hasKeyword(["sem insulina", "s/ insulina"]);
  const hasComInsulina = hasKeyword(["com insulina", "uso de insulina", "insulinizad"]);
  const hasDescontroleDMG = hasKeyword(["descontrol", "mau controle", "mal control", 
                                        "repercuss", "macrossomia", "gig", "polihidram"]);
  if (hasDMG && (hasInsulina || hasComInsulina) && hasDescontroleDMG) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "DMG com insulina + descontrole/repercussão fetal" 
    };
  }

  // 16. Lúpus em atividade (37 weeks = 259 days)
  const hasLupus = hasKeyword(["lupus", "lúpus", "les", "lúpus eritematoso"]);
  const hasAtividade = hasKeyword(["ativ", "flare", "exacerba", "descompens"]);
  if (hasLupus && hasAtividade) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Lúpus Eritematoso Sistêmico em atividade" 
    };
  }

  // 17. RCF <p3 sem Doppler alterado (37 weeks = 259 days)
  if (hasRCIU && hasP3 && !hasDopplerAlterado) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "RCF <p3 sem alteração Doppler" 
    };
  }

  // 18. Líquido amniótico limítrofe (37-39 weeks = 259-273 days, use 259)
  const hasLALimitrofe = hasKeyword(["limitrofe", "limítrofe", "borderline", 
                                     "la diminuido", "la diminuído", "la reduzido"]);
  if (hasLALimitrofe) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Líquido amniótico limítrofe" 
    };
  }

  // 19. Gestação gemelar dicoriônica com complicações (37 weeks = 259 days)
  const hasDicorionica = hasKeyword(["dicorion", "di/di", "dcda", "dc"]);
  const hasComplicacaoGemelar = hasKeyword(["complic", "discordant", "rciu", "rcf"]);
  if (hasGemelar && hasDicorionica && hasComplicacaoGemelar) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Gestação gemelar dicoriônica com complicações" 
    };
  }

  // ========================================
  // PRIORITY 4: MODERATE-LATE CONDITIONS (38 weeks)
  // ========================================

  // 20. DMG com insulina, bom controle, sem repercussão fetal (38 weeks = 266 days)
  if (hasDMG && (hasInsulina || hasComInsulina) && !hasDescontroleDMG) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "DMG com insulina, bom controle" 
    };
  }

  // 21. DM1/DM2 com bom controle, sem complicações (38 weeks = 266 days)
  if (hasDM1DM2 && !hasDescontroleDM) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "DM1/DM2 com bom controle" 
    };
  }

  // 22. Natimorto em gestação anterior (38-39 weeks = 266-273 days, use 266)
  if (hasKeyword(["natimorto", "óbito fetal", "obito fetal", "of anterior", 
                  "óbito fetal anterior", "morte fetal", "perda fetal tardia"])) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Natimorto em gestação anterior" 
    };
  }

  // 23. Trombofilias ou antecedente de trombose (38-39 weeks = 266-273 days, use 266)
  if (hasKeyword(["trombofil", "trombose", "tvp", "tep", "anticoagul", 
                  "heparina", "enoxaparina", "fator v leiden", "protromb", 
                  "antitromb", "proteína c", "proteina c", "proteína s", 
                  "proteina s", "antifosfol"])) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Trombofilias/Antecedente de trombose" 
    };
  }

  // 24. Anemia falciforme (38-39 weeks = 266-273 days, use 266)
  if (hasKeyword(["falciforme", "falcemia", "hbss", "hbsc", "drepanocit"])) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Anemia falciforme" 
    };
  }

  // 25. Lúpus sem atividade (38-39 weeks = 266-273 days, use 266)
  if (hasLupus && !hasAtividade) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Lúpus Eritematoso Sistêmico sem atividade" 
    };
  }

  // 26. Polidrâmnio leve-moderado (80mm < MB < 160mm) - 38-39 weeks = 266-273 days (use 266)
  if (hasPolidramnio && !hasSevero) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Polidrâmnio leve-moderado" 
    };
  }

  // 27. Placenta prévia sem acretismo (38 weeks = 266 days)
  if (hasPlacentaPrevia && !hasAcretismo) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Placenta prévia sem acretismo" 
    };
  }

  // 28. RCF p3-p10 com comorbidade materna (38 weeks = 266 days)
  const hasPIG = hasKeyword(["pig", "p3-p10", "p3 a p10", "entre p3", "percentil 3-10"]);
  const hasComorbidade = hasHAC || hasDMG || hasDM1DM2 || hasLupus;
  if (hasRCIU && hasPIG && hasComorbidade) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "RCF p3-p10 (PIG) com comorbidade materna" 
    };
  }

  // 29. Gestação gemelar dicoriônica sem complicações (38 weeks = 266 days)
  if (hasGemelar && hasDicorionica && !hasComplicacaoGemelar) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Gestação gemelar dicoriônica sem complicações" 
    };
  }

  // 30. Aloimunização leve/moderada (38 weeks = 266 days)
  if (hasAloimunizacao && !hasGraveAloi) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Aloimunização leve/moderada" 
    };
  }

  // ========================================
  // PRIORITY 5: LATE CONDITIONS (39 weeks)
  // ========================================

  // 31. RCF p3-p10 (PIG) sem comorbidade materna - preferência 39 semanas (273 days)
  if (hasRCIU && hasPIG && !hasComorbidade) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "RCF p3-p10 (PIG) sem comorbidade" 
    };
  }

  // 32. RCF sem especificação de percentil ou Doppler (padrão 37-39, use 37)
  if (hasRCIU) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "RCF/RCIU (sem especificação)" 
    };
  }

  // 33. Hipertensão crônica compensada (39-40 weeks = 273-280 days, use 273) - CRITICAL CORRECTION
  if (hasHAC && !hasDificilControle) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "HAC compensada" 
    };
  }

  // 34. Hipertensão genérica sem especificação (37 weeks para segurança)
  if (hasKeyword(["hipertens", "hipertensao", "hipertensão", "has"])) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Hipertensão (não especificada)" 
    };
  }

  // 35. DMG sem insulina, com descontrole ou repercussão fetal (37-38 weeks, use 259)
  if (hasDMG && !hasInsulina && !hasComInsulina && hasDescontroleDMG) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "DMG sem insulina + descontrole/repercussão" 
    };
  }

  // 36. DMG sem insulina, bom controle, sem repercussão fetal (39-40 weeks = 273-280 days, use 273)
  if (hasDMG && !hasInsulina && !hasComInsulina) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "DMG sem insulina, bom controle" 
    };
  }

  // 37. Cesárea com laqueadura tubária (39 weeks = 273 days)
  if (hasKeyword(["laqueadura", "laqueação", "ligadura tubária", "ligadura tubaria", 
                  "lt", "salpingectomia"]) && 
      hasKeyword(["cesarea", "cesárea", "parto cesare"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Cesárea com laqueadura tubária" 
    };
  }

  // 38. Parto cesárea por desejo materno (≥39 weeks = 273 days)
  if (hasKeyword(["desejo materno", "desejo da paciente", "cesarea eletiva", 
                  "cesárea eletiva", "a pedido"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Cesárea por desejo materno" 
    };
  }

  // 39. Obesidade (IMC ≥35) - 39-40 weeks = 273-280 days (use 273)
  if (hasKeyword(["obesidade", "obesa", "imc 35", "imc 40", "imc>35", "imc >35", 
                  "imc≥35", "obesidade morbida", "obesidade mórbida"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Obesidade (IMC ≥35)" 
    };
  }

  // ========================================
  // PRIORITY 6: ELECTIVE CONDITIONS (39 weeks)
  // ========================================

  // 40. Cesárea iterativa / cesárea anterior
  if (hasKeyword(["iterativ", "cesarea anterior", "cesárea anterior", "2 cesareas", 
                  "duas cesareas", "3 cesareas", "tres cesareas", "múltiplas cesareas"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Cesárea iterativa" 
    };
  }

  // 41. Apresentação anômala (pélvica, transversa, córmica)
  if (hasKeyword(["pelvic", "pélvic", "transvers", "cormic", "córmic", 
                  "apresentação anômala", "apresentação anomala"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Apresentação anômala" 
    };
  }

  // 42. Macrossomia / GIG
  if (hasKeyword(["macrossomia", "gig", "grande para idade", "peso fetal estimado alto", 
                  "pfe >4", "pfe acima"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Macrossomia/GIG" 
    };
  }

  // 43. Malformação fetal compatível com vida (38-39 weeks, use 266)
  if (hasKeyword(["malformacao", "malformação", "defeito congenito", "defeito congênito", 
                  "anomalia fetal"]) && !hasKeyword(["letal", "incompativel", "incompatível"])) {
    return { 
      ga: { totalDays: 266, weeks: 38, days: 0 },
      diagnosis: "Malformação fetal (compatível com vida)" 
    };
  }

  // 44. Cardiopatia fetal (37-39 weeks depending on severity, use 259)
  if (hasKeyword(["cardiopatia fetal", "cardiopatia congen", "defeito cardiaco", 
                  "defeito cardíaco", "coarctacao", "coarctação", "transposição", 
                  "transposicao", "tetralogia"])) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Cardiopatia fetal" 
    };
  }

  // 45. Gastrosquise (36-37 weeks = 252-259 days, use 252)
  if (hasKeyword(["gastrosquise", "gastrosquisis", "defeito parede abdominal"])) {
    return { 
      ga: { totalDays: 252, weeks: 36, days: 0 },
      diagnosis: "Gastrosquise" 
    };
  }

  // 46. Onfalocele (37-38 weeks = 259-266 days, use 259)
  if (hasKeyword(["onfalocele", "onfalocel"])) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Onfalocele" 
    };
  }

  // 47. Gestação gemelar genérica (sem especificação de corionicidade)
  if (hasGemelar && !hasMonocorionica && !hasDicorionica) {
    return { 
      ga: { totalDays: 259, weeks: 37, days: 0 },
      diagnosis: "Gestação gemelar (sem especificação)" 
    };
  }

  // Laqueadura sem menção de cesárea (39 weeks)
  if (hasKeyword(["laqueadura", "laqueação"])) {
    return { 
      ga: { totalDays: 273, weeks: 39, days: 0 },
      diagnosis: "Laqueadura" 
    };
  }

  // Default - indicação eletiva genérica
  return { 
    ga: { totalDays: 273, weeks: 39, days: 0 },
    diagnosis: "Padrão (sem diagnóstico específico)" 
  };
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
