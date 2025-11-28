# Data Dictionary

This document describes the data fields, types, formats, and processing rules for patient data import and normalization in the Gestão Planner system.

## Overview

The data pipeline consists of two layers:
1. **Raw Layer** (`patients_raw`): Preserves all original columns exactly as imported
2. **Normalized Layer** (`patients_normalized`): Standardized fields with parsed values

## Column Mapping

### Identity & Demographics

| Original Column (Portuguese) | Normalized Field | Type | Description |
|------------------------------|------------------|------|-------------|
| ID | `id` | string | Unique patient identifier |
| Nome completo da paciente | `full_name` | string | Patient's full name |
| Data de nascimento da gestante | `birth_date` | ParsedDate | Patient's birth date |
| CARTEIRINHA (...) | `card_number` | string | Insurance card number |
| Idade | `age` | string | Age (as text from source) |
| E-mail da paciente | `email` | string | Patient email address |

### Contact

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Informe dois telefones de contato... | `phones` | NormalizedPhone[] | Parsed phone numbers |

### Obstetric History

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Número de Gestações | `num_pregnancies` | string | Number of pregnancies |
| Número de Partos Cesáreas | `num_cesareans` | string | Number of cesarean deliveries |
| Número de Partos Normais | `num_vaginal_births` | string | Number of vaginal deliveries |
| Número de Abortos | `num_abortions` | string | Number of abortions |

### LMP (DUM) Data

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| DUM | `lmp_status` | string | LMP status (reliable/uncertain) |
| Data da DUM | `lmp_date` | ParsedDate | Last Menstrual Period date |
| - | `lmp_reliable` | boolean | Computed: true if LMP is reliable |

### First Ultrasound (USG)

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Data do Primeiro USG | `first_usg_date` | ParsedDate | Date of first ultrasound |
| Numero de semanas no primeiro USG... | `first_usg_weeks` | number \| null | GA weeks at first USG |
| Numero de dias no primeiro USG... | `first_usg_days` | number \| null | GA days at first USG |
| - | `first_usg_ga` | GestationalAge \| null | Computed: structured GA |

### Recent Ultrasound

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| USG mais recente (...) | `recent_usg` | ParsedUSG | Parsed USG block with extracted fields |

### Scheduling

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Informe IG pretendida para o procedimento... | `intended_ga` | string | Intended GA for procedure |
| DATA AGENDADA | `primary_scheduled_date` | ParsedDate | Primary scheduled date |
| Data_Agendada | `final_scheduled_date` | ParsedDate | Final scheduled date |
| - | `scheduled_primary_ga_days` | number \| null | **Conditional**: GA in days at primary scheduled date |
| - | `scheduled_primary_ga_formatted` | string \| null | **Conditional**: Formatted GA (e.g., "32s2d") |
| - | `scheduled_final_ga_days` | number \| null | **Conditional**: GA in days at final scheduled date |
| - | `scheduled_final_ga_formatted` | string \| null | **Conditional**: Formatted GA |

### Clinical Data

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Informe o procedimento(s)... | `procedures` | string | Procedures to be performed |
| Informe a indicação do procedimento | `procedure_indication` | string | Procedure indication |
| Indique qual medicação e dosagem... | `medications` | string | Patient medications |
| Indique os Diagnósticos Obstétricos Maternos... | `maternal_diagnoses` | string | Maternal obstetric diagnoses |
| Indique os Diagnósticos Fetais... | `fetal_diagnoses` | string | Fetal diagnoses |
| Informe História Obstétrica Prévia... | `obstetric_history` | string | Prior obstetric history |
| Placenta previa centro total... | `placenta_previa_acretism` | string | Placenta previa status |

### Hospital Preferences

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| Maternidade que a paciente deseja | `preferred_maternity` | string | Preferred maternity hospital |
| Necessidade de reserva de UTI materna | `maternal_icu_needed` | string | Maternal ICU requirement |
| Necessidade de reserva de Sangue | `blood_reserve_needed` | string | Blood reserve requirement |
| Médico responsável pelo agendamento | `responsible_physician` | string | Responsible physician |

### Estimated Due Dates

| Original Column | Normalized Field | Type | Description |
|-----------------|------------------|------|-------------|
| DPP DUM | `edd_lmp` | ParsedDate | EDD by LMP |
| DPP USG | `edd_usg` | ParsedDate | EDD by ultrasound |

### Metadata

| Field | Type | Description |
|-------|------|-------------|
| `ga_method` | 'USG' \| 'DUM' \| null | Method used for GA baseline |
| `row_errors` | string[] | Errors encountered during normalization |
| `_raw` | RawPatientRecord | Reference to original raw data |

---

## Data Types

### ParsedDate

```typescript
interface ParsedDate {
  date: Date | null;      // Parsed JavaScript Date object
  isSentinel: boolean;    // true if year is 1900 (placeholder)
  error?: string;         // Error message if parsing failed
}
```

### GestationalAge

```typescript
interface GestationalAge {
  weeks: number;      // Number of complete weeks
  days: number;       // Remaining days (0-6)
  totalDays: number;  // Total gestational age in days
}
```

### NormalizedPhone

