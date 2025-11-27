import { PatientData, ProcessedResult, GestationalAge } from "@/types/patient";

// Simulate processing delay for demonstration
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const processPatients = async (patients: PatientData[]): Promise<ProcessedResult[]> => {
  const results: ProcessedResult[] = [];
  const referenceDate = new Date();

  for (const patient of patients) {
    await delay(50); // Simulate processing time

    try {
      const result = processPatient(patient, referenceDate);
      results.push(result);
    } catch (error) {
      console.error(`Error processing patient ${patient.ID}:`, error);
      results.push({
        id: patient.ID,
        nome: patient["Nome completo da paciente"],
        carteirinha: patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"],
        maternidade_desejada: patient["Maternidade que a paciente deseja"],
        status: "ERRO",
        observacoes: ["Erro ao processar dados do paciente"],
      });
    }
  }

  return results;
};

const processPatient = (patient: PatientData, referenceDate: Date): ProcessedResult => {
  const carteirinha = patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"];
  const nome = patient["Nome completo da paciente"];
  const maternidade = patient["Maternidade que a paciente deseja"];
  
  // Check if already scheduled
  const igPretendida = patient["Informe IG pretendida para o procedimento \n* Não confirmar essa data para a paciente, dependendo da agenda hospitalar poderemos ter uma variação\n* Para laqueaduras favor colocar data que completa 60 d"];
  if (igPretendida && igPretendida.toLowerCase().includes("agendada")) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      maternidade_desejada: maternidade,
      status: "JÁ_AGENDADA",
      observacoes: ["Paciente já possui data agendada: " + igPretendida],
    };
  }

  // Validate minimum required data
  if (!maternidade) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      maternidade_desejada: maternidade || "N/A",
      status: "ERRO",
      observacoes: ["Maternidade não especificada"],
    };
  }

  const dumData = patient["Data da DUM"];
  const usgData = patient["Data do Primeiro USG"];
  const usgWeeks = patient["Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF"];
  const usgDays = patient["Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF"];

  if (!dumData && !usgData) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      maternidade_desejada: maternidade,
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
  
  const igRecomendada = determineRecommendedGA(diagnosticos, indicacao, medicacao);

  // Calculate ideal delivery date
  const daysRemaining = igRecomendada.totalDays - igResult.age.totalDays;
  const dataIdeal = new Date(referenceDate);
  dataIdeal.setDate(dataIdeal.getDate() + daysRemaining);

  // Calculate minimum scheduling date (10 business days)
  const dataMinima = calculateMinimumDate(referenceDate, 10);

  // Calculate scheduling window
  const dataInicio = dataIdeal > dataMinima ? dataIdeal : dataMinima;
  const dataFim = new Date(dataIdeal);
  dataFim.setDate(dataFim.getDate() + 7);

  // Try to allocate a slot
  const agendamento = tryAllocateSlot(maternidade, dataInicio, dataFim);

  return {
    id: patient.ID,
    nome,
    carteirinha,
    maternidade_desejada: maternidade,
    status: agendamento.success ? "AGENDADA" : "NÃO_AGENDADA",
    ig_atual: formatGA(igResult.age),
    metodo_ig: igResult.method,
    ig_recomendada: formatGA(igRecomendada),
    data_ideal: dataIdeal,
    data_agendamento: agendamento.date,
    observacoes: agendamento.observations,
  };
};

interface GAResult {
  age: GestationalAge;
  method: "DUM" | "USG" | "AMBOS";
}

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

    const usgWeeksNum = parseFloat(usgWeeks);
    const usgDaysNum = usgDays ? parseInt(usgDays) : 0;
    const usgTotalDays = Math.floor(usgWeeksNum * 7) + usgDaysNum;

    const daysSinceUSG = Math.floor(
      (referenceDate.getTime() - usgDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentTotalDays = usgTotalDays + daysSinceUSG;

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

    // Calculate GA by DUM at USG date
    const daysSinceDUM = Math.floor(
      (usgDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );
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

    const daysSinceDUM = Math.floor(
      (referenceDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );

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

const determineRecommendedGA = (
  diagnosticos: string,
  indicacao: string,
  medicacao: string
): GestationalAge => {
  const searchText = `${diagnosticos} ${indicacao} ${medicacao}`.toLowerCase();

  // Priority checks
  if (
    searchText.includes("cerclagem") ||
    searchText.includes("iic") ||
    searchText.includes("incompetencia") ||
    searchText.includes("incompetência") ||
    searchText.includes("istmo")
  ) {
    return { totalDays: 105, weeks: 15, days: 0 }; // 15 weeks
  }

  if (
    searchText.includes("hipertens") ||
    searchText.includes("hipertensao") ||
    searchText.includes("hipertensão") ||
    searchText.includes("pre-eclampsia") ||
    searchText.includes("pré-eclampsia") ||
    searchText.includes("preeclampsia") ||
    searchText.includes("eclampsia") ||
    searchText.includes("hac") ||
    searchText.includes("has") ||
    searchText.includes("hag") ||
    searchText.includes("dheg")
  ) {
    return { totalDays: 259, weeks: 37, days: 0 }; // 37 weeks
  }

  if (searchText.includes("dmg") && searchText.includes("insulina")) {
    return { totalDays: 266, weeks: 38, days: 0 }; // 38 weeks
  }

  if (searchText.includes("dmg")) {
    return { totalDays: 280, weeks: 40, days: 0 }; // 40 weeks
  }

  // Elective indications
  if (
    searchText.includes("laqueadura") ||
    searchText.includes("laqueação") ||
    searchText.includes("desejo") ||
    searchText.includes("materno") ||
    searchText.includes("pelvic") ||
    searchText.includes("pélvic") ||
    searchText.includes("iterativ") ||
    searchText.includes("cesarea anterior") ||
    searchText.includes("gig") ||
    searchText.includes("macrossomia") ||
    searchText.includes("transvers") ||
    searchText.includes("cormic") ||
    searchText.includes("córmic")
  ) {
    return { totalDays: 273, weeks: 39, days: 0 }; // 39 weeks
  }

  // Default
  return { totalDays: 273, weeks: 39, days: 0 }; // 39 weeks
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

interface AllocationResult {
  success: boolean;
  date?: Date;
  observations: string[];
}

const tryAllocateSlot = (
  maternidade: string,
  startDate: Date,
  endDate: Date
): AllocationResult => {
  // Simplified allocation - in real implementation, this would check actual calendar
  const observations: string[] = [];
  
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    // Skip Sundays
    if (currentDate.getDay() === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Simulate slot availability (60% chance for demonstration)
    if (Math.random() > 0.4) {
      observations.push(`Agendada em ${formatDate(currentDate)}`);
      observations.push(`Maternidade: ${maternidade}`);
      return {
        success: true,
        date: new Date(currentDate),
        observations,
      };
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  observations.push("Nenhuma vaga disponível na janela de agendamento");
  observations.push(`Período buscado: ${formatDate(startDate)} a ${formatDate(endDate)}`);
  
  return {
    success: false,
    observations,
  };
};

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  try {
    // Handle MM/DD/YYYY format
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const month = parseInt(parts[0]) - 1; // Month is 0-indexed
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      return new Date(year, month, day);
    }
  } catch (error) {
    console.error("Error parsing date:", dateStr, error);
  }
  
  return null;
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
