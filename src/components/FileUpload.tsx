import { useCallback, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientData } from "@/types/patient";
import { toast } from "sonner";

interface FileUploadProps {
  onUpload: (data: PatientData[]) => void;
}

const FileUpload = ({ onUpload }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<"idle" | "success" | "error">("idle");

  const parseTSV = (text: string): PatientData[] => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error("Arquivo TSV inválido: deve conter cabeçalho e dados");
    }

    const headers = lines[0].split("\t");
    const data: PatientData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split("\t");
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || "";
      });
      
      data.push(row as PatientData);
    }

    return data;
  };

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".tsv") && !file.name.endsWith(".txt")) {
        toast.error("Por favor, selecione um arquivo TSV válido");
        setFileStatus("error");
        return;
      }

      setFileName(file.name);
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const patients = parseTSV(text);
          
          if (patients.length === 0) {
            throw new Error("Nenhum paciente encontrado no arquivo");
          }

          setFileStatus("success");
          onUpload(patients);
        } catch (error) {
          console.error("Erro ao processar arquivo:", error);
          toast.error("Erro ao processar arquivo TSV");
          setFileStatus("error");
        }
      };

      reader.onerror = () => {
        toast.error("Erro ao ler o arquivo");
        setFileStatus("error");
      };

      reader.readAsText(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed 
          transition-all duration-200
          ${
            isDragging
              ? "border-primary bg-primary/5"
              : fileStatus === "success"
              ? "border-success bg-success/5"
              : fileStatus === "error"
              ? "border-destructive bg-destructive/5"
              : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
          }
        `}
      >
        <input
          type="file"
          accept=".tsv,.txt"
          onChange={handleFileInput}
          className="absolute inset-0 cursor-pointer opacity-0"
          id="file-upload"
        />
        
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          {fileStatus === "success" ? (
            <CheckCircle2 className="h-16 w-16 text-success" />
          ) : fileStatus === "error" ? (
            <AlertCircle className="h-16 w-16 text-destructive" />
          ) : (
            <Upload className="h-16 w-16 text-muted-foreground" />
          )}

          {fileName ? (
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">{fileName}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">
                Arraste o arquivo TSV aqui
              </p>
              <p className="text-sm text-muted-foreground">
                ou clique para selecionar
              </p>
            </div>
          )}

          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor="file-upload" className="cursor-pointer">
              Selecionar Arquivo
            </label>
          </Button>

          <p className="text-xs text-muted-foreground">
            Formato aceito: .tsv ou .txt separado por tabulação
          </p>
        </div>
      </div>

      {fileStatus === "success" && (
        <div className="rounded-lg bg-success/10 p-4 text-sm text-success-foreground">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Arquivo carregado com sucesso! Revise os dados na próxima aba.
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
