"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONSENT_SECTIONS,
  GENDER_OPTIONS,
  MEDS,
  NURSING_LEVEL_OPTIONS,
  PRACTICE_MED,
  RUN_TYPE_LABELS,
  complianceForElapsed,
  createParticipant,
  displayParticipantValue,
  formatCompletedAt,
  generateParticipantId,
  parseMl,
  validateParticipant,
  vialSizeForDose,
} from "./lib/simulation";
import type { ConsentChoice, ExportRow, InfusionResult, Participant, ParticipantErrors, RunType } from "./lib/simulation";

type Screen = "landing" | "consent" | "demographics" | "practice" | "med" | "done";
type ResultSaveStatus = "idle" | "saving" | "saved" | "warning" | "error";
type ResultSaveState = {
  status: ResultSaveStatus;
  message: string;
  detail?: string;
};

const INITIAL_RESULT_SAVE_STATE: ResultSaveState = {
  status: "idle",
  message: "",
};

function createRunId(runType: RunType) {
  const prefix = runType === "official" ? "OFFICIAL" : "TRAINING";
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);

  return `${prefix}-${timestamp}-${randomPart}`;
}

function InfusionPanel({
  orderedAdminDose,
  onChange,
}: {
  orderedAdminDose: string;
  onChange: (r: InfusionResult) => void;
}) {
  const doseMl = parseMl(orderedAdminDose);
  const vialMl = vialSizeForDose(doseMl);
  const STEP_ML = 0.1;
  const totalUnits = Math.round(doseMl / STEP_ML);
  const [remainingUnits, setRemainingUnits] = useState(totalUnits);
  const [firstPushAt, setFirstPushAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [nowMs, setNowMs] = useState(performance.now());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [flowMode, setFlowMode] = useState<"idle" | "click" | "hold">("idle");
  const holdIntervalRef = useMemo<{ current: ReturnType<typeof setInterval> | null }>(() => ({ current: null }), []);
  const holdStartTimeoutRef = useMemo<{ current: ReturnType<typeof setTimeout> | null }>(() => ({ current: null }), []);
  const isHoldingRef = useMemo<{ current: boolean }>(() => ({ current: false }), []);
  const firstPushRef = useMemo<{ current: number | null }>(() => ({ current: null }), []);
  const remainingUnitsRef = useMemo<{ current: number }>(() => ({ current: totalUnits }), [totalUnits]);
  const pressActiveRef = useRef(false);

  const complete = remainingUnits === 0;

  useEffect(() => {
    if (!firstPushAt || complete) return;
    const id = setInterval(() => setElapsedMs(performance.now() - firstPushAt), 50);
    return () => clearInterval(id);
  }, [firstPushAt, complete]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(performance.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    remainingUnitsRef.current = remainingUnits;
  }, [remainingUnits, remainingUnitsRef]);

  const clearHold = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    if (holdStartTimeoutRef.current) {
      clearTimeout(holdStartTimeoutRef.current);
      holdStartTimeoutRef.current = null;
    }
    isHoldingRef.current = false;
  }, [holdIntervalRef, holdStartTimeoutRef, isHoldingRef]);

  const pulseFlow = () => {
    setFlowMode("click");
    setTimeout(() => setFlowMode("idle"), 420);
  };

  const pushOne = () => {
    if (remainingUnitsRef.current <= 0) return false;

    const pushedAt = performance.now();
    if (firstPushRef.current === null) {
      firstPushRef.current = pushedAt;
      setFirstPushAt(pushedAt);
    }

    const next = Math.max(0, remainingUnitsRef.current - 1);
    remainingUnitsRef.current = next;
    setRemainingUnits(next);
    return true;
  };

  const startHoldPush = () => {
    if (complete || pressActiveRef.current || holdIntervalRef.current || holdStartTimeoutRef.current) return;
    pressActiveRef.current = true;

    holdStartTimeoutRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      setFlowMode("hold");
      const pushed = pushOne();
      if (!pushed) {
        clearHold();
        setFlowMode("idle");
        return;
      }
      holdIntervalRef.current = setInterval(() => {
        const didPush = pushOne();
        if (!didPush) {
          clearHold();
          setFlowMode("idle");
        }
      }, 220);
      holdStartTimeoutRef.current = null;
    }, 180);
  };

  const finishPush = () => {
    if (!pressActiveRef.current) return;
    pressActiveRef.current = false;

    if (isHoldingRef.current) {
      clearHold();
      setFlowMode("idle");
      return;
    }

    if (holdStartTimeoutRef.current) {
      clearTimeout(holdStartTimeoutRef.current);
      holdStartTimeoutRef.current = null;
    }

    const pushed = pushOne();
    if (pushed) pulseFlow();
  };

  const cancelPush = () => {
    if (!pressActiveRef.current) return;
    pressActiveRef.current = false;
    clearHold();
    setFlowMode("idle");
  };

  useEffect(() => {
    onChange({ complete: false, elapsedSeconds: null, completedAt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remainingUnits !== 0 || !firstPushAt) return;
    const finalElapsedMs = performance.now() - firstPushAt;
    setElapsedMs(finalElapsedMs);
    pressActiveRef.current = false;
    clearHold();
    setFlowMode("idle");
    onChange({
      complete: true,
      elapsedSeconds: Number((finalElapsedMs / 1000).toFixed(2)),
      completedAt: formatCompletedAt(new Date()),
    });
  }, [remainingUnits, firstPushAt, onChange, clearHold]);

  useEffect(() => {
    return () => clearHold();
  }, [clearHold]);

  useEffect(() => {
    if (!showResetConfirm) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowResetConfirm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showResetConfirm]);

  const reset = () => {
    pressActiveRef.current = false;
    clearHold();
    firstPushRef.current = null;
    remainingUnitsRef.current = totalUnits;
    setRemainingUnits(totalUnits);
    setFirstPushAt(null);
    setElapsedMs(0);
    setFlowMode("idle");
    onChange({ complete: false, elapsedSeconds: null, completedAt: null });
  };

  const totalSeconds = elapsedMs / 1000;
  const elapsedSeconds = Math.floor(totalSeconds % 60);
  const elapsedMinutes = Math.floor(totalSeconds / 60);

  const completionMs = elapsedMs;
  const sinceFirstPushMs = firstPushAt ? Math.max(0, nowMs - firstPushAt) : 0;
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  const [wallClockMs, setWallClockMs] = useState<number | null>(null);

  useEffect(() => {
    setWallClockMs(Date.now());
    const id = setInterval(() => setWallClockMs(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const wallDate = wallClockMs ? new Date(wallClockMs) : null;
  const wallSeconds = wallDate ? wallDate.getSeconds() + wallDate.getMilliseconds() / 1000 : 0;
  const wallMinutes = wallDate ? wallDate.getMinutes() + wallSeconds / 60 : 0;
  const wallHours = wallDate ? (wallDate.getHours() % 12) + wallMinutes / 60 : 0;
  const secondHandDeg = wallSeconds * 6;
  const minuteHandDeg = wallMinutes * 6;
  const hourHandDeg = wallHours * 30;
  const wallTimeLabel = wallDate ? wallDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";

  const remainingMl = remainingUnits * STEP_ML;
  const majorStep = vialMl === 3 ? 0.5 : 1;
  const scaleStep = vialMl === 10 ? 0.2 : 0.1;
  const activeStartPct = 100 / 6;
  const activeHeightPct = 100 - activeStartPct;
  const filledPct = (remainingMl / vialMl) * activeHeightPct;
  return (
    <div className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-zinc-900">Syringe Infusion Trainer</h3>

      <div className="mx-auto flex min-h-[500px] w-full max-w-[520px] flex-wrap items-start justify-center gap-8 pt-2">
        <div className="relative h-[458px] w-[120px] origin-top scale-[1.12]">
          <div className="absolute left-1/2 top-[34px] h-[2px] w-[80px] -translate-x-1/2 bg-zinc-700" />
          <div className="absolute left-1/2 top-[35px] h-14 w-[50px] -translate-x-1/2 border border-zinc-700 bg-zinc-100 shadow-sm" />

          <div className="absolute left-1/2 top-[48px] h-[286px] w-[100px] -translate-x-1/2 rounded-[3px] border-4 border-zinc-700 bg-zinc-50 shadow-inner">
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-yellow-400 to-yellow-200 transition-all duration-300"
              style={{ height: `${filledPct}%` }}
            />

            {Array.from({ length: Math.round(vialMl / scaleStep) + 1 }).map((_, i) => {
              const vialUnits = Math.round(vialMl / scaleStep);
              const y = activeStartPct + (i / vialUnits) * activeHeightPct;
              const labelValue = vialMl - i * scaleStep;
              const isZero = Math.abs(labelValue) < 1e-6;
              if (isZero) return null;
              const isMajor = Math.abs(labelValue / majorStep - Math.round(labelValue / majorStep)) < 1e-6;
              const safeLabel = Number(labelValue.toFixed(1));
              return (
                <div key={`tick-${i}`} className="absolute left-0 right-0" style={{ top: `${y}%` }}>
                  <div className={`ml-1 ${isMajor ? "h-[2px] w-8 bg-zinc-700" : "h-[1px] w-4 bg-zinc-500/80"}`} />
                  {isMajor && (
                    <span className="absolute left-10 -top-[6px] text-[9px] font-bold leading-none text-zinc-600">
                      {safeLabel === vialMl ? `${safeLabel}mL` : safeLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <svg className="absolute left-0 top-0" width="120" height="458" viewBox="0 0 120 458" aria-hidden>
            <path
              d="M12 333 L46 349 L54 390 L65 390 L72 349 L106 333"
              fill="none"
              stroke="rgb(63 63 70)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="absolute left-1/2 top-[390px] h-8 w-[2px] -translate-x-1/2 bg-zinc-700" />
          <div
            className="absolute left-1/2 top-[390px] h-8 w-[2px] bg-yellow-300"
            style={{
              opacity: flowMode === "idle" ? 0 : 1,
              transform: flowMode === "idle" ? "translateX(-50%) translateY(0px)" : "translateX(-50%) translateY(10px)",
              transition: flowMode === "click" ? "transform 420ms ease-out, opacity 420ms ease-out" : "transform 220ms linear, opacity 220ms linear",
            }}
          />
          <div
            className="absolute left-1/2 top-[420px] h-[4px] w-[4px] -translate-x-1/2 rounded-full bg-yellow-300"
            style={{ opacity: flowMode === "idle" ? 0 : 1, transition: flowMode === "click" ? "opacity 420ms ease-out" : "opacity 220ms linear" }}
          />
        </div>

        <div className="grid h-[264px] w-[264px] shrink-0 place-items-center rounded-full border-[4px] border-zinc-200 bg-gradient-to-b from-white to-zinc-100 p-1 shadow-inner">
          <div className="relative h-52 w-52 rounded-full border-2 border-zinc-300 bg-white">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 160 160" aria-hidden>
              {Array.from({ length: 60 }).map((_, i) => {
                const angle = i * 6 - 90;
                const longTick = i % 5 === 0;
                const outerR = 79;
                const innerR = longTick ? 69 : 73;
                const x1 = 80 + innerR * Math.cos((angle * Math.PI) / 180);
                const y1 = 80 + innerR * Math.sin((angle * Math.PI) / 180);
                const x2 = 80 + outerR * Math.cos((angle * Math.PI) / 180);
                const y2 = 80 + outerR * Math.sin((angle * Math.PI) / 180);
                return (
                  <line
                    key={`tick-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={longTick ? "rgb(82 82 91)" : "rgb(161 161 170)"}
                    strokeWidth={longTick ? 1.8 : 1}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 160 160" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => {
                const angle = hour * 30 - 90;
                const r = 57;
                const x = 80 + r * Math.cos((angle * Math.PI) / 180);
                const y = 80 + r * Math.sin((angle * Math.PI) / 180);
                return (
                  <text
                    key={hour}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="11"
                    fontWeight="700"
                    fill="rgb(113 113 122)"
                  >
                    {hour}
                  </text>
                );
              })}
            </svg>
            <div
              className="absolute h-[48px] w-[5px] rounded-full bg-zinc-800"
              style={{ left: "50%", bottom: "50%", transform: `translateX(-50%) rotate(${hourHandDeg}deg)`, transformOrigin: "50% 100%" }}
            />
            <div
              className="absolute h-[66px] w-[4px] rounded-full bg-zinc-600"
              style={{ left: "50%", bottom: "50%", transform: `translateX(-50%) rotate(${minuteHandDeg}deg)`, transformOrigin: "50% 100%" }}
            />
            <div
              className="absolute h-[74px] w-[2px] rounded-full bg-red-500"
              style={{ left: "50%", bottom: "50%", transform: `translateX(-50%) rotate(${secondHandDeg}deg)`, transformOrigin: "50% 100%" }}
            />
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-zinc-900" />
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Room clock</p>
        <p className="font-mono text-3xl font-bold text-zinc-900">{wallTimeLabel}</p>
      </div>

      <div className="flex h-[112px] items-center rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-center shadow-inner">
        {!complete ? (
          <div className="w-full space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Time since first push</p>
            <p className="font-mono text-6xl font-bold leading-none tracking-[0.08em] text-emerald-300 [text-shadow:0_0_10px_rgba(52,211,153,0.45)]">
              {String(elapsedMinutes).padStart(2, "0")}:{String(elapsedSeconds).padStart(2, "0")}
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 items-center divide-x divide-zinc-700">
            <div className="px-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Completion time</p>
              <p className="mt-1 font-mono text-[2.75rem] font-bold leading-none tracking-[0.08em] text-cyan-300">{formatElapsed(completionMs)}</p>
            </div>
            <div className="px-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Since first push</p>
              <p className="mt-1 font-mono text-[2.75rem] font-bold leading-none tracking-[0.08em] text-emerald-300">{formatElapsed(sinceFirstPushMs)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button === 0) startHoldPush();
          }}
          onPointerUp={finishPush}
          onPointerLeave={cancelPush}
          onPointerCancel={cancelPush}
          disabled={complete}
          className={
            "touch-none select-none rounded-xl px-4 py-4 text-base font-bold " +
            (complete
              ? "cursor-not-allowed bg-zinc-300 text-zinc-500"
              : "bg-blue-600 text-white hover:bg-blue-500")
          }
        >
          Push 0.1 mL
        </button>
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          className="rounded-xl bg-zinc-700 px-4 py-4 text-base font-bold text-white hover:bg-zinc-600"
        >
          Reset Dose
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 p-4 text-base">
        <p>
          Remaining: <span className="font-bold">{remainingMl.toFixed(1)} mL</span> / {doseMl.toFixed(1)} mL
        </p>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-dialog-title"
            className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl"
          >
            <p id="reset-dialog-title" className="text-2xl font-black text-zinc-900">
              Are you sure?
            </p>
            <p className="mt-3 text-base text-zinc-600">
              Resetting now will clear the current syringe progress and timer for this run.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setShowResetConfirm(false)}
                className="rounded-2xl bg-zinc-200 px-5 py-3 text-base font-bold text-zinc-900 hover:bg-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setShowResetConfirm(false);
                }}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-base font-bold text-white hover:bg-rose-500"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [index, setIndex] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const [infusionByMed, setInfusionByMed] = useState<Record<number, InfusionResult>>({});
  const [referenceOpenedByMed, setReferenceOpenedByMed] = useState<Record<number, boolean>>({});
  const [participant, setParticipant] = useState<Participant>(() => createParticipant());
  const [participantErrors, setParticipantErrors] = useState<ParticipantErrors>({});
  const [consentChoice, setConsentChoice] = useState<ConsentChoice | null>(null);
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<string | null>(null);
  const [consentReachedBottom, setConsentReachedBottom] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [showRunTypeMenu, setShowRunTypeMenu] = useState(false);
  const [pendingRunType, setPendingRunType] = useState<RunType | null>(null);
  const [activeRunType, setActiveRunType] = useState<RunType | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [resultSaveState, setResultSaveState] = useState<ResultSaveState>(INITIAL_RESULT_SAVE_STATE);
  const activeSaveRunIdRef = useRef<string | null>(null);
  const consentScrollRef = useRef<HTMLDivElement | null>(null);

  const med = MEDS[index];
  const activeMed = screen === "practice" ? PRACTICE_MED : med;
  const progress = useMemo(() => String(index + 1) + " / " + String(MEDS.length), [index]);
  const canAdvance = infusionByMed[index]?.complete ?? false;
  const participantIdForSession = participant.participantId.trim();
  const consentAccepted = Boolean(consentAcceptedAt);
  const activeRunLabel = activeRunType ? RUN_TYPE_LABELS[activeRunType] : "Medication Rate Simulation";

  const updateParticipantField = (field: keyof Participant, value: string) => {
    setParticipant((prev) => ({ ...prev, [field]: value }));
    setParticipantErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleInfusionChange = useCallback(
    (result: InfusionResult) => {
      setInfusionByMed((prev) => ({ ...prev, [index]: result }));
    },
    [index],
  );

  const handlePracticeChange = useCallback(() => {}, []);

  const handleConsentScroll = () => {
    const node = consentScrollRef.current;
    if (!node) return;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom <= 8) setConsentReachedBottom(true);
  };

  const selectConsentChoice = (choice: ConsentChoice) => {
    setConsentChoice(choice);
    setConsentError("");
  };

  const goToConsent = () => {
    setConsentError("");
    setScreen("consent");
  };

  const resetMedicationProgress = () => {
    setShowRef(false);
    setIndex(0);
    setInfusionByMed({});
    setReferenceOpenedByMed({});
  };

  const resetRunTracking = () => {
    setShowRunTypeMenu(false);
    setPendingRunType(null);
    setActiveRunType(null);
    setActiveRunId(null);
    setResultSaveState(INITIAL_RESULT_SAVE_STATE);
    activeSaveRunIdRef.current = null;
  };

  const continueFromConsent = () => {
    if (!consentReachedBottom) {
      setConsentError("Scroll to the bottom of the consent form before agreeing.");
      return;
    }

    if (!consentChoice) {
      setConsentError("Select I Agree or I Do Not Agree before continuing.");
      return;
    }

    if (consentChoice === "disagree") {
      setConsentError("You must agree to the following terms to participate in this study.");
      return;
    }

    setParticipant((prev) => (prev.participantId ? prev : { ...prev, participantId: generateParticipantId() }));
    setConsentAcceptedAt((prev) => prev ?? formatCompletedAt(new Date()));
    setConsentError("");
    setScreen("demographics");
  };

  const openDrugReference = () => {
    if (screen === "med") {
      setReferenceOpenedByMed((prev) => ({ ...prev, [index]: true }));
    }

    setShowRef(true);
  };

  const exportRows = useMemo<ExportRow[]>(() => {
    return MEDS.flatMap((entry, medIndex) => {
      const result = infusionByMed[medIndex];
      if (!result?.complete || result.elapsedSeconds === null || !result.completedAt) return [];

      return [
        {
          participantId: participant.participantId.trim(),
          age: participant.age.trim(),
          gender: participant.gender,
          levelOfNursing: participant.levelOfNursing,
          areaOfNursing: participant.areaOfNursing.trim(),
          yearsOfNursingExperience: participant.yearsOfNursingExperience.trim(),
          medicationName: entry.name,
          administrationTimeSource: entry.administrationTimeSource,
          medicationAdministrationTimeSeconds: Number(result.elapsedSeconds.toFixed(2)),
          requiredMinimumSeconds: entry.requiredSeconds,
          complianceStatus: complianceForElapsed(result.elapsedSeconds, entry.requiredSeconds),
          additionalDrugInformationViewed: referenceOpenedByMed[medIndex] ? "Yes" : "No",
          completedAt: result.completedAt,
        },
      ];
    });
  }, [
    infusionByMed,
    participant.age,
    participant.areaOfNursing,
    participant.gender,
    participant.levelOfNursing,
    participant.participantId,
    participant.yearsOfNursingExperience,
    referenceOpenedByMed,
  ]);

  const saveCompletedRun = useCallback(async () => {
    if (!activeRunType || !activeRunId || !consentAcceptedAt || !exportRows.length) return;
    if (activeSaveRunIdRef.current === activeRunId && resultSaveState.status !== "error") return;

    activeSaveRunIdRef.current = activeRunId;
    setResultSaveState({
      status: "saving",
      message: "Saving this completed run to the secure study database.",
    });

    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: activeRunId,
          runType: activeRunType,
          consentAcceptedAt,
          participant,
          rows: exportRows,
        }),
      });
      const responseBody = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        rowsAttempted?: number;
        rowsInserted?: number;
        duplicate?: boolean;
        warning?: string;
        googleSheetsSync?: {
          configured?: boolean;
          attempted?: boolean;
          synced?: boolean;
          warning?: string;
        };
      } | null;

      if (!response.ok) {
        throw new Error(responseBody?.error ?? "Results could not be saved.");
      }

      const warning = responseBody?.warning ?? responseBody?.googleSheetsSync?.warning;
      setResultSaveState({
        status: warning ? "warning" : "saved",
        message:
          warning ??
          (responseBody?.duplicate
            ? "This run was already present in the study database, so no duplicate rows were added."
            : "Saved to secure study database."),
        detail:
          typeof responseBody?.rowsInserted === "number" && typeof responseBody?.rowsAttempted === "number"
            ? `${responseBody.rowsInserted} of ${responseBody.rowsAttempted} rows added. Admin Excel export includes database rows.`
            : undefined,
      });
    } catch (error) {
      activeSaveRunIdRef.current = null;
      setResultSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Results could not be saved. Please try again.",
      });
    }
  }, [activeRunId, activeRunType, consentAcceptedAt, exportRows, participant, resultSaveState.status]);

  useEffect(() => {
    if (screen !== "done" || resultSaveState.status !== "idle") return;
    void saveCompletedRun();
  }, [resultSaveState.status, saveCompletedRun, screen]);

  const openPracticeRun = () => {
    if (!consentAccepted) {
      setScreen("consent");
      setConsentError("You must agree to the following terms to participate in this study.");
      return;
    }

    const errors = validateParticipant(participant);
    setParticipantErrors(errors);
    if (Object.keys(errors).length > 0) return;

    resetMedicationProgress();
    resetRunTracking();
    setScreen("practice");
  };

  const startActualSimulation = () => {
    if (!consentAccepted) {
      setConsentError("You must agree to the following terms to participate in this study.");
      setScreen("consent");
      return;
    }

    const errors = validateParticipant(participant);
    setParticipantErrors(errors);
    if (Object.keys(errors).length > 0) {
      setScreen("demographics");
      return;
    }

    setPendingRunType(null);
    setShowRunTypeMenu(true);
  };

  const confirmRunTypeAndStart = () => {
    if (!pendingRunType) return;

    if (!consentAccepted) {
      setShowRunTypeMenu(false);
      setConsentError("You must agree to the following terms to participate in this study.");
      setScreen("consent");
      return;
    }

    const errors = validateParticipant(participant);
    setParticipantErrors(errors);
    if (Object.keys(errors).length > 0) {
      setShowRunTypeMenu(false);
      setScreen("demographics");
      return;
    }

    resetMedicationProgress();
    setActiveRunType(pendingRunType);
    setActiveRunId(createRunId(pendingRunType));
    setResultSaveState(INITIAL_RESULT_SAVE_STATE);
    activeSaveRunIdRef.current = null;
    setShowRunTypeMenu(false);
    setPendingRunType(null);
    setScreen("med");
  };

  const backToDemographics = () => {
    resetMedicationProgress();
    resetRunTracking();
    setScreen("demographics");
  };

  const toHome = () => {
    resetMedicationProgress();
    resetRunTracking();
    setScreen("landing");
    setParticipant(createParticipant());
    setParticipantErrors({});
    setConsentChoice(null);
    setConsentAcceptedAt(null);
    setConsentReachedBottom(false);
    setConsentError("");
  };

  if (screen === "landing") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl md:p-10">
            <p className="inline-flex rounded-full bg-blue-100 px-4 py-1 text-sm font-semibold text-blue-700">Medication Rate Simulation</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">IV Push Medication Training</h1>
            <p className="mt-4 max-w-3xl text-lg text-zinc-600">
              Review participant information, move through a practice run, and then choose a training or official study sequence.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Total Medications</p>
                <p className="mt-1 text-3xl font-bold">{MEDS.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Pre-Simulation Step</p>
                <p className="mt-1 text-3xl font-bold">Practice Run</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Data Export</p>
                <p className="mt-1 text-3xl font-bold">Study Database</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">How it works</p>
              <ol className="mt-3 space-y-2 text-base text-zinc-700">
                <li>1. Review the informed consent form.</li>
                <li>2. Complete the participant information page.</li>
                <li>3. Move through practice, select a run type, and complete the medication sequence.</li>
              </ol>
            </div>

            <button
              onClick={goToConsent}
              className="mt-10 rounded-2xl bg-blue-600 px-8 py-5 text-xl font-bold text-white shadow-lg transition hover:bg-blue-500"
            >
              Next
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "consent") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-5xl">
          <ParticipantIdTab participantId={participantIdForSession} />
          <div className="rounded-3xl border border-blue-200 bg-white p-8 shadow-xl md:p-10">
            <p className="inline-flex rounded-full bg-blue-100 px-4 py-1 text-sm font-semibold text-blue-700">Step 1 of 3</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">Informed Consent</h1>
            <p className="mt-4 max-w-3xl text-lg text-zinc-600">
              Read the consent form, choose whether you agree to participate, and then continue to the participant information page.
            </p>

            <div
              ref={consentScrollRef}
              onScroll={handleConsentScroll}
              className="mt-8 max-h-[28rem] space-y-5 overflow-y-auto rounded-2xl border border-blue-200 bg-blue-50 p-6 text-sm leading-7 text-zinc-700"
            >
              {CONSENT_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-2">
                  <h2 className="text-base font-bold text-zinc-900">{section.title}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2 pl-5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="list-disc">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Consent Selection</p>
              <p className="mt-2 text-base text-zinc-700">
                {consentReachedBottom ? "Select one option below." : "Scroll to the bottom of the consent form before selecting an option."}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ConsentChoiceCard
                  label="I Agree"
                  description="I have read the information above and agree to participate."
                  selected={consentChoice === "agree"}
                  disabled={!consentReachedBottom}
                  onClick={() => selectConsentChoice("agree")}
                />
                <ConsentChoiceCard
                  label="I Do Not Agree"
                  description="I do not agree to participate in this study."
                  selected={consentChoice === "disagree"}
                  disabled={!consentReachedBottom}
                  onClick={() => selectConsentChoice("disagree")}
                />
              </div>

              {consentError && <p className="mt-4 text-sm font-semibold text-rose-700">{consentError}</p>}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={toHome} className="rounded-2xl bg-zinc-800 px-6 py-4 text-lg font-bold text-white hover:bg-zinc-700">
                Back
              </button>
              <button onClick={continueFromConsent} className="rounded-2xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-500">
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "demographics") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl">
          <ParticipantIdTab participantId={participantIdForSession} />
          <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl md:p-10">
            <p className="inline-flex rounded-full bg-blue-100 px-4 py-1 text-sm font-semibold text-blue-700">Step 2 of 3</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">Participant Information</h1>
            <p className="mt-4 max-w-3xl text-lg text-zinc-600">
              Complete the participant information below before moving to the practice run.
            </p>

            <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900">Demographics Survey</h2>
                  <p className="mt-2 text-base text-zinc-600">The participant ID is assigned automatically and shown in the top-right corner.</p>
                </div>
                {consentAcceptedAt && (
                  <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800">Agreed {consentAcceptedAt}</span>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Age</span>
                  <input
                    type="number"
                    min="16"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    value={participant.age}
                    onChange={(event) => updateParticipantField("age", event.target.value)}
                    placeholder="e.g. 24"
                    aria-invalid={Boolean(participantErrors.age)}
                    className={
                      "w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none transition focus:ring " +
                      (participantErrors.age ? "border-rose-500 ring-rose-200" : "border-zinc-300 ring-blue-200")
                    }
                  />
                  {participantErrors.age && <p className="text-sm font-semibold text-rose-700">{participantErrors.age}</p>}
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Gender</span>
                  <select
                    value={participant.gender}
                    onChange={(event) => updateParticipantField("gender", event.target.value)}
                    aria-invalid={Boolean(participantErrors.gender)}
                    className={
                      "w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none transition focus:ring " +
                      (participantErrors.gender ? "border-rose-500 ring-rose-200" : "border-zinc-300 ring-blue-200")
                    }
                  >
                    <option value="">Select an option</option>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {participantErrors.gender && <p className="text-sm font-semibold text-rose-700">{participantErrors.gender}</p>}
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Level of Nursing</span>
                  <select
                    value={participant.levelOfNursing}
                    onChange={(event) => updateParticipantField("levelOfNursing", event.target.value)}
                    aria-invalid={Boolean(participantErrors.levelOfNursing)}
                    className={
                      "w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none transition focus:ring " +
                      (participantErrors.levelOfNursing ? "border-rose-500 ring-rose-200" : "border-zinc-300 ring-blue-200")
                    }
                  >
                    <option value="">Select an option</option>
                    {NURSING_LEVEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {participantErrors.levelOfNursing && <p className="text-sm font-semibold text-rose-700">{participantErrors.levelOfNursing}</p>}
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Area of Nursing</span>
                  <input
                    type="text"
                    value={participant.areaOfNursing}
                    onChange={(event) => updateParticipantField("areaOfNursing", event.target.value)}
                    placeholder="e.g. ICU, Med Surg"
                    aria-invalid={Boolean(participantErrors.areaOfNursing)}
                    className={
                      "w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none transition focus:ring " +
                      (participantErrors.areaOfNursing ? "border-rose-500 ring-rose-200" : "border-zinc-300 ring-blue-200")
                    }
                  />
                  {participantErrors.areaOfNursing && <p className="text-sm font-semibold text-rose-700">{participantErrors.areaOfNursing}</p>}
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Years of Nursing Experience</span>
                  <input
                    type="number"
                    min="0"
                    max="80"
                    step="0.5"
                    inputMode="decimal"
                    value={participant.yearsOfNursingExperience}
                    onChange={(event) => updateParticipantField("yearsOfNursingExperience", event.target.value)}
                    placeholder="e.g. 2.5"
                    aria-invalid={Boolean(participantErrors.yearsOfNursingExperience)}
                    className={
                      "w-full rounded-xl border bg-white px-4 py-3 text-lg font-semibold text-zinc-900 outline-none transition focus:ring " +
                      (participantErrors.yearsOfNursingExperience ? "border-rose-500 ring-rose-200" : "border-zinc-300 ring-blue-200")
                    }
                  />
                  {participantErrors.yearsOfNursingExperience && (
                    <p className="text-sm font-semibold text-rose-700">{participantErrors.yearsOfNursingExperience}</p>
                  )}
                </label>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setScreen("consent")} className="rounded-2xl bg-zinc-800 px-6 py-4 text-lg font-bold text-white hover:bg-zinc-700">
                Back
              </button>
              <button onClick={openPracticeRun} className="rounded-2xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-500">
                Continue to Practice Run
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "done") {
    return (
      <main className="grid min-h-screen place-items-center bg-gradient-to-b from-emerald-50 to-zinc-100 p-6 md:p-10">
        <div className="w-full max-w-6xl">
          <ParticipantIdTab participantId={participantIdForSession} />
          <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-xl md:p-10">
            <h1 className="text-4xl font-black text-zinc-900">Simulation Complete</h1>
            <p className="mt-3 text-lg text-zinc-600">
              Participant ID: <span className="font-semibold text-zinc-900">{displayParticipantValue(participant.participantId)}</span>
            </p>
            <p className="mt-1 text-zinc-600">
              {activeRunId ? `${activeRunLabel}: ${activeRunId}` : activeRunLabel}
            </p>
            <p className="mt-1 text-zinc-600">Completed rows are saved automatically to the secure study database.</p>

            <div
              className={
                "mt-6 rounded-2xl border p-5 " +
                (resultSaveState.status === "saved"
                  ? "border-emerald-200 bg-emerald-50"
                  : resultSaveState.status === "error" || resultSaveState.status === "warning"
                    ? "border-amber-300 bg-amber-50"
                    : "border-blue-200 bg-blue-50")
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p
                    className={
                      "text-sm font-semibold uppercase tracking-wide " +
                      (resultSaveState.status === "saved"
                        ? "text-emerald-700"
                        : resultSaveState.status === "error" || resultSaveState.status === "warning"
                          ? "text-amber-800"
                          : "text-blue-700")
                    }
                  >
                    {resultSaveState.status === "saved"
                      ? "Database save complete"
                      : resultSaveState.status === "error"
                        ? "Database save needs retry"
                        : resultSaveState.status === "warning"
                          ? "Database saved with warning"
                          : "Database save in progress"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-zinc-900">
                    {resultSaveState.message || "Preparing completed rows for the database."}
                  </p>
                  {resultSaveState.detail && <p className="mt-2 text-sm text-zinc-700">{resultSaveState.detail}</p>}
                </div>
                {resultSaveState.status === "error" && (
                  <button
                    type="button"
                    onClick={saveCompletedRun}
                    className="rounded-2xl bg-amber-600 px-5 py-3 text-base font-bold text-white hover:bg-amber-500"
                  >
                    Retry Database Save
                  </button>
                )}
              </div>
            </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SummaryCard label="Run Type" value={activeRunLabel} />
            <SummaryCard label="Run ID" value={activeRunId ?? "Not assigned"} />
            <SummaryCard label="Participant ID" value={displayParticipantValue(participant.participantId)} />
            <SummaryCard label="Age" value={displayParticipantValue(participant.age)} />
            <SummaryCard label="Gender" value={displayParticipantValue(participant.gender)} />
            <SummaryCard label="Level of Nursing" value={displayParticipantValue(participant.levelOfNursing)} />
            <SummaryCard label="Area of Nursing" value={displayParticipantValue(participant.areaOfNursing)} />
            <SummaryCard label="Years of Nursing Experience" value={displayParticipantValue(participant.yearsOfNursingExperience)} />
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Medication</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Administration Time Source</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Time (sec)</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Minimum (sec)</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Compliance</th>
                  <th className="px-4 py-3 font-semibold text-zinc-700">Additional Drug Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {exportRows.map((row) => (
                  <tr key={row.medicationName}>
                    <td className="px-4 py-3 text-zinc-900">{row.medicationName}</td>
                    <td className="px-4 py-3 text-zinc-700">{row.administrationTimeSource}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-900">{row.medicationAdministrationTimeSeconds}</td>
                    <td className="px-4 py-3 text-zinc-700">{row.requiredMinimumSeconds}</td>
                    <td
                      className={
                        row.complianceStatus === "In compliance"
                          ? "px-4 py-3 font-semibold text-emerald-700"
                          : "px-4 py-3 font-semibold text-rose-700"
                      }
                    >
                      {row.complianceStatus}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{row.additionalDrugInformationViewed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={toHome} className="rounded-2xl bg-zinc-900 px-6 py-4 text-base font-bold text-white hover:bg-zinc-700">
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const isPractice = screen === "practice";
  const modeAccentClass = activeRunType === "training" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700";
  const panelBorderClass = activeRunType === "training" ? "border-amber-200" : "border-zinc-200";
  const simulationMainClass = "min-h-screen bg-zinc-100 px-3 py-3 xl:h-screen xl:min-h-0 xl:overflow-hidden";
  const simulationGridClass =
    "mx-auto grid max-w-[1900px] gap-3 xl:grid-cols-[minmax(0,1fr)_560px] xl:[zoom:0.8] 2xl:[zoom:0.8] [@media(min-width:1800px)_and_(min-height:1000px)]:[zoom:0.99]";

  return (
    <main className={`${simulationMainClass} text-zinc-900`}>
      <div className="mx-auto max-w-[1580px]">
        <ParticipantIdTab participantId={participantIdForSession} />
      </div>
      <div className={simulationGridClass}>
        <section className={`rounded-3xl border bg-white p-6 shadow-xl md:p-8 ${panelBorderClass}`}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`inline-flex rounded-full px-4 py-1 text-sm font-semibold ${modeAccentClass}`}>
                {isPractice ? "Practice Run" : activeRunLabel}
              </p>
              <h1 className="mt-5 text-4xl font-black">IV Medication Order</h1>
            </div>
            <span className={`rounded-full px-4 py-2 text-base font-bold ${modeAccentClass}`}>
              {isPractice ? "Practice Run" : `${activeRunLabel} - ${progress}`}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="text-base font-semibold uppercase tracking-wide text-zinc-500">Linked line</p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{activeMed.linkedLine}</p>
              <p className="mt-3 text-lg font-medium text-zinc-800">{activeMed.name}</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-base font-semibold uppercase tracking-wide text-amber-700">Administration Instructions</p>
              <p className="mt-2 text-lg text-zinc-900">{activeMed.administrationInstructions || "None listed"}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Info label="Ordered Admin Dose" value={activeMed.orderedAdminDose} />
            <Info label="Concentration" value={activeMed.concentration} />
            <Info label="Last Admin" value={activeMed.lastAdmin} />
            <Info label="Frequency" value={activeMed.frequency} />
            <Info label="Route" value={activeMed.route} />
            <Info label="Ordered Dose" value={activeMed.orderedDose} />
            <Info label="Reason" value={activeMed.reason} />
            <Info label="Order information" value="Administration Instructions" />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={openDrugReference} className="rounded-2xl border border-emerald-300 bg-emerald-50 px-6 py-4 text-lg font-bold text-emerald-800 hover:bg-emerald-100">
              Additional Drug Information
            </button>
            <button
              onClick={() => {
                if (isPractice || index === 0) backToDemographics();
                else setIndex((value) => value - 1);
                setShowRef(false);
              }}
              className="rounded-2xl bg-zinc-800 px-6 py-4 text-lg font-bold text-white hover:bg-zinc-700"
            >
              {isPractice || index === 0 ? "Back to Participant Information" : "Back"}
            </button>
            {isPractice ? (
              <button onClick={startActualSimulation} className="rounded-2xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-500">
                Start Simulation
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowRef(false);
                  if (index === MEDS.length - 1) setScreen("done");
                  else setIndex((value) => value + 1);
                }}
                disabled={!canAdvance}
                className="rounded-2xl bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Next Medication
              </button>
            )}
          </div>
          {!isPractice && !canAdvance && <p className="mt-2 text-base font-semibold text-amber-700">Complete syringe infusion to continue.</p>}
        </section>

        <aside>
          <InfusionPanel
            key={isPractice ? "practice" : index}
            orderedAdminDose={activeMed.orderedAdminDose}
            onChange={isPractice ? handlePracticeChange : handleInfusionChange}
          />
        </aside>
      </div>

      {showRunTypeMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-type-dialog-title"
            className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl md:p-8"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Save Destination</p>
            <h2 id="run-type-dialog-title" className="mt-2 text-3xl font-black text-zinc-900">
              Select run type
            </h2>
            <p className="mt-3 max-w-2xl text-base text-zinc-600">
              This choice is locked for the full medication sequence and determines which worksheet receives the completed rows.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <RunTypeOptionCard
                label={RUN_TYPE_LABELS.training}
                description="Practice-quality sequence saved separately from official study data."
                selected={pendingRunType === "training"}
                tone="training"
                onClick={() => setPendingRunType("training")}
              />
              <RunTypeOptionCard
                label={RUN_TYPE_LABELS.official}
                description="Research sequence saved to the official study worksheet."
                selected={pendingRunType === "official"}
                tone="official"
                onClick={() => setPendingRunType("official")}
              />
            </div>

            <div className="mt-7 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRunTypeMenu(false);
                  setPendingRunType(null);
                }}
                className="rounded-2xl bg-zinc-200 px-5 py-3 text-base font-bold text-zinc-900 hover:bg-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRunTypeAndStart}
                disabled={!pendingRunType}
                className={
                  "rounded-2xl px-6 py-3 text-base font-bold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 " +
                  (pendingRunType === "training"
                    ? "bg-amber-600 hover:bg-amber-500"
                    : pendingRunType === "official"
                      ? "bg-blue-600 hover:bg-blue-500"
                      : "bg-zinc-300")
                }
              >
                Start Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {showRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-3xl rounded-3xl border border-emerald-200 bg-white p-7 shadow-2xl">
            <p className="text-base font-semibold uppercase tracking-wide text-emerald-700">Drug Reference</p>
            <h2 className="mt-2 text-3xl font-black text-zinc-900">{activeMed.referenceTitle}</h2>
            <p className="mt-4 text-xl text-zinc-800">{activeMed.referenceBody}</p>
            <button onClick={() => setShowRef(false)} className="mt-6 rounded-2xl bg-zinc-900 px-6 py-3 text-lg font-bold text-white hover:bg-zinc-700">
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ParticipantIdTab({ participantId }: { participantId: string }) {
  if (!participantId) return null;

  return (
    <div className="absolute right-3 top-0 z-40 flex justify-end sm:right-5">
      <div className="rounded-b-2xl border border-t-0 border-blue-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Participant ID</p>
        <p className="text-lg font-black text-zinc-900">{participantId}</p>
      </div>
    </div>
  );
}

function ConsentChoiceCard({
  label,
  description,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-start gap-4 rounded-2xl border px-5 py-4 text-left transition " +
        (selected ? "border-blue-500 bg-blue-50" : "border-zinc-200 bg-white") +
        (disabled ? " cursor-not-allowed opacity-50" : " hover:border-blue-300 hover:bg-blue-50/60")
      }
    >
      <span
        className={
          "mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm font-bold " +
          (selected ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 bg-white text-transparent")
        }
      >
        ✓
      </span>
      <span>
        <span className="block text-base font-bold text-zinc-900">{label}</span>
        <span className="mt-1 block text-sm text-zinc-600">{description}</span>
      </span>
    </button>
  );
}

function RunTypeOptionCard({
  label,
  description,
  selected,
  tone,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  tone: RunType;
  onClick: () => void;
}) {
  const selectedClasses =
    tone === "official" ? "border-blue-500 bg-blue-50 ring-blue-200" : "border-amber-500 bg-amber-50 ring-amber-200";
  const idleClasses =
    tone === "official"
      ? "border-zinc-200 bg-white hover:border-blue-300 hover:bg-blue-50/60"
      : "border-zinc-200 bg-white hover:border-amber-300 hover:bg-amber-50/70";
  const checkClasses = selected
    ? tone === "official"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-amber-600 bg-amber-600 text-white"
    : "border-zinc-300 bg-white text-transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-36 items-start gap-4 rounded-2xl border p-5 text-left ring-4 ring-transparent transition ${selected ? selectedClasses : idleClasses}`}
    >
      <span className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-base font-black ${checkClasses}`}>✓</span>
      <span>
        <span className="block text-xl font-black text-zinc-900">{label}</span>
        <span className="mt-2 block text-base leading-6 text-zinc-600">{description}</span>
      </span>
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold leading-snug text-zinc-900">{value}</p>
    </div>
  );
}
