import { PatientData } from "@/types/patient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface PatientDataTableProps {
  patients: PatientData[];
}

const PatientDataTable = ({ patients }: PatientDataTableProps) => {
  return (
    <div className="rounded-lg border bg-card">
      <ScrollArea className="h-[500px] w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Carteirinha</TableHead>
              <TableHead>Maternidade</TableHead>
              <TableHead>Procedimento</TableHead>
              <TableHead>DUM</TableHead>
              <TableHead>USG</TableHead>
              <TableHead>Diagnósticos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{patient.ID}</TableCell>
                <TableCell className="font-medium">
                  {patient["Nome completo da paciente"]}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {patient["CARTEIRINHA (tem na guia que sai do sistema - não inserir CPF)"]}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {patient["Maternidade que a paciente deseja"]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {patient["Informe o procedimento(s) que será(ão) realizado(s)"]}
                </TableCell>
                <TableCell>
                  <div className="text-xs">
                    <div>{patient.DUM}</div>
                    <div className="text-muted-foreground">{patient["Data da DUM"]}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs">
                    <div>{patient["Data do Primeiro USG"]}</div>
                    <div className="text-muted-foreground">
                      {patient["Numero de semanas no primeiro USG (inserir apenas o numero) - considerar o exame entre 8 e 12 semanas, embrião com BCF"]}s
                      {patient["Numero de dias no primeiro USG (inserir apenas o numero)- considerar o exame entre 8 e 12 semanas, embrião com BCF"]}d
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[300px] truncate text-xs">
                  {patient["Indique os Diagnósticos Obstétricos Maternos ATUAIS ( ex. DMG com/sem insulina, Pre-eclampsia, Hipertensão gestacional, TPP na gestação atual, RPMO na gestação atual, hipotireoidismo gestacional, etc)"]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default PatientDataTable;
