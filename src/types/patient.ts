export interface PatientData {
  ID: string;
  "Hora de início": string;
  "Nome completo da paciente": string;
  "Data de nascimento da gestante": string;
  "CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)": string;
  "Número de Gestações": string;
  "Número de Partos Cesáreas": string;
  "Número de Partos Normais": string;
  "Número de Abortos": string;
  "Informe dois telefones de contato com o paciente para que ele seja contato pelo hospital": string;
  "Informe o procedimento(s) que será(ão) realizado(s)": string;
  "DUM": string;
  "Data da DUM": string;
  "Data do Primeiro USG": string;
  "Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF": string;
  "Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF": string;
  "USG mais recente (Inserir data, apresentação, PFE com percentil, ILA/MBV e doppler)": string;
  "Informe IG pretendida para o procedimento \n* Não confirmar essa data para a paciente, dependendo da agenda hospitalar poderemos ter uma variação\n* Para laqueaduras favor colocar data que completa 60 d": string;
  Coluna3: string;
  "Informe a indicação do procedimento": string;
  "Indique qual medicação e dosagem que a paciente utiliza.": string;
  "Indique os Diagnósticos Obstétricos Maternos ATUAIS ( ex. DMG com/sem insulina, Pre-eclampsia, Hipertensão gestacional, TPP na gestação atual, RPMO na gestação atual, hipotireoidismo gestacional, etc)": string;
  "Placenta previa centro total com acretismo confirmado ou suspeito": string;
  "Indique os Diagnósticos Fetais (ex: RCF, Oligo/Polidramnio, Macrossomia, malformação fetal - especificar, cardiopatia fetal - especificar, etc)": string;
  "Informe História Obstétrica Prévia Relevante e Diagnósticos clínicos cirúrgicos (ex. Aborto tardio, parto prematuro,  óbito fetal, DMG, macrossomia, eclampsia, pré eclampsia precoce, cardiopatia - esp": string;
  "Necessidade de reserva de UTI materna": string;
  "Necessidade de reserva de Sangue": string;
  "Maternidade que a paciente deseja": string;
  "Médico responsável pelo agendamento": string;
  "E-mail da paciente": string;
  "DPP DUM": string;
  "DPP USG": string;
  Idade: string;
}

export interface ProcessedResult {
  id: string;
  nome: string;
  carteirinha: string;
  maternidade_desejada: string;
  status: "AGENDADA" | "JÁ_AGENDADA" | "NÃO_AGENDADA" | "ERRO";
  ig_atual?: string;
  metodo_ig?: "DUM" | "USG" | "AMBOS";
  ig_recomendada?: string;
  data_ideal?: Date;
  data_agendamento?: Date;
  observacoes: string[];
}

export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
}

export interface MaternityCapacity {
  [key: string]: {
    [day: string]: number; // day of week -> number of slots
  };
}
