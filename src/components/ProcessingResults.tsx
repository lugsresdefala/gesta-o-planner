import { ProcessedResult, PatientData } from "@/types/patient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Clock, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";

interface ProcessingResultsProps {
  results: ProcessedResult[];
  patients: PatientData[];
}

const ProcessingResults = ({ results, patients }: ProcessingResultsProps) => {
  const statusConfig = {
    AGENDADA: {
      icon: CheckCircle2,
      variant: "default" as const,
      color: "text-success",
      label: "Agendada",
    },
    JÁ_AGENDADA: {
      icon: Clock,
      variant: "secondary" as const,
      color: "text-muted-foreground",
      label: "Já Agendada",
    },
    NÃO_AGENDADA: {
      icon: XCircle,
      variant: "destructive" as const,
      color: "text-destructive",
      label: "Não Agendada",
    },
    ERRO: {
      icon: AlertCircle,
      variant: "outline" as const,
      color: "text-warning",
      label: "Erro",
    },
  };

  const stats = {
    total: results.length,
    agendada: results.filter((r) => r.status === "AGENDADA").length,
    jaAgendada: results.filter((r) => r.status === "JÁ_AGENDADA").length,
    naoAgendada: results.filter((r) => r.status === "NÃO_AGENDADA").length,
    erro: results.filter((r) => r.status === "ERRO").length,
  };

  const handleExportCSV = () => {
    // Create CSV content
    const headers = [
      "ID",
      "Nome",
      "Carteirinha",
      "Maternidade",
      "Status",
      "IG Atual",
      "Método IG",
      "IG Recomendada",
      "Data Ideal",
      "Data Agendamento",
      "Observações",
    ];

    const rows = results.map((result) => [
      result.id,
      result.nome,
      result.carteirinha,
      result.maternidade_desejada,
      result.status,
      result.ig_atual || "",
      result.metodo_ig || "",
      result.ig_recomendada || "",
      result.data_ideal?.toLocaleDateString("pt-BR") || "",
      result.data_agendamento?.toLocaleDateString("pt-BR") || "",
      result.observacoes.join("; "),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `resultados_agendamento_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success("CSV exportado com sucesso!");
  };

  const formatDate = (date?: Date) => {
    if (!date) return "-";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-success">Agendadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.agendada}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Já Agendadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.jaAgendada}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-destructive">Não Agendadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.naoAgendada + stats.erro}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resultados do Processamento</CardTitle>
              <CardDescription>
                Detalhamento dos agendamentos realizados e pendências
              </CardDescription>
            </div>
            <Button onClick={handleExportCSV} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Maternidade</TableHead>
                    <TableHead>IG Atual</TableHead>
                    <TableHead>IG Rec.</TableHead>
                    <TableHead>Data Ideal</TableHead>
                    <TableHead>Data Agend.</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => {
                    const config = statusConfig[result.status];
                    const Icon = config.icon;

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={config.variant} className="flex w-fit items-center gap-1">
                            <Icon className="h-3 w-3" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{result.id}</TableCell>
                        <TableCell className="font-medium">{result.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{result.maternidade_desejada}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {result.ig_atual || "-"}
                          {result.metodo_ig && (
                            <span className="ml-1 text-muted-foreground">
                              ({result.metodo_ig})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {result.ig_recomendada || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(result.data_ideal)}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatDate(result.data_agendamento)}
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <div className="space-y-1">
                            {result.observacoes.map((obs, i) => (
                              <p key={i} className="text-xs text-muted-foreground">
                                {obs}
                              </p>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProcessingResults;
