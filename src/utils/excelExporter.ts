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
  data.push([`Total: ${unscheduled.length} pacientes`]);
  data.push([`Gerado em: ${new Date().toLocaleString("pt-BR")}`]);
  data.push([]);

  // Column headers
  data.push([
    "ID",
    "Nome",
    "Carteirinha",
    "Maternidade",
    "Status",
    "IG Atual",
    "Método",
    "IG Recomendada",
    "Data Ideal",
    "Motivo Principal",
    "Detalhes",
  ]);

  // Data rows
  unscheduled.forEach((result) => {
    const mainReason = result.observacoes[0] || "Sem informação";
    const details = result.observacoes.slice(1).join("; ");

    data.push([
      result.id,
      result.nome,
      result.carteirinha,
      result.maternidade_desejada,
      result.status,
      result.ig_atual || "-",
      result.metodo_ig || "-",
      result.ig_recomendada || "-",
      result.data_ideal?.toLocaleDateString("pt-BR") || "-",
      mainReason,
      details,
    ]);
  });

  // Summary by reason
  data.push([]);
  data.push(["ANÁLISE POR MOTIVO"]);
  data.push([]);

  const reasonCount: { [key: string]: number } = {};
  unscheduled.forEach((result) => {
    const reason = result.observacoes[0] || "Sem informação";
    reasonCount[reason] = (reasonCount[reason] || 0) + 1;
  });

  data.push(["Motivo", "Quantidade"]);
  Object.entries(reasonCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      data.push([reason, count]);
    });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // ID
    { wch: 30 }, // Nome
    { wch: 20 }, // Carteirinha
    { wch: 15 }, // Maternidade
    { wch: 15 }, // Status
    { wch: 12 }, // IG Atual
    { wch: 10 }, // Método
    { wch: 12 }, // IG Recomendada
    { wch: 12 }, // Data Ideal
    { wch: 40 }, // Motivo Principal
    { wch: 50 }, // Detalhes
  ];

  // Merge header cells
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });

  XLSX.utils.book_append_sheet(workbook, ws, "Não Agendados");

  XLSX.writeFile(
    workbook,
    `Pacientes_Nao_Agendados_${new Date().toISOString().split("T")[0]}.xlsx`
  );
};

const createCalendarWorksheet = (
  maternityName: string,
  slots: Map<string, MaternitySlot[]>
) => {
  const data: any[][] = [];

  // Header
  data.push([
    `CALENDÁRIO DE AGENDAMENTOS - ${maternityName.toUpperCase()}`,
  ]);
  data.push([]);

  // Get all dates sorted
  const dates = Array.from(slots.keys()).sort();

  dates.forEach((dateKey) => {
    const daySlots = slots.get(dateKey) || [];
    if (daySlots.length === 0) return;

    const date = daySlots[0].date;
    const dayOfWeek = daySlots[0].dayOfWeek;
    const formattedDate = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Day header
    data.push([`${dayOfWeek}, ${formattedDate}`, "", "", "", ""]);

    // Column headers for slots
    data.push(["Vaga", "Carteirinha", "Nome", "Telefone", "Status"]);

    // Slots
    daySlots.forEach((slot) => {
      data.push([
        `${slot.slotNumber}`,
        slot.carteirinha || "",
        slot.patientName || "",
        slot.phone || "",
        slot.occupied ? "OCUPADA" : "DISPONÍVEL",
      ]);
    });

    data.push([]); // Empty row between days
  });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // Vaga
    { wch: 20 }, // Carteirinha
    { wch: 40 }, // Nome
    { wch: 20 }, // Telefone
    { wch: 12 }, // Status
  ];

  // Style the header (row 1)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  
  // Merge header cells
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

  return ws;
};
