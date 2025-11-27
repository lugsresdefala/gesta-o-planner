export interface SimplifiedPatientData {
  Nome: string;
  Telefone: string;
  Idade: string;
  Paridade: string;
  DUM: string;
  USG_1: string;
  IG_Atual: string;
  Dx_Maternos: string;
  Dx_Fetais: string;
  USG_Último: string;
  Procedimento: string;
  Maternidade: string;
  IG_Ideal: string;
  Data_Agendada: string;
  IG_na_Data: string;
  Status: string;
}

export interface SimplifiedProcessedResult {
  nome: string;
  telefone: string;
  idade: string;
  maternidade: string;
  procedimento: string;
  ig_atual: string;
  ig_ideal: string;
  data_agendada: string;
  status: "AGENDADO" | "REALIZADO";
  dx_maternos: string;
  dx_fetais: string;
}
