export type Med = {
  name: string;
  linkedLine: string;
  orderedAdminDose: string;
  concentration: string;
  lastAdmin: string;
  frequency: string;
  route: string;
  orderedDose: string;
  reason: string;
  administrationInstructions: string;
  referenceTitle: string;
  referenceBody: string;
  administrationTimeSource: AdministrationTimeSource;
  requiredSeconds: number;
};

export type InfusionResult = {
  complete: boolean;
  elapsedSeconds: number | null;
  completedAt: string | null;
};

export type Participant = {
  participantId: string;
  age: string;
  gender: string;
  levelOfNursing: string;
  areaOfNursing: string;
  yearsOfNursingExperience: string;
};

export type ParticipantErrors = Partial<Record<keyof Participant, string>>;

export type ComplianceStatus = "In compliance" | "Not in compliance";
export type AdministrationTimeSource = "Administration Instructions" | "Additional Drug Information";

export const RUN_TYPE_LABELS = {
  training: "Training Run",
  official: "Official Study Run",
} as const;

export type RunType = keyof typeof RUN_TYPE_LABELS;

export type ExportRow = {
  participantId: string;
  age: string;
  gender: string;
  levelOfNursing: string;
  areaOfNursing: string;
  yearsOfNursingExperience: string;
  medicationName: string;
  administrationTimeSource: AdministrationTimeSource;
  medicationAdministrationTimeSeconds: number;
  requiredMinimumSeconds: number;
  complianceStatus: ComplianceStatus;
  additionalDrugInformationViewed: "Yes" | "No";
  completedAt: string;
};

export type ResultsSavePayload = {
  runId: string;
  runType: RunType;
  consentAcceptedAt: string;
  participant: Participant;
  rows: ExportRow[];
};

export type ConsentSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type ConsentChoice = "agree" | "disagree";

export const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"];

export const NURSING_LEVEL_OPTIONS = [
  "Undergraduate Nursing Student",
  "Nursing Student",
  "LVN/LPN",
  "RN",
  "BSN",
  "ADN",
  "MSN",
  "DNP",
  "Other",
  "Prefer not to say",
];

export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    title: "Purpose of the study",
    paragraphs: [
      "You are invited to participate in a research study examining nurses' decisions on intravenous (IV) medication infusion rates in a virtual simulation. The goal of this study is to evaluate a simulation tool designed to measure compliance with recommended IV medication infusion rates and to examine whether embedded alerts influence infusion decisions.",
    ],
  },
  {
    title: "What you will do",
    bullets: [
      "Complete a brief virtual simulation involving IV medication administration scenarios.",
      "Select infusion rates for medications presented in the simulation.",
      "Optionally complete a short demographic questionnaire, such as years of nursing experience or practice setting.",
    ],
    paragraphs: ["The simulation will take approximately 10-15 minutes to complete."],
  },
  {
    title: "Risks",
    paragraphs: [
      "This study involves minimal risk. Some participants may experience mild discomfort if unsure about their answers. The simulation is for research purposes only and does not evaluate professional competence or job performance.",
    ],
  },
  {
    title: "Benefits",
    paragraphs: [
      "There may be no direct benefit to you. However, your participation may help improve nursing education tools and support research aimed at improving patient safety in IV medication administration.",
    ],
  },
  {
    title: "Confidentiality",
    paragraphs: [
      "Your responses will be recorded electronically and stored securely. No identifying information will be reported in research publications or presentations. Results will be reported in aggregate form only.",
    ],
  },
  {
    title: "Voluntary Participation",
    paragraphs: ["Participation in this study is completely voluntary. You may stop at any time without penalty."],
  },
  {
    title: "Questions",
    paragraphs: [
      "If you have questions about the study, contact Trinity Munoz, Wilson School of Nursing, Midwestern State University, tdmunoz0118@my.msutexas.edu.",
      "You may also contact Dr. Robin Lockhart, Wilson School of Nursing, Midwestern State University, robin.lockhart@msutexas.edu.",
    ],
  },
  {
    title: "Consent",
    paragraphs: ["By selecting I Agree, you confirm that:"],
    bullets: [
      "You are 18 years of age or older.",
      "You are a licensed nurse.",
      "You have read the information above.",
      "You voluntarily agree to participate in this study.",
    ],
  },
];

