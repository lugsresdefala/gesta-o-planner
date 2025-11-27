import * as XLSX from "xlsx";
import { CalendarManager, MaternitySlot } from "./maternityCalendar";

export const exportMaternityCalendars = (calendarManager: CalendarManager) => {
  const workbook = XLSX.utils.book_new();

  calendarManager.getAllCalendars().forEach((calendar) => {
    const worksheet = createCalendarWorksheet(calendar.name, calendar.slots);
    XLSX.utils.book_append_sheet(workbook, worksheet, calendar.name);
  });

  XLSX.writeFile(workbook, `Agendamentos_Maternidades_${new Date().toISOString().split("T")[0]}.xlsx`);
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
