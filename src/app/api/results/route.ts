import { NextResponse } from "next/server";
import { saveResultsToSupabase } from "@/app/lib/results-store";
import {
  RUN_TYPE_LABELS,
  complianceForElapsed,
  validateParticipant,
} from "@/app/lib/simulation";
import type {
  AdministrationTimeSource,
  ComplianceStatus,
  ExportRow,
  Participant,
  ResultsSavePayload,
  RunType,
} from "@/app/lib/simulation";

export const runtime = "nodejs";

const YES_NO_VALUES = new Set(["Yes", "No"]);
const COMPLIANCE_VALUES = new Set<ComplianceStatus>(["In compliance", "Not in compliance"]);
const ADMINISTRATION_TIME_SOURCE_VALUES = new Set<AdministrationTimeSource>([
  "Administration Instructions",
  "Additional Drug Information",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "string" ? value : null;
}

function numberField(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseParticipant(value: unknown): Participant | string {
  if (!isRecord(value)) return "Participant information is missing.";

  const participant: Participant = {
    participantId: stringField(value, "participantId") ?? "",
    age: stringField(value, "age") ?? "",
    gender: stringField(value, "gender") ?? "",
    levelOfNursing: stringField(value, "levelOfNursing") ?? "",
    areaOfNursing: stringField(value, "areaOfNursing") ?? "",
    yearsOfNursingExperience: stringField(value, "yearsOfNursingExperience") ?? "",
  };

  if (!participant.participantId.trim()) return "Participant ID is required before saving results.";

  const participantErrors = validateParticipant(participant);
  if (Object.keys(participantErrors).length > 0) return "Participant information does not pass the current validation rules.";

  return participant;
}

function parseExportRow(value: unknown, participant: Participant, rowNumber: number): ExportRow | string {
  if (!isRecord(value)) return `Result row ${rowNumber} is malformed.`;

  const medicationName = stringField(value, "medicationName");
  const administrationTimeSource = stringField(value, "administrationTimeSource");
  const medicationAdministrationTimeSeconds = numberField(value, "medicationAdministrationTimeSeconds");
  const requiredMinimumSeconds = numberField(value, "requiredMinimumSeconds");
  const complianceStatus = stringField(value, "complianceStatus");
  const additionalDrugInformationViewed = stringField(value, "additionalDrugInformationViewed");
  const completedAt = stringField(value, "completedAt");

  if (!medicationName?.trim()) return `Result row ${rowNumber} is missing a medication name.`;
  if (!ADMINISTRATION_TIME_SOURCE_VALUES.has(administrationTimeSource as AdministrationTimeSource)) {
    return `Result row ${rowNumber} has an invalid administration-time source.`;
  }
  if (medicationAdministrationTimeSeconds === null || medicationAdministrationTimeSeconds < 0) {
    return `Result row ${rowNumber} has an invalid administration time.`;
  }
  if (requiredMinimumSeconds === null || requiredMinimumSeconds < 0) {
    return `Result row ${rowNumber} has an invalid required minimum time.`;
  }
  if (!COMPLIANCE_VALUES.has(complianceStatus as ComplianceStatus)) {
    return `Result row ${rowNumber} has an invalid compliance status.`;
  }
  if (!YES_NO_VALUES.has(additionalDrugInformationViewed ?? "")) {
    return `Result row ${rowNumber} has an invalid additional-drug-information value.`;
  }
  if (!completedAt?.trim()) return `Result row ${rowNumber} is missing a completion timestamp.`;

  return {
    participantId: participant.participantId.trim(),
    age: participant.age.trim(),
    gender: participant.gender,
    levelOfNursing: participant.levelOfNursing,
    areaOfNursing: participant.areaOfNursing.trim(),
    yearsOfNursingExperience: participant.yearsOfNursingExperience.trim(),
    medicationName: medicationName.trim(),
    administrationTimeSource: administrationTimeSource as AdministrationTimeSource,
    medicationAdministrationTimeSeconds,
    requiredMinimumSeconds,
    complianceStatus: complianceForElapsed(medicationAdministrationTimeSeconds, requiredMinimumSeconds),
    additionalDrugInformationViewed: additionalDrugInformationViewed as "Yes" | "No",
    completedAt: completedAt.trim(),
  };
}

function parseResultsPayload(value: unknown): ResultsSavePayload | string {
  if (!isRecord(value)) return "Save payload is malformed.";

  const runId = stringField(value, "runId");
  const runType = stringField(value, "runType");
  const consentAcceptedAt = stringField(value, "consentAcceptedAt");

  if (!runId?.trim()) return "Run ID is required before saving results.";
  if (!runType || !(runType in RUN_TYPE_LABELS)) return "Run type must be Training Run or Official Study Run.";
  if (!consentAcceptedAt?.trim()) return "Consent must be accepted before saving results.";

  const participant = parseParticipant(value.participant);
  if (typeof participant === "string") return participant;

  const rowsValue = value.rows;
  if (!Array.isArray(rowsValue) || rowsValue.length === 0) return "At least one completed medication result is required.";

  const rows: ExportRow[] = [];
  for (let index = 0; index < rowsValue.length; index += 1) {
    const parsedRow = parseExportRow(rowsValue[index], participant, index + 1);
    if (typeof parsedRow === "string") return parsedRow;
    rows.push(parsedRow);
  }

  return {
    runId: runId.trim(),
    runType: runType as RunType,
    consentAcceptedAt: consentAcceptedAt.trim(),
    participant,
    rows,
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const payload = parseResultsPayload(body);
  if (typeof payload === "string") {
    return NextResponse.json({ ok: false, error: payload }, { status: 400 });
  }

  try {
    const result = await saveResultsToSupabase(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Failed to save simulation results", error);
    return NextResponse.json(
      { ok: false, error: "Results could not be saved to the study database. Please try again." },
      { status: 500 },
    );
  }
}