export const PRACTICE_MED: Med = {
  name: "practice medication (DemoCaine) injection 5 mg IV once",
  linkedLine: "Peripheral IV right forearm",
  orderedAdminDose: "5 mg = 2 mL",
  concentration: "2.5 mg/1 mL",
  lastAdmin: "Today at 0800",
  frequency: "Once",
  route: "Intravenous",
  orderedDose: "5 mg",
  reason: "practice scenario",
  administrationInstructions: "Administer over 2 minutes.",
  referenceTitle: "Practice Medication Reference",
  referenceBody: "This is a sample medication used for the practice run. Administer the 2 mL dose slowly over 2 minutes.",
  administrationTimeSource: "Administration Instructions",
  requiredSeconds: 120,
};

export const MEDS: Med[] = [
  {
    name: "ondansetron (Zofran) injection 4 mg IV every 8 hours PRN",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "4 mg = 2 mL",
    concentration: "2 mg/1 mL",
    lastAdmin: "Yesterday at 1930",
    frequency: "Every 8 hours PRN",
    route: "Intravenous",
    orderedDose: "4 mg",
    reason: "nausea and vomiting",
    administrationInstructions: "Administer over 3 minutes.",
    referenceTitle: "Ondansetron Recommended Administration",
    referenceBody: "May be given undiluted. Administer 4 mg preferably over 3 minutes.",
    administrationTimeSource: "Administration Instructions",
    requiredSeconds: 180,
  },
  {
    name: "famotidine (Pepcid) injection 20 mg IV every 12 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "20 mg = 5 mL",
    concentration: "4 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 12 hours",
    route: "Intravenous",
    orderedDose: "20 mg",
    reason: "gastric reflux",
    administrationInstructions: "Dilute to a concentration of 4 mg/mL prior to administration.",
    referenceTitle: "Famotidine Recommended Administration",
    referenceBody: "Dilute to a concentration no greater than 4 mg/mL. Administer 20 mg over 2 minutes.",
    administrationTimeSource: "Additional Drug Information",
    requiredSeconds: 120,
  },
  {
    name: "hydromorphone ( Dilaudid ) injection 4 mg IV every 4 hours PRN",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "4 mg = 1 mL",
    concentration: "4 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 4 hours PRN",
    route: "Intravenous",
    orderedDose: "4 mg",
    reason: "pain",
    administrationInstructions: "",
    referenceTitle: "Hydromorphone Recommended Administration",
    referenceBody: "May be given undiluted. Administer 4 mg over 2 minutes.",
    administrationTimeSource: "Additional Drug Information",
    requiredSeconds: 120,
  },
  {
    name: "furosemide (Lasix) injection 30 mg IV every 12 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "30 mg = 3 mL",
    concentration: "10 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 12 hours",
    route: "Intravenous",
    orderedDose: "30 mg",
    reason: "fluid volume excess",
    administrationInstructions: "Administer over 1.5 minutes.",
    referenceTitle: "Furosemide Recommended Administration",
    referenceBody: "May be given undiluted. Administer no faster than 20 mg/minute.",
    administrationTimeSource: "Administration Instructions",
    requiredSeconds: 90,
  },
  {
    name: "pantoprazole (Protonix) injection 40 mg IV every 24 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "40 mg = 10 mL",
    concentration: "4 mg/1 mL",
    lastAdmin: "Yesterday at 0900",
    frequency: "Every 24 hours",
    route: "Intravenous",
    orderedDose: "40 mg",
    reason: "gastric reflux",
    administrationInstructions: "Administer over 2 minutes",
    referenceTitle: "Pantoprazole Recommended Administration",
    referenceBody: "Reconstitute to a concentration of 4 mg/mL. Administer 40 mg over 2 minutes.",
    administrationTimeSource: "Administration Instructions",
    requiredSeconds: 120,
  },
  {
    name: "methylprednisolone ( Solu-medrol ) injection 80 mg IV every 12 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "80 mg = 2 mL",
    concentration: "40 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 12 hours",
    route: "Intravenous",
    orderedDose: "80 mg",
    reason: "inflammation",
    administrationInstructions: "Reconstitute with provided solution.",
    referenceTitle: "Methylprednisolone Recommended Administration",
    referenceBody: "Reconstitute with provided solution. Administer over 3 minutes.",
    administrationTimeSource: "Additional Drug Information",
    requiredSeconds: 180,
  },
  {
    name: "ketorolac (Toradol) injection 30 mg IV every 6 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "30 mg = 1 mL",
    concentration: "30 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 6 hours",
    route: "Intravenous",
    orderedDose: "30 mg",
    reason: "pain",
    administrationInstructions: "Do not exceed 120 mg every 24 hours",
    referenceTitle: "Ketorolac Recommended Administration",
    referenceBody: "May be given undiluted. Administer over one minute.",
    administrationTimeSource: "Additional Drug Information",
    requiredSeconds: 60,
  },
  {
    name: "bumetanide (Bumex) injection 1 mg IV every 6 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "1 mg = 4 mL",
    concentration: "0.25 mg/mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 6 hours",
    route: "Intravenous",
    orderedDose: "1 mg",
    reason: "renal impairment",
    administrationInstructions: "Administer over 1 minute",
    referenceTitle: "Bumetanide Recommended Administration",
    referenceBody: "May be given undiluted. Administer slowly over 1 minute.",
    administrationTimeSource: "Administration Instructions",
    requiredSeconds: 60,
  },
  {
    name: "phenytoin (Dilantin) injection 150 mg IV every 8 hours",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "150 mg = 3 mL",
    concentration: "50 mg/1 mL",
    lastAdmin: "Yesterday at 2300",
    frequency: "Every 8 hours",
    route: "Intravenous",
    orderedDose: "150 mg",
    reason: "prevent seizures",
    administrationInstructions: "Administer over 3 minutes",
    referenceTitle: "Phenytoin Recommended Administration",
    referenceBody: "Give undiluted. Administer no faster than 50 mg/minute.",
    administrationTimeSource: "Administration Instructions",
    requiredSeconds: 180,
  },
  {
    name: "lorazepam (Ativan) injection 4 mg IV every 15 minutes PRN",
    linkedLine: "PICC single lumen left basilic",
    orderedAdminDose: "4 mg = 2 mL",
    concentration: "4 mg/1 mL",
    lastAdmin: "Yesterday at 2100",
    frequency: "Every 15 minutes",
    route: "Intravenous",
    orderedDose: "4 mg",
    reason: "active seizure",
    administrationInstructions:
      "Dilute with equal amount of normal saline for injection. Notify the physician if seizure continues after two doses.",
    referenceTitle: "Lorazepam Recommended Administration",
    referenceBody: "Dilute with equal volume of diluent. Administer over 2 minutes.",
    administrationTimeSource: "Additional Drug Information",
    requiredSeconds: 120,
  },
];

