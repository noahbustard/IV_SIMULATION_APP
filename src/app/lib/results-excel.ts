import ExcelJS from "exceljs";
import type { SimulationResultRecord } from "./results-store";

export const RESULTS_WORKSHEET_NAMES = {
  training: "Training Runs",
  official: "Official Study Runs",
} as const;

const RESULT_HEADERS = [
  "Run ID",
  "Run Type",
  "Saved At",
  "Participant ID",
  "Age",
  "Gender",
  "Level of Nursing",
  "Area of Nursing",
  "Years of Nursing Experience",
  "Medication",
  "Administration Time Source",
  "Administration Time (seconds)",
  "Required Minimum Administration Time (seconds)",
  "Compliance Status",
  "Viewed Additional Drug Information",
  "Completed At",
] as const;

const COLUMN_WIDTHS = [28, 20, 26, 18, 10, 18, 28, 28, 30, 62, 32, 28, 44, 22, 34, 24];

function ensureWorksheet(workbook: ExcelJS.Workbook, worksheetName: string) {
  const worksheet = workbook.addWorksheet(worksheetName);
  worksheet.addRow([...RESULT_HEADERS]);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  RESULT_HEADERS.forEach((_, index) => {
    worksheet.getColumn(index + 1).width = COLUMN_WIDTHS[index] ?? 20;
  });

  return worksheet;
}

function rowValues(record: SimulationResultRecord) {
  return [
    record.run_id,
    record.run_type_label,
    record.saved_at,
    record.participant_id,
    record.age ?? "",
    record.gender ?? "",
    record.level_of_nursing ?? "",
    record.area_of_nursing ?? "",
    record.years_of_nursing_experience ?? "",
    record.medication,
    record.administration_time_source,
    Number(record.administration_time_seconds),
    record.required_minimum_administration_time_seconds,
    record.compliance_status,
    record.viewed_additional_drug_information,
    record.completed_at,
  ];
}

export async function createResultsWorkbookBuffer(records: SimulationResultRecord[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IV Simulation App";
  workbook.created = new Date();

  const trainingWorksheet = ensureWorksheet(workbook, RESULTS_WORKSHEET_NAMES.training);
  const officialWorksheet = ensureWorksheet(workbook, RESULTS_WORKSHEET_NAMES.official);

  for (const record of records) {
    const worksheet = record.run_type === "official" ? officialWorksheet : trainingWorksheet;
    worksheet.addRow(rowValues(record));
  }

  return workbook.xlsx.writeBuffer();
}
