import * as XLSX from "xlsx";
import { CalendarManager, MaternitySlot } from "./maternityCalendar";
import { ProcessedResult } from "@/types/patient";

export const exportMaternityCalendars = (calendarManager: CalendarManager) => {
  const workbook = XLSX.utils.book_new();

  calendarManager.getAllCalendars().forEach((calendar) => {
    const worksheet = createCalendarWorksheet(calendar.name, calendar.slots);
    XLSX.utils.book_append_sheet(workbook, worksheet, calendar.name);
  });

  XLSX.writeFile(workbook, `Agendamentos_Maternidades_${new Date().toISOString().split("T")[0]}.xlsx`);
};

export const exportUnscheduledPatients = (results: ProcessedResult[]) => {
  const unscheduled = results.filter(
    (r) => r.status === "NÃO_AGENDADA" || r.status === "ERRO"
  );

  const workbook = XLSX.utils.book_new();
  const data: any[][] = [];

  // Header
  data.push(["RELATÓRIO DE PACIENTES NÃO AGENDADOS"]);
  data.push([]);
  data.push([`Total de Pacientes: ${unscheduled.length}`]);
  data.push([`Data de Geração: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`]);
  data.push([]);
  data.push([]);

  // Column headers
  data.push([
    "ID",
    "Nome Completo",
    "Carteirinha",
    "Maternidade Desejada",
    "Status",
    "IG Atual",
    "IG Recomendada",
    "Data Ideal",
    "Motivo",
  ]);

  // Data rows
  unscheduled.forEach((result) => {
    const allReasons = result.observacoes.join(" | ");

    data.push([
      result.id,
      result.nome,
      result.carteirinha,
      result.maternidade_desejada || "Não especificada",
      result.status === "ERRO" ? "ERRO" : "NÃO AGENDADA",
      result.ig_atual || "-",
      result.ig_recomendada || "-",
      result.data_ideal?.toLocaleDateString("pt-BR") || "-",
      allReasons || "Sem informação",
    ]);
  });

  // Summary by reason
  data.push([]);
  data.push([]);
  data.push(["RESUMO POR MOTIVO"]);
  data.push([]);

  const reasonCount: { [key: string]: number } = {};
  unscheduled.forEach((result) => {
    const reason = result.observacoes[0] || "Sem informação";
    reasonCount[reason] = (reasonCount[reason] || 0) + 1;
  });

  data.push(["Motivo", "Quantidade", "Percentual"]);
  Object.entries(reasonCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      const percentage = ((count / unscheduled.length) * 100).toFixed(1);
      data.push([reason, count, `${percentage}%`]);
    });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // ID
    { wch: 35 }, // Nome
    { wch: 20 }, // Carteirinha
    { wch: 18 }, // Maternidade
    { wch: 15 }, // Status
    { wch: 12 }, // IG Atual
    { wch: 15 }, // IG Recomendada
    { wch: 12 }, // Data Ideal
    { wch: 60 }, // Motivo
  ];

  // Styling
  const headerRow = 6; // Row index for column headers (0-based)
  
  // Apply bold to headers
  for (let col = 0; col <= 8; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
    if (!ws[cellAddress]) continue;
    ws[cellAddress].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: "E0E0E0" } },
      alignment: { horizontal: "center", vertical: "center" }
    };
  }

  // Merge header cells
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });

  XLSX.utils.book_append_sheet(workbook, ws, "Não Agendados");

  XLSX.writeFile(
    workbook,
    `Pacientes_Nao_Agendados_${new Date().toISOString().split("T")[0]}.xlsx`
  );
};

