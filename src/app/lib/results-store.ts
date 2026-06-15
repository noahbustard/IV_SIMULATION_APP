import { createClient } from "@supabase/supabase-js";
import { RUN_TYPE_LABELS } from "./simulation";
import type { ExportRow, ResultsSavePayload, RunType } from "./simulation";

export const RESULTS_TABLE_NAME = "simulation_results";

export type SimulationResultRecord = {
  id?: string;
  run_id: string;
  run_type: RunType;
  run_type_label: string;
  saved_at: string;
  consent_accepted_at: string | null;
  participant_id: string;
  age: string | null;
  gender: string | null;
  level_of_nursing: string | null;
  area_of_nursing: string | null;
  years_of_nursing_experience: string | null;
  medication: string;
  administration_time_source: ExportRow["administrationTimeSource"];
  administration_time_seconds: number;
  required_minimum_administration_time_seconds: number;
  compliance_status: string;
  viewed_additional_drug_information: "Yes" | "No";
  completed_at: string;
  created_at?: string;
};

export type GoogleSheetsSyncResult = {
  configured: boolean;
  attempted: boolean;
  synced: boolean;
  warning?: string;
};

export type SaveResultsResult = {
  runId: string;
  runType: RunType;
  rowsAttempted: number;
  rowsInserted: number;
  duplicate: boolean;
  googleSheetsSync: GoogleSheetsSyncResult;
  warning?: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for result persistence.`);
  return value;
}

function getSupabaseServiceClient() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function cleanOptional(value: string) {
  const cleaned = value.trim();
  return cleaned || null;
}

function resultRecordFromRow(payload: ResultsSavePayload, row: ExportRow, savedAt: string): SimulationResultRecord {
  const participant = payload.participant;

  return {
    run_id: payload.runId,
    run_type: payload.runType,
    run_type_label: RUN_TYPE_LABELS[payload.runType],
    saved_at: savedAt,
    consent_accepted_at: cleanOptional(payload.consentAcceptedAt),
    participant_id: participant.participantId.trim(),
    age: cleanOptional(participant.age),
    gender: cleanOptional(participant.gender),
    level_of_nursing: cleanOptional(participant.levelOfNursing),
    area_of_nursing: cleanOptional(participant.areaOfNursing),
    years_of_nursing_experience: cleanOptional(participant.yearsOfNursingExperience),
    medication: row.medicationName,
    administration_time_source: row.administrationTimeSource,
    administration_time_seconds: row.medicationAdministrationTimeSeconds,
    required_minimum_administration_time_seconds: row.requiredMinimumSeconds,
    compliance_status: row.complianceStatus,
    viewed_additional_drug_information: row.additionalDrugInformationViewed,
    completed_at: row.completedAt,
  };
}

export function toSimulationResultRecords(payload: ResultsSavePayload, savedAt = new Date().toISOString()) {
  return payload.rows.map((row) => resultRecordFromRow(payload, row, savedAt));
}

async function syncGoogleSheets(records: SimulationResultRecord[]): Promise<GoogleSheetsSyncResult> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    return { configured: false, attempted: false, synced: false };
  }

  if (records.length === 0) {
    return { configured: true, attempted: false, synced: true };
  }

  const webhookSecret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {
      configured: true,
      attempted: false,
      synced: false,
      warning: "Saved to database, but Google Sheet sync is not configured because GOOGLE_SHEETS_WEBHOOK_SECRET is missing.",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: webhookSecret,
        rows: records,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const detail = responseText ? `: ${responseText.slice(0, 160)}` : "";
      return {
        configured: true,
        attempted: true,
        synced: false,
        warning: `Saved to database, but Google Sheet sync failed with status ${response.status}${detail}. Admin export still includes this run.`,
      };
    }

    return { configured: true, attempted: true, synced: true };
  } catch (error) {
    console.error("Google Sheets webhook sync failed", error);
    return {
      configured: true,
      attempted: true,
      synced: false,
      warning: "Saved to database, but Google Sheet sync could not reach the configured webhook. Check GOOGLE_SHEETS_WEBHOOK_URL and Make scenario status. Admin export still includes this run.",
    };
  }
}

export async function saveResultsToSupabase(payload: ResultsSavePayload): Promise<SaveResultsResult> {
  const records = toSimulationResultRecords(payload);
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from(RESULTS_TABLE_NAME)
    .upsert(records, {
      onConflict: "run_id,medication",
      ignoreDuplicates: true,
    })
    .select("*");

  if (error) throw error;

  const insertedRecords = (data ?? []) as SimulationResultRecord[];
  const googleSheetsSync = await syncGoogleSheets(insertedRecords);

  return {
    runId: payload.runId,
    runType: payload.runType,
    rowsAttempted: records.length,
    rowsInserted: insertedRecords.length,
    duplicate: insertedRecords.length === 0,
    googleSheetsSync,
    warning: googleSheetsSync.warning,
  };
}

export async function fetchAllResultsForExport() {
  const supabase = getSupabaseServiceClient();
  const pageSize = 1000;
  const records: SimulationResultRecord[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE_NAME)
      .select("*")
      .order("saved_at", { ascending: true })
      .order("run_id", { ascending: true })
      .order("medication", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as SimulationResultRecord[];
    records.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return records;
}