```typescript
interface NormalizedPhone {
  raw: string;        // Original input
  digits: string;     // Digits only (e.g., "11999999999")
  formatted: string;  // Formatted (e.g., "(11) 99999-9999")
  type?: 'mobile' | 'landline';
  valid: boolean;     // true if area code is valid
}
```

### ParsedUSG

```typescript
interface ParsedUSG {
  ga: GestationalAge | null;      // GA extracted from USG text
  presentation: 'CEF' | 'PELVICO' | 'TRANSVERSO' | 'OBLIQUO' | null;
  fetalWeight: number | null;     // Weight in grams
  percentile: number | null;      // Growth percentile (0-100)
  mbv: number | null;             // Maior Bolsão Vertical (cm)
  ila: number | null;             // Índice Líquido Amniótico (cm)
  doppler: DopplerFindings | null;
  placenta: PlacentaInfo | null;
  rawText: string;                // Original text
  errors: string[];               // Parsing errors
}
```

---

## Parsing Rules

### Date Parser

Supported formats:
- `DD/MM/YYYY` (Brazilian standard)
- `MM/DD/YYYY` (when day > 12)
- `YYYY-MM-DD` (ISO format)
- `DD-MM-YYYY`, `DD.MM.YYYY`

**Sentinel Detection**: Dates with year 1900 are treated as placeholder/invalid dates. These dates are flagged with `isSentinel: true` and `date: null`.

Valid year range: 2020-2030 (configurable)

### Gestational Age Parser

Supported formats:

| Format | Example | Interpretation |
|--------|---------|----------------|
| WsWdD | `32S2D`, `37s0d` | 32 weeks, 2 days |
| W+D | `32+2`, `32 + 2` | 32 weeks, 2 days |
| W;D | `31;2` | 31 weeks, 2 days |
| W D/7 | `34 3/7` | 34 weeks, 3 days |
| W/W | `39/40` | 39 weeks, 0 days |
| W SEM | `35 SEM`, `35sem` | 35 weeks, 0 days |
| W.D | `32.2` | 32 weeks, 2 days |
| W | `35` | 35 weeks, 0 days |

Valid range: 0-315 days (0-45 weeks)

### Phone Parser

- Extracts digits from various formats
- Handles multiple phones separated by: `/`, `,`, `;`, `|`, `e`, `and`, `ou`
- Removes labels like "Cel:", "Fixo:", "Whats:"
- Strips country code (+55, 55)
- Formats as `(XX) XXXXX-XXXX` for mobile or `(XX) XXXX-XXXX` for landline

### Ultrasound Block Parser

Extracts from free-text descriptions:
- **Fetal weight**: `PFE: 2500g`, `peso 2.5kg`
- **Percentile**: `p50`, `P75`, `percentil 25`
- **Presentation**: `cefálica`, `CEF`, `pélvica`, `transverso`
- **MBV/ILA**: `MBV: 5.2cm`, `ILA: 15cm`
- **Doppler**: `Doppler normal`, `AU: normal`
- **Placenta**: `placenta anterior`, `placenta grau 2`

---

## Gestational Age Calculation Rules

### Baseline Establishment

1. **USG Method (Preferred)**: Uses first ultrasound date and GA at that time
2. **DUM Method (Fallback)**: Uses LMP date (GA = 0 at LMP)

DUM is only used if:
- USG data is not available
- LMP is marked as reliable (not "incerta" or "não sabe")

### Conditional Calculation at Scheduled Date

**⚠️ CRITICAL RULE**: Gestational age at a scheduled date is ONLY calculated if the scheduled date is **AFTER** the system's reference "today" date.

| Condition | Action |
|-----------|--------|
| Scheduled date > Today | Calculate GA |
| Scheduled date ≤ Today | Skip calculation, set `calculated: false` |

This rule ensures that:
- GA is meaningful for planning future appointments
- Historical appointments don't trigger unnecessary calculations
- Test environments can override "today" for validation

### GA Validation

Calculated GA must fall within 0-315 days (0-45 weeks). Values outside this range are flagged as errors.

---

## Error Handling

### Row-Level Errors

Errors are recorded per-row in the `row_errors` array. Rows are **never deleted**; instead, errors are logged and the row is preserved.

Error types:
- Date parsing failures
- Invalid GA calculations
- Phone parsing issues
- Missing required data

### Global Errors

The `NormalizationResult.errors` array contains all errors with row numbers for audit purposes.

---

## Usage Examples

### Importing Raw Data

```typescript
import { parseRawPatients } from '@/import/patientsRaw';

const content = await file.text();
const rawResult = parseRawPatients(content, '\t');

console.log('Columns:', rawResult.columns);
console.log('Rows:', rawResult.rowCount);
```

### Normalizing Data

```typescript
import { normalizePatients } from '@/import/patientsNormalize';

const normalized = normalizePatients(rawResult, new Date());

// Access normalized patients
for (const patient of normalized.patients) {
  console.log(patient.full_name);
  console.log(patient.scheduled_primary_ga_formatted); // null if past date
}

// Raw data is preserved
console.log(normalized.rawPatients);
```

### Testing with Fixed Date

```typescript
// For testing, override "today" to control conditional GA calculation
const testToday = new Date(2024, 5, 15); // June 15, 2024
const normalized = normalizePatients(rawResult, testToday);
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-XX-XX | Initial version with parsers, raw/normalized layers, conditional GA calculation |
