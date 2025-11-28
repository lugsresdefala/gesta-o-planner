Segue o arquivo unificado, sem marcadores de conflito e com o bloco de condições clínicas consistente:

```ts
import { PatientData, ProcessedResult, GestationalAge } from "@/types/patient";
import { CalendarManager } from "./maternityCalendar";
import { findColumn } from "./columnMatcher";

export { CalendarManager };

// Column name alternatives for maternity preference
const MATERNITY_COLUMN_KEYWORDS = [
  "maternidade que a paciente deseja",
  "maternidade desejada",
  "maternidade",
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
        carteirinha:
          patient[
            "CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"
          ],
        telefone:
          patient[
            "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"
          ] || undefined,
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
  "ndn",
  "--",
  "-",
  "",
  "nada",
  "n/a",
  "na",
  "sem preferencia",
  "sem preferência",
  "qualquer",
  "qualquer uma",
  "tanto faz",
  "nenhuma",
]);

// Valid maternities with canonical names - O(1) lookup
const VALID_MATERNITIES = new Map<string, string>([
  ["guarulhos", "Guarulhos"],
  ["guaru", "Guarulhos"],
  ["notrecare", "NotreCare"],
  ["notre care", "NotreCare"],
  ["notre-care", "NotreCare"],
  ["salvalus", "Salvalus"],
  ["cruzeiro", "Cruzeiro"],
]);

// Normalize maternity names from TSV to system names
const normalizeMaternityName = (raw: string): string | null => {
  if (!raw) return null;

  const normalized = raw.toLowerCase().trim().replace(/\s+/g, " ");

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
  const carteirinha =
    patient[
      "CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"
    ];
  const nome = patient["Nome completo da paciente"];
  const maternidadeRaw = findColumn(patient, MATERNITY_COLUMN_KEYWORDS);
  const maternidade = normalizeMaternityName(maternidadeRaw || "");

  // Check if already scheduled
  const igPretendida =
    patient[
      "Informe IG pretendida para o procedimento \n* Não confirmar essa data para a paciente, dependendo da agenda hospitalar poderemos ter uma variação\n* Para laqueaduras favor colocar data que completa 60 d"
    ];
  if (igPretendida && igPretendida.toLowerCase().includes("agendada")) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      telefone:
        patient[
          "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"
        ] || undefined,
      maternidade_desejada: maternidade || "Sem preferência",
      status: "JÁ_AGENDADA",
      observacoes: ["Paciente já possui data agendada: " + igPretendida],
    };
  }

  const dumData = patient["Data da DUM"];
  const usgData = patient["Data do Primeiro USG"];
  const usgWeeks =
    patient[
      "Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF"
    ];
  const usgDays =
    patient[
      "Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF"
    ];

  if (!dumData && !usgData) {
    return {
      id: patient.ID,
      nome,
      carteirinha,
      telefone:
        patient[
          "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"
        ] || undefined,
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
      maternidade_desejada: maternidade || "Sem preferência",
      status: "ERRO",
      observacoes: ["Não foi possível calcular idade gestacional"],
    };
  }

  // Diagnósticos obstétricos maternos
  const diagnosticosMaternos = findColumn(patient, [
    "indique os diagnósticos obstétricos maternos",
    "diagnósticos obstétricos maternos",
  ]);

  // Diagnósticos fetais
  const diagnosticosFetais = findColumn(patient, [
    "indique os diagnósticos fetais",
    "diagnósticos fetais",
  ]);

  // Combinar ambos
  const diagnosticos = [diagnosticosMaternos, diagnosticosFetais]
    .filter(Boolean)
    .join(" ");

  const indicacao = findColumn(patient, [
    "informe a indicação do procedimento",
    "indicação do procedimento",
  ]);

  const medicacao = findColumn(patient, [
    "indique qual medicação e dosagem",
    "medicação e dosagem",
  ]);

  // Validate diagnosticos field
  const diagnosticosWarnings: string[] = [];
  const diagnosticosNormalized = (diagnosticos || "").toLowerCase().trim();
  if (
    !diagnosticos ||
    diagnosticosNormalized === "" ||
    diagnosticosNormalized === "ndn" ||
    diagnosticosNormalized === "--" ||
    diagnosticosNormalized === "-" ||
    diagnosticosNormalized === "n/a" ||
    diagnosticosNormalized === "na" ||
    diagnosticosNormalized === "nenhum" ||
    diagnosticosNormalized === "nada"
  ) {
    diagnosticosWarnings.push(
      "⚠️ Campo de diagnósticos vazio ou não informado - usando IG padrão de 39 semanas"
    );
  }

  const igRecomendadaResult = determineRecommendedGA(
    diagnosticos,
    indicacao,
    medicacao
  );
  const igRecomendada = igRecomendadaResult.ga;
  const diagnosticoDetectado = igRecomendadaResult.diagnosis;

  // Calculate ideal delivery date
  const daysRemaining = igRecomendada.totalDays - igResult.age.totalDays;
  const dataIdeal = new Date(referenceDate);
  dataIdeal.setDate(dataIdeal.getDate() + daysRemaining);

  // Calculate minimum scheduling date (10 business days)
  const dataMinima = calculateMinimumDate(referenceDate, 10);

  // Calculate scheduling window
  const dataInicio = dataIdeal > dataMinima ? dataIdeal : dataMinima;
  const dataFim = new Date(dataInicio);
  dataFim.setDate(dataFim.getDate() + 7);

  // Debug log for scheduling window validation
  console.log(
    `Paciente ${patient.ID}: dataInicio=${formatDate(
      dataInicio
    )}, dataFim=${formatDate(dataFim)}, maternidade=${maternidade}`
  );

  // Extract phone number
  const telefone =
    patient[
      "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"
    ];

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
    const maternities = ["Guarulhos", "NotreCare", "Salvalus", "Cruzeiro"];

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
        break;
      }
    }
  }

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
    telefone:
      patient[
        "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital"
      ] || undefined,
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

// Máximo de dias para idade gestacional (comentário e valor devem ser coerentes)
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

    if (currentTotalDays > MAX_IG_DAYS) {
      console.warn(
        `IG calculada excede limite máximo: ${currentTotalDays} dias (${Math.floor(
          currentTotalDays / 7
        )} semanas)`
      );
      return null;
    }

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

    if (dumDate.getTime() > referenceDate.getTime()) {
      console.warn(`DUM é data futura: ${dumData}`);
      return null;
    }

    if (usgDate.getTime() > referenceDate.getTime()) {
      console.warn(`Data do USG é futura: ${usgData}`);
      return null;
    }

    const daysSinceDUM = Math.floor(
      (usgDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDUM < 0) {
      console.warn(`DUM (${dumData}) é posterior ao USG (${usgData})`);
      return null;
    }

    const gaByDUMAtUSG = {
      totalDays: daysSinceDUM,
      weeks: Math.floor(daysSinceDUM / 7),
      days: daysSinceDUM % 7,
    };

    const usgWeeksNum = parseFloat(usgWeeks);
    const usgDaysNum = usgDays ? parseInt(usgDays) : 0;
    const gaByUSGAtUSG = Math.floor(usgWeeksNum * 7) + usgDaysNum;

    const tolerance = getTolerance(gaByUSGAtUSG);
    const difference = Math.abs(gaByDUMAtUSG.totalDays - gaByUSGAtUSG);

    const useDUM = difference <= tolerance;
    const chosenDate = useDUM ? dumDate : usgDate;
    const chosenGA = useDUM ? 0 : gaByUSGAtUSG;

    const daysSinceChosen = Math.floor(
      (referenceDate.getTime() - chosenDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currentTotalDays = chosenGA + daysSinceChosen;

    if (currentTotalDays > MAX_IG_DAYS) {
      console.warn(
        `IG calculada excede limite máximo: ${currentTotalDays} dias (${Math.floor(
          currentTotalDays / 7
        )} semanas)`
      );
      return null;
    }

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

    if (dumDate.getTime() > referenceDate.getTime()) {
      console.warn(`DUM é data futura: ${dumData}`);
      return null;
    }

    const daysSinceDUM = Math.floor(
      (referenceDate.getTime() - dumDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDUM > MAX_IG_DAYS) {
      console.warn(
        `IG pela DUM excede limite máximo: ${daysSinceDUM} dias (${Math.floor(
          daysSinceDUM / 7
        )} semanas)`
      );
      return null;
    }

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

// Condições clínicas ordenadas da IG mais restritiva para a menos restritiva
// (se paciente tem múltiplas condições, prevalece a mais restritiva)
// Protocolos Hapvida/NotreDame
const CLINICAL_CONDITIONS: Array<{
  name: string;
  pattern: RegExp;
  weeks: number;
  days: number;
}> = [
  // === 32-34 semanas ===
  {
    name: "Gemelar monocoriônico monoamniótico",
    pattern: /mono.?cori[oô]nic.+mono.?amni[oó]t|mono.?mono/i,
    weeks: 32,
    days: 0,
  },
  {
    name: "Trigemelar diamniótico",
    pattern: /trigem.+diamni/i,
    weeks: 32,
    days: 0,
  },

  // === 34 semanas ===
  {
    name: "Rotura prematura de membranas",
    pattern: /rpmo|rotura.+membrana|bolsa\s+rota/i,
    weeks: 34,
    days: 0,
  },
  {
    name: "RCIU + Oligoâmnio",
    pattern: /rciu.+oligo|rcf.+oligo|oligo.+rciu|oligo.+rcf/i,
    weeks: 34,
    days: 0,
  },
  {
    name: "Placenta prévia COM acretismo",
    pattern: /acretismo|placenta.+acret/i,
    weeks: 34,
    days: 0,
  },
  {
    name: "Gemelar monocoriônico diamniótico",
    pattern: /mono.?cori[oô]nic.+di.?amni|mono.?di/i,
    weeks: 34,
    days: 0,
  },

  // === 35-36 semanas ===
  {
    name: "Polidrâmnio severo",
    pattern: /polidr.+sever|mb\s*[>≥]\s*160|mbv\s*[>≥]\s*160/i,
    weeks: 35,
    days: 0,
  },
  {
    name: "Trigemelar triamniótico",
    pattern: /trigem.+triamni|trigem(?!.+diamni)/i,
    weeks: 35,
    days: 0,
  },
  {
    name: "Vasa prévia",
    pattern: /vasa\s*pr[ée]via/i,
    weeks: 36,
    days: 0,
  },
  {
    name: "Placenta prévia SEM acretismo",
    pattern: /placenta\s*pr[ée]via|placenta\s+previa/i,
    weeks: 36,
    days: 0,
  },
  {
    name: "Rotura uterina prévia",
    pattern: /rotura\s*uterina|ces[aá]rea\s+corporal/i,
    weeks: 36,
    days: 0,
  },
  {
    name: "DM1/DM2 descompensado",
    pattern:
      /dm[12].+descomp|dm[12].+descontr|diabetes\s+tipo\s*[12].+descontr/i,
    weeks: 36,
    days: 0,
  },
  {
    name: "RCF com Doppler alterado",
    pattern:
      /rcf.+doppler|rciu.+doppler|doppler.+alter.+rcf|doppler.+alter.+rciu/i,
    weeks: 36,
    days: 0,
  },
  {
    name: "Oligoâmnio isolado",
    pattern:
      /oligo[aâ]mnio|oligoidr[aâ]mnio|mbv\s*<\s*2|ila\s*<\s*5/i,
    weeks: 36,
    days: 0,
  },

  // === 37 semanas ===
  {
    name: "Pré-eclâmpsia",
    pattern: /pr[ée].?eclamp|pre.?eclamp|eclampsia/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Hipertensão gestacional",
    pattern: /hipertens[aã]o\s+gestacional|hag|dheg/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "HAC difícil controle",
    pattern: /hac.+dif[ií]cil|hac.+3\s*drogas|hac.+descomp/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "IIC/Cerclagem",
    pattern: /iic|incompet[eê]ncia\s+istmo|cerclagem/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "DMG com insulina descompensado",
    pattern: /dmg.+insulina.+descomp|dmg.+insulina.+descontr|dmg.+repercuss/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Gastrosquise",
    pattern: /gastrosquise/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Mielomeningocele grave",
    pattern: /mielomeningocele.+grave|mielomeningocele.+ventric/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Lúpus ativo",
    pattern: /l[úu]pus.+ativ|les\s+ativ/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "RCF < p3",
    pattern:
      /rcf\s*<\s*p?\s*3|rciu\s*<\s*p?\s*3|peso\s*<\s*p?\s*3/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Gemelar dicoriônico + complicação",
    pattern: /gemelar.+dicori.+rcf|dicori.+rcf|gemelar.+discord/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Aneuploidia fetal",
    pattern: /trissomia|aneuploidia|s[ií]ndrome\s+de\s+down/i,
    weeks: 37,
    days: 0,
  },
  {
    name: "Gemelar dicoriônico",
    pattern: /gemelar|dicori[oô]nic|di.?cori[oô]nic/i,
    weeks: 37,
    days: 0,
  },

  // === 38 semanas ===
  {
    name: "DMG com insulina",
    pattern:
      /dmg.+insulina|insulina.+dmg|diabetes\s+gestacional.+insulina|dmg\s+a2|dm\s*g.+insulino/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "DM1/DM2 controlado",
    pattern: /dm[12]|dmid|diabetes\s+mellitus\s+tipo|diabetes\s+tipo\s*[12]/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Polidrâmnio",
    pattern: /polidr[aâ]mnio|polihidr[aâ]mnio/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Miomectomia prévia",
    pattern: /miomectomia/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Trombofilias",
    pattern: /trombofilia|saaf|anticoagul|enoxaparina|clexane/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Anemia falciforme",
    pattern: /anemia\s+falciforme|falciforme/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Lúpus inativo",
    pattern: /l[úu]pus|les\b/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Natimorto anterior",
    pattern: /natimorto|[óo]bito\s+fetal\s+anterior/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Mielomeningocele/Onfalocele/Hérnia diafragmática",
    pattern: /mielomeningocele|onfalocele|h[ée]rnia\s+diafragm/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "Feto PIG",
    pattern:
      /pig|pequeno\s+para\s+idade|pfe\s*<\s*p?\s*10|peso\s*p?\s*[35](?!\d)/i,
    weeks: 38,
    days: 0,
  },
  {
    name: "RCF p3-p10",
    pattern: /rcf|rciu|restri[çc][aã]o\s+de\s+crescimento/i,
    weeks: 38,
    days: 0,
  },

  // === 39 semanas ===
  {
    name: "HAC compensada",
    pattern: /hac|hipertens[aã]o\s+cr[oô]nica|has\b/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "DMG sem insulina",
    pattern:
      /dmg|diabetes\s+gestacional|dm\s+gestacional|diabetes\s+mellitus\s+gestacional/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Hipotireoidismo",
    pattern: /hipotireoid|levotiroxina|puran/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Apresentação pélvica",
    pattern: /p[ée]lvic|apresenta[çc][aã]o\s+p[ée]lvic|pelvico/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Iteratividade",
    pattern: /iterativ|2[aª]\s*ces[aá]rea|ces[aá]rea\s+anterior/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Macrossomia/GIG",
    pattern:
      /macrossomia|gig\b|feto\s+gig|peso\s*>\s*p?\s*90|p\s*[>≥]\s*90/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Desejo materno",
    pattern: /desejo\s+materno|desejo\s+da\s+paciente/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Laqueadura",
    pattern: /laqueadura|laquea[çc][aã]o|lt\b/i,
    weeks: 39,
    days: 0,
  },
  {
    name: "Obesidade",
    pattern: /obesidade|imc\s*[>≥]\s*35|obesa/i,
    weeks: 39,
    days: 0,
  },

  // === 40 semanas (padrão) ===
  {
    name: "Gestação de baixo risco",
    pattern: /baixo\s+risco/i,
    weeks: 40,
    days: 0,
  },
];

// Função para determinar IG recomendada
const determineRecommendedGA = (
  diagnosticos: string | undefined,
  indicacao: string | undefined,
  medicacao: string | undefined
): RecommendedGAResult => {
  const searchText = `${diagnosticos || ""} ${indicacao || ""} ${
    medicacao || ""
  }`.toLowerCase();

  for (const condition of CLINICAL_CONDITIONS) {
    if (condition.pattern.test(searchText)) {
      return {
        ga: {
          totalDays: condition.weeks * 7 + condition.days,
          weeks: condition.weeks,
          days: condition.days,
        },
        diagnosis: condition.name,
      };
    }
  }

  // Padrão: 39 semanas para cesárea eletiva
  return {
    ga: { totalDays: 273, weeks: 39, days: 0 },
    diagnosis: "Padrão (sem condição específica identificada)",
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
    return (
      !isNaN(date.getTime()) &&
      date.getMonth() === month &&
      date.getDate() === day
    );
  };

  const isValidYear = (year: number): boolean => {
    if (year < 2020 || year > 2030) {
      console.warn(`Ano inválido para DUM/USG: ${year}`);
      return false;
    }
    return true;
  };

  try {
    const parts = dateStr.trim().split("/");
    if (parts.length !== 3) return null;

    const [part1, part2, part3] = parts.map((p) => parseInt(p, 10));

    // If part1 > 12, it's DD/MM/YYYY
    if (part1 > 12) {
      const day = part1;
      const month = part2 - 1;
      const year = part3;
      if (!isValidYear(year)) return null;
      const date = new Date(year, month, day);
      return isValidDate(date, month, day) ? date : null;
    }

    // If part2 > 12, it's MM/DD/YYYY
    if (part2 > 12) {
      const month = part1 - 1;
      const day = part2;
      const year = part3;
      if (!isValidYear(year)) return null;
      const date = new Date(year, month, day);
      return isValidDate(date, month, day) ? date : null;
    }

    // Ambiguous case – assume DD/MM/YYYY
    const day = part1;
    const month = part2 - 1;
    const year = part3;
    if (!isValidYear(year)) return null;
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
```
