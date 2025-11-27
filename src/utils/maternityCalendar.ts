import { ProcessedResult } from "@/types/patient";

export interface MaternitySlot {
  date: Date;
  dayOfWeek: string;
  slotNumber: number;
  occupied: boolean;
  patientId?: string;
  patientName?: string;
  carteirinha?: string;
  phone?: string;
}

export interface MaternityCalendar {
  name: string;
  slots: Map<string, MaternitySlot[]>; // key: YYYY-MM-DD
}

const MATERNITY_CAPACITY: { [key: string]: { [day: number]: number } } = {
  Guarulhos: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 0: 0 },
  NotreCare: { 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 2, 0: 0 },
  Salvalus: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 7, 0: 0 },
  Cruzeiro: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 0: 0 },
};

export class CalendarManager {
  private calendars: Map<string, MaternityCalendar>;

  constructor() {
    this.calendars = new Map();
    this.initializeCalendars();
  }

  private initializeCalendars() {
    const maternities = ["Guarulhos", "NotreCare", "Salvalus", "Cruzeiro"];
    
    maternities.forEach((name) => {
      this.calendars.set(name, {
        name,
        slots: new Map(),
      });
    });
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private getDayOfWeekName(dayNum: number): string {
    const days = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
    return days[dayNum];
  }

  private ensureSlotsForDate(maternity: string, date: Date) {
    const calendar = this.calendars.get(maternity);
    if (!calendar) return;

    const dateKey = this.getDateKey(date);
    if (calendar.slots.has(dateKey)) return;

    const dayOfWeek = date.getDay();
    const capacity = MATERNITY_CAPACITY[maternity]?.[dayOfWeek] || 0;
    const dayName = this.getDayOfWeekName(dayOfWeek);

    const slots: MaternitySlot[] = [];
    for (let i = 1; i <= capacity; i++) {
      slots.push({
        date: new Date(date),
        dayOfWeek: dayName,
        slotNumber: i,
        occupied: false,
      });
    }

    calendar.slots.set(dateKey, slots);
  }

  public tryAllocateSlot(
    maternity: string,
    startDate: Date,
    endDate: Date,
    patientData: {
      id: string;
      name: string;
      carteirinha: string;
      phone?: string;
    }
  ): { success: boolean; date?: Date; observations: string[] } {
    const observations: string[] = [];
    const calendar = this.calendars.get(maternity);

    if (!calendar) {
      observations.push(`Maternidade ${maternity} não encontrada`);
      return { success: false, observations };
    }

    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip Sundays
      if (currentDate.getDay() === 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      this.ensureSlotsForDate(maternity, currentDate);
      const dateKey = this.getDateKey(currentDate);
      const slots = calendar.slots.get(dateKey) || [];

      // Find first available slot
      const availableSlot = slots.find((slot) => !slot.occupied);

      if (availableSlot) {
        availableSlot.occupied = true;
        availableSlot.patientId = patientData.id;
        availableSlot.patientName = patientData.name;
        availableSlot.carteirinha = patientData.carteirinha;
        availableSlot.phone = patientData.phone;

        observations.push(`Agendada em ${this.formatDate(currentDate)}`);
        observations.push(`Maternidade: ${maternity}`);
        observations.push(`Vaga: ${availableSlot.slotNumber}/${slots.length}`);
        
        return {
          success: true,
          date: new Date(currentDate),
          observations,
        };
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    observations.push("Nenhuma vaga disponível na janela de agendamento");
    observations.push(
      `Período buscado: ${this.formatDate(startDate)} a ${this.formatDate(endDate)}`
    );

    return { success: false, observations };
  }

  public getCalendar(maternity: string): MaternityCalendar | undefined {
    return this.calendars.get(maternity);
  }

  public getAllCalendars(): MaternityCalendar[] {
    return Array.from(this.calendars.values());
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
}