export const exportAllResults = (results: ProcessedResult[]) => {
  const workbook = XLSX.utils.book_new();
  const data: any[][] = [];

  // Header
  data.push(["RELATÓRIO COMPLETO DE AGENDAMENTOS"]);
  data.push([]);
  data.push([`Total de Pacientes: ${results.length}`]);
  data.push([`Agendados: ${results.filter(r => r.status === "AGENDADA").length}`]);
  data.push([`Já Agendados: ${results.filter(r => r.status === "JÁ_AGENDADA").length}`]);
  data.push([`Não Agendados: ${results.filter(r => r.status === "NÃO_AGENDADA" || r.status === "ERRO").length}`]);
  data.push([`Data: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`]);
  data.push([]);

  // Column headers
  data.push([
    "ID",
    "Nome Completo",
    "Carteirinha",
    "Telefone",
    "Maternidade Desejada",
    "Maternidade Alocada",
    "Status",
    "IG Atual",
    "Método IG",
    "IG Recomendada",
    "Data Ideal",
    "Data Agendamento",
    "Observações",
  ]);

  // Data rows
  results.forEach((result) => {
    const observations = result.observacoes.join(" | ");

    data.push([
      result.id,
      result.nome,
      result.carteirinha,
      result.telefone || "-",
      result.maternidade_desejada || "Não especificada",
      result.maternidade_alocada || "-",
      result.status,
      result.ig_atual || "-",
      result.metodo_ig || "-",
      result.ig_recomendada || "-",
      result.data_ideal?.toLocaleDateString("pt-BR") || "-",
      result.data_agendamento?.toLocaleDateString("pt-BR") || "-",
      observations || "-",
    ]);
  });

  // Summary by maternity
  data.push([]);
  data.push([]);
  data.push(["RESUMO POR MATERNIDADE"]);
  data.push([]);

  const maternityStats: { [key: string]: { agendados: number; naoAgendados: number } } = {};
  
  results.forEach((result) => {
    const mat = result.maternidade_alocada || result.maternidade_desejada || "Sem maternidade";
    if (!maternityStats[mat]) {
      maternityStats[mat] = { agendados: 0, naoAgendados: 0 };
    }
    if (result.status === "AGENDADA" || result.status === "JÁ_AGENDADA") {
      maternityStats[mat].agendados++;
    } else {
      maternityStats[mat].naoAgendados++;
    }
  });

  data.push(["Maternidade", "Agendados", "Não Agendados", "Total"]);
  Object.entries(maternityStats)
    .sort((a, b) => (b[1].agendados + b[1].naoAgendados) - (a[1].agendados + a[1].naoAgendados))
    .forEach(([maternity, stats]) => {
      data.push([
        maternity,
        stats.agendados,
        stats.naoAgendados,
        stats.agendados + stats.naoAgendados,
      ]);
    });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // ID
    { wch: 35 }, // Nome
    { wch: 20 }, // Carteirinha
    { wch: 15 }, // Telefone
    { wch: 18 }, // Maternidade Desejada
    { wch: 18 }, // Maternidade Alocada
    { wch: 15 }, // Status
    { wch: 12 }, // IG Atual
    { wch: 10 }, // Método
    { wch: 15 }, // IG Recomendada
    { wch: 12 }, // Data Ideal
    { wch: 15 }, // Data Agendamento
    { wch: 60 }, // Observações
  ];

  // Merge header cells
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } });

  XLSX.utils.book_append_sheet(workbook, ws, "Todos os Resultados");

  XLSX.writeFile(
    workbook,
    `Relatorio_Completo_${new Date().toISOString().split("T")[0]}.xlsx`
  );
};

const createCalendarWorksheet = (
  maternityName: string,
  slots: Map<string, MaternitySlot[]>
) => {
  const data: any[][] = [];
  
  // Month header (get from first date)
  const firstDateKey = Array.from(slots.keys()).sort()[0];
  const firstSlots = slots.get(firstDateKey);
  const date = firstSlots?.[0]?.date;
  const monthName = date ? date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase() : "";
  
  // Title row
  data.push([`AGENDA - ${maternityName.toUpperCase()}`]);
  data.push([monthName]);
  data.push([]);
  data.push(["DIA", "DATA", "CARTEIRINHA", "NOME COMPLETO", "DATA NASCIMENTO", "DIAGNÓSTICO", "VIA DE PARTO", "TELEFONE", "OBS"]);
  
  // Get all dates sorted
  const dates = Array.from(slots.keys()).sort();
  const dayNames = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];

  dates.forEach((dateKey) => {
    const daySlots = slots.get(dateKey) || [];
    if (daySlots.length === 0) return;

    const date = daySlots[0].date;
    const dayOfWeek = dayNames[date.getDay()];
    const dayNumber = date.getDate();

    // Count occupied slots
    const occupiedSlots = daySlots.filter(slot => slot.occupied);
    
    if (occupiedSlots.length === 0) {
      // Empty day - just show day header with empty row
      data.push([dayOfWeek, dayNumber, "", "", "", "", "", "", ""]);
    } else {
      // First occupied slot includes day header
      const firstSlot = occupiedSlots[0];
      data.push([
        dayOfWeek,
        dayNumber,
        firstSlot.carteirinha || "",
        firstSlot.patientName || "",
        "", // Data de nascimento - não temos
        "", // Diagnóstico - não temos
        "", // Via de parto - não temos
        firstSlot.phone || "",
        ""
      ]);
      
      // Remaining occupied slots
      for (let i = 1; i < occupiedSlots.length; i++) {
        const slot = occupiedSlots[i];
        data.push([
          "",
          "",
          slot.carteirinha || "",
          slot.patientName || "",
          "",
          "",
          "",
          slot.phone || "",
          ""
        ]);
      }
    }
  });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths to match template
  ws["!cols"] = [
    { wch: 10 },  // DIA
    { wch: 6 },   // DATA
    { wch: 18 },  // CARTEIRINHA
    { wch: 35 },  // NOME
    { wch: 18 },  // DATA DE NASCIMENTO
    { wch: 60 },  // DIAGNÓSTICO
    { wch: 20 },  // VIA DE PARTO
    { wch: 25 },  // TELEFONE
    { wch: 5 },   // Extra column
  ];

  // Merge month header cells
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });

  return ws;
};
