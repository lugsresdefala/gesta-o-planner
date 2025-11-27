import { useState } from "react";
import { Upload, FileSpreadsheet, Calendar, FileDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileUpload from "@/components/FileUpload";
import PatientDataTable from "@/components/PatientDataTable";
import ProcessingResults from "@/components/ProcessingResults";
import { PatientData, ProcessedResult } from "@/types/patient";
import { processPatients } from "@/utils/patientProcessor";
import { toast } from "sonner";

const Index = () => {
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [processedResults, setProcessedResults] = useState<ProcessedResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  const handleFileUpload = (data: PatientData[]) => {
    setPatients(data);
    setActiveTab("review");
    toast.success(`${data.length} pacientes carregados com sucesso`);
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      // Process patients according to the protocols
      const results = await processPatients(patients);
      setProcessedResults(results);
      setActiveTab("results");
      
      const scheduled = results.filter(r => r.status === "AGENDADA").length;
      const alreadyScheduled = results.filter(r => r.status === "JÁ_AGENDADA").length;
      const notScheduled = results.filter(r => r.status === "NÃO_AGENDADA").length;
      
      toast.success(
        `Processamento concluído: ${scheduled} agendadas, ${alreadyScheduled} já agendadas, ${notScheduled} não agendadas`
      );
    } catch (error) {
      toast.error("Erro ao processar pacientes");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Calendar className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sistema de Agendamento Obstétrico</h1>
              <p className="text-sm text-muted-foreground">Gestão de procedimentos e alocação de vagas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload TSV
            </TabsTrigger>
            <TabsTrigger value="review" disabled={patients.length === 0} className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Revisar Dados
            </TabsTrigger>
            <TabsTrigger value="results" disabled={processedResults.length === 0} className="flex items-center gap-2">
              <FileDown className="h-4 w-4" />
              Resultados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload de Arquivo TSV</CardTitle>
                <CardDescription>
                  Faça upload do arquivo TSV contendo os dados dos pacientes para processamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload onUpload={handleFileUpload} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sobre o Sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-primary">Protocolos Implementados</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• PR-DIMEP-PGS-01: Datação Gestacional</li>
                      <li>• PT-AON-097: IG Recomendada por Patologia</li>
                      <li>• Alocação automática de vagas</li>
                      <li>• Validação de capacidade por maternidade</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-primary">Maternidades Suportadas</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Guarulhos (11 vagas/semana)</li>
                      <li>• NotreCare (32 vagas/semana)</li>
                      <li>• Salvalus (52 vagas/semana)</li>
                      <li>• Cruzeiro (16 vagas/semana)</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="review" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados Carregados</CardTitle>
                <CardDescription>
                  {patients.length} pacientes prontos para processamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PatientDataTable patients={patients} />
                <div className="mt-6 flex justify-end gap-4">
                  <Button variant="outline" onClick={() => setActiveTab("upload")}>
                    Voltar
                  </Button>
                  <Button onClick={handleProcess} disabled={isProcessing}>
                    {isProcessing ? "Processando..." : "Processar Agendamentos"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <ProcessingResults results={processedResults} patients={patients} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