export function parseMl(dose: string) {
  const match = dose.match(/=\s*(\d+(?:\.\d+)?)\s*mL/i);
  if (!match) return 1;
  return Math.max(1, Math.round(Number(match[1])));
}

export function generateParticipantId() {
  return `P${Math.floor(100000 + Math.random() * 900000)}`;
}

export function createParticipant(): Participant {
  return {
    participantId: "",
    age: "",
    gender: "",
    levelOfNursing: "",
    areaOfNursing: "",
    yearsOfNursingExperience: "",
  };
}

export function vialSizeForDose(doseMl: number) {
  if (doseMl <= 2) return 3;
  if (doseMl <= 4) return 5;
  return 10;
}

export function formatCompletedAt(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hour24 = date.getHours();
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${month}/${day}/${year} ${hour12}:${minutes}${suffix}`;
}

export function complianceForElapsed(elapsedSeconds: number, requiredSeconds: number): ComplianceStatus {
  return elapsedSeconds >= requiredSeconds ? "In compliance" : "Not in compliance";
}

export function formatSeconds(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function validateParticipant(participant: Participant): ParticipantErrors {
  const errors: ParticipantErrors = {};
  const age = participant.age.trim();
  const yearsOfNursingExperience = participant.yearsOfNursingExperience.trim();

  if (age && !/^\d+$/.test(age)) {
    errors.age = "Age must be entered as a whole number.";
  } else if (age) {
    const parsedAge = Number(age);
    if (parsedAge < 16 || parsedAge > 100) {
      errors.age = "Age must be between 16 and 100.";
    }
  }

  if (yearsOfNursingExperience && !/^\d+(?:\.\d+)?$/.test(yearsOfNursingExperience)) {
    errors.yearsOfNursingExperience = "Years of nursing experience must be a number.";
  } else if (yearsOfNursingExperience) {
    const parsedYears = Number(yearsOfNursingExperience);
    if (parsedYears < 0 || parsedYears > 80) {
      errors.yearsOfNursingExperience = "Years of nursing experience must be between 0 and 80.";
    }
  }

  return errors;
}

export function displayParticipantValue(value: string) {
  return value.trim() || "Not entered";
}
