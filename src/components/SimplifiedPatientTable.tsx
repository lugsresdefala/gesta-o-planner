import { SimplifiedPatientData } from "@/types/simplifiedPatient";
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
import { CheckCircle2, Clock } from "lucide-react";

interface SimplifiedPatientTableProps {
  patients: SimplifiedPatientData[];
}

const SimplifiedPatientTable = ({ patients }: SimplifiedPatientTableProps) => {
  const getStatusBadge = (status: string) => {
    if (status === "REALIZADO") {
      return (
        <Badge variant="default" className="bg-success">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Realizado
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Clock className="mr-1 h-3 w-3" />
        Agendado
      </Badge>
    );
  };

  const stats = {
    total: patients.length,
    agendado: patients.filter((p) => p.Status === "AGENDADO").length,
    realizado: patients.filter((p) => p.Status === "REALIZADO").length,
    byMaternity: patients.reduce((acc, p) => {
      acc[p.Maternidade] = (acc[p.Maternidade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Total de Pacientes</div>
          <div className="mt-2 text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Agendados</div>
          <div className="mt-2 text-2xl font-bold text-primary">{stats.agendado}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Realizados</div>
          <div className="mt-2 text-2xl font-bold text-success">{stats.realizado}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground">Maternidades</div>
          <div className="mt-2 space-y-1">
            {Object.entries(stats.byMaternity).map(([name, count]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{name}:</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <ScrollArea className="h-[600px] w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Maternidade</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead>IG Atual</TableHead>
                <TableHead>IG Ideal</TableHead>
                <TableHead>Data Agendada</TableHead>
                <TableHead>Diagnósticos Maternos</TableHead>
                <TableHead>Diagnósticos Fetais</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{patient.Nome}</TableCell>
                  <TableCell>{getStatusBadge(patient.Status)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{patient.Maternidade}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{patient.Procedimento}</TableCell>
                  <TableCell className="font-mono text-xs">{patient.IG_Atual}</TableCell>
                  <TableCell className="font-mono text-xs">{patient.IG_Ideal}</TableCell>
                  <TableCell className="text-sm">{patient.Data_Agendada}</TableCell>
                  <TableCell className="max-w-[250px] truncate text-xs">
                    {patient.Dx_Maternos || "—"}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate text-xs">
                    {patient.Dx_Fetais || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export default SimplifiedPatientTable;
