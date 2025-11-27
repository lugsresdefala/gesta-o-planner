/**
 * Busca uma coluna em um objeto por palavras-chave, ignorando case e diferenças de formatação.
 * Útil quando os nomes das colunas do TSV são longos, truncados ou variam entre exportações.
 */
export function findColumn(
  patient: Record<string, unknown>,
  keywords: string[]
): string | undefined {
  const patientKeys = Object.keys(patient);
  
  for (const key of patientKeys) {
    const normalizedKey = key.toLowerCase().trim();
    
    // Checa se QUALQUER keyword aparece no nome da coluna
    const matches = keywords.some(kw => 
      normalizedKey.includes(kw.toLowerCase())
    );
    
    if (matches) {
      const value = patient[key];
      // Retorna apenas se o valor não for vazio/null
      if (value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }
  }
  
  return undefined;
}

/**
 * Busca múltiplos campos alternativos, retornando o primeiro encontrado
 */
export function findColumnMultiple(
  patient: Record<string, unknown>,
  keywordSets: string[][]
): string | undefined {
  for (const keywords of keywordSets) {
    const result = findColumn(patient, keywords);
    if (result) return result;
  }
  return undefined;
}
