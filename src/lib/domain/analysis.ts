import crypto from "node:crypto";

import { ApiError } from "../http/errors.ts";
import { LIMITS } from "../config.ts";
import type { AnalysisProvider } from "../ai/providers/types.ts";
import { ProviderError } from "../ai/providers/types.ts";
import { selectProvider } from "../ai/providers/index.ts";
import {
  getAiGlobalDailyLimit,
  getAiPerReportLimit,
  getAiTimeoutMs,
  getAiUserDailyLimit,
} from "../ai/config.ts";
import { prepareModelImage } from "../ai/image.ts";
import { applyGuardrails } from "../ai/guardrails.ts";
import { cleanCitizenText } from "../ai/prompt.ts";
import {
  ANALYSIS_LIMITS,
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
  FAILURE_LABEL,
  type AnalysisResult,
  type AnalysisView,
  type FailureCode,
} from "../ai/schema.ts";
import { PROMPT_VERSION } from "../ai/prompt.ts";
import type { Db } from "../db/connection.ts";
import { one, run } from "../db/query.ts";
import { internalId } from "../ids.ts";
import { REPORT_CATEGORY_IDS, type ReportCategoryId } from "./areas.ts";
import {
  getMediaByRole,
  getOwnedReportRow,
  toOwnerReport,
  type OwnerReport,
  type ReportRow,
} from "./reports.ts";
import { generateDraft } from "../services/assistant.ts";
import { readMedia } from "../services/media-store.ts";
import type { PublicUser } from "./users.ts";

/**
 * Report analysis and draft application.
 *
 * Invariants:
 * 1. One provider call per citizen-initiated analysis. An identical request
 *    (same image, text, category, area and clarification answer) reuses the
 *    stored result unless the caller explicitly asks for a refresh.
 * 2. Nothing a model returns is trusted: the JSON is parsed with a strict zod
 *    schema and then filtered by deterministic guardrails. A response that
 *    fails either check is never stored or shown; a safe fallback is recorded
 *    instead, with a fixed code.
 * 3. A provider failure never destroys the draft or blocks publication. The
 *    citizen keeps the rule-based draft they already had.
 * 4. Provenance is data, not a label: `mode`, `provider`, `model`,
 *    `externalTransfer` and `simulatedObservations` are stored per row.
 */

export type AnalysisRow = {
  id: string;
  report_id: string;
  owner_id: string;
  schema_version: string;
  prompt_version: string;
  status: "completed" | "fallback";
  mode: "live" | "mock" | "fallback";
  provider: string | null;
  model: string | null;
  external_transfer: number;
  simulated_observations: number;
  source_sha256: string;
  input_fingerprint: string;
  result_json: string;
  user_facts_json: string;
  clarification_question: string | null;
  clarification_answer: string | null;
  failure_code: string | null;
  guardrail_rules: string;
  guardrail_removed: number;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  applied_at: string | null;
  created_at: string;
};

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseStringArray(value: string): string[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function isCategory(value: string): value is ReportCategoryId {
  return (REPORT_CATEGORY_IDS as readonly string[]).includes(value);
}

/** Parse a stored result defensively; an unreadable row is treated as absent. */
function parseStoredResult(row: AnalysisRow): AnalysisResult | null {
  const parsed = analysisResultSchema.safeParse(parseJson(row.result_json));
  return parsed.success ? parsed.data : null;
}

/**
 * Server-composed report body from the structured draft plus the location the
 * citizen picked. The model never chooses the location line, and the text is
 * bounded by the same 2000-character limit as a hand-written description.
 */
export function composeReportDescription(input: {
  summary: string;
  concern: string;
  requestedAction: string;
  areaLabel: string;
  landmark: string;
}): string {
  const parts: string[] = ["현황", input.summary.trim()];
  if (input.concern.trim()) parts.push("", "우려되는 점", input.concern.trim());
  parts.push("", "요청", input.requestedAction.trim());
  const where = input.landmark.trim()
    ? `${input.areaLabel}, ${input.landmark.trim()} 인근 (구역 단위 표시)`
    : `${input.areaLabel} (구역 단위 표시)`;
  parts.push("", "위치", where);
  return parts.join("\n").slice(0, LIMITS.maxDescriptionLength);
}

function viewFromRow(row: AnalysisRow, report: ReportRow): AnalysisView | null {
  const result = parseStoredResult(row);
  if (!result) return null;
  const failureCode = row.failure_code as FailureCode | null;
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    status: row.status,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    result,
    userFacts: parseStringArray(row.user_facts_json),
    clarification:
      row.clarification_question && row.clarification_answer
        ? { question: row.clarification_question, answer: row.clarification_answer }
        : null,
    provenance: {
      mode: row.mode,
      provider: row.provider,
      model: row.model,
      externalTransfer: row.external_transfer === 1,
      simulatedObservations: row.simulated_observations === 1,
      latencyMs: row.latency_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    },
    failure:
      failureCode && row.failure_code
        ? { code: failureCode, message: FAILURE_LABEL[failureCode] ?? "AI 분석을 사용할 수 없습니다." }
        : null,
    guardrail: {
      removedItems: row.guardrail_removed,
      rules: parseStringArray(row.guardrail_rules),
    },
    proposedDescription: composeReportDescription({
      summary: result.draft.summary,
      concern: result.draft.concern,
      requestedAction: result.draft.requestedAction,
      areaLabel: report.area_label,
      landmark: report.landmark,
    }),
  };
}

/** Ownership is checked through the report, so a guessed id reveals nothing. */
function getOwnedAnalysisRow(
  db: Db,
  actor: PublicUser,
  report: ReportRow,
  analysisId: string,
): AnalysisRow {
  const row = one<AnalysisRow>(
    db,
    "SELECT * FROM report_analyses WHERE id = ? AND report_id = ? AND owner_id = ?",
    [analysisId, report.id, actor.id],
  );
  if (!row) throw new ApiError(404, "NOT_FOUND", "분석 결과를 찾을 수 없습니다.");
  return row;
}

function latestAnalysisRow(db: Db, reportId: string): AnalysisRow | undefined {
  return one<AnalysisRow>(
    db,
    "SELECT * FROM report_analyses WHERE report_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    [reportId],
  );
}

/** Latest analysis for the owner's report page; never another user's. */
export function getLatestAnalysis(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
): AnalysisView | null {
  const report = getOwnedReportRow(db, actor, publicReportId);
  const row = latestAnalysisRow(db, report.id);
  return row ? viewFromRow(row, report) : null;
}

/** Provenance of the analysis whose text is currently in the draft. */
export function getAppliedAnalysis(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
): AnalysisView | null {
  const report = getOwnedReportRow(db, actor, publicReportId);
  if (!report.applied_analysis_id) return null;
  const row = one<AnalysisRow>(
    db,
    "SELECT * FROM report_analyses WHERE id = ? AND report_id = ?",
    [report.applied_analysis_id, report.id],
  );
  if (!row || row.owner_id !== actor.id) return null;
  return viewFromRow(row, report);
}

/** Deterministic draft used when no model result is usable. */
function fallbackResult(report: ReportRow, code: FailureCode): AnalysisResult {
  const category: ReportCategoryId = isCategory(report.category) ? report.category : "other";
  const assistant = generateDraft({
    userDescription: report.user_description,
    category,
    areaLabel: report.area_label,
    landmark: report.landmark,
  });
  const said = cleanCitizenText(report.user_description, 500).replace(/\s+/g, " ");
  return {
    category,
    categoryConfidence: "low",
    imageQuality: {
      clarity: "limited",
      note: "AI 분석을 사용할 수 없어 사진을 분석하지 않았습니다.",
    },
    imageMatchesDescription: "unclear",
    observations: [],
    interpretations: [],
    safetyConcerns: [],
    uncertainties: [
      FAILURE_LABEL[code],
      "사진에서 확인된 내용은 정리되지 않았습니다. 초안은 시민이 쓴 설명만으로 만들었습니다.",
    ].slice(0, ANALYSIS_LIMITS.maxUncertainties),
    missingEvidence: assistant.missingEvidence
      .slice(0, ANALYSIS_LIMITS.maxMissingEvidence)
      .map((item) => item.slice(0, ANALYSIS_LIMITS.maxItemLength)),
    privacyWarnings: ["사진에 얼굴·번호판 등이 보이면 공개 전에 직접 가려 주세요."],
    nextSteps: assistant.suggestedSteps
      .slice(0, ANALYSIS_LIMITS.maxNextSteps)
      .map((item) => item.slice(0, ANALYSIS_LIMITS.maxItemLength)),
    clarificationQuestion: null,
    draft: {
      title: assistant.title.slice(0, ANALYSIS_LIMITS.maxTitleLength),
      summary: `제보자는 "${said}"라고 설명했습니다.`.slice(0, ANALYSIS_LIMITS.maxSummaryLength),
      concern: "",
      requestedAction:
        "관할 기관에서 현장을 확인하고 필요한 조치를 검토해 주시기 바랍니다.",
    },
  };
}

type PersistInput = {
  report: ReportRow;
  actor: PublicUser;
  status: "completed" | "fallback";
  mode: "live" | "mock" | "fallback";
  provider: string | null;
  model: string | null;
  externalTransfer: boolean;
  simulatedObservations: boolean;
  sourceSha256: string;
  fingerprint: string;
  result: AnalysisResult;
  userFacts: string[];
  question: string | null;
  answer: string | null;
  failureCode: FailureCode | null;
  guardrailRules: string[];
  guardrailRemoved: number;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  now: Date;
};

function persistAnalysis(db: Db, input: PersistInput): AnalysisView {
  const id = internalId("ana");
  run(
    db,
    `INSERT INTO report_analyses (
       id, report_id, owner_id, schema_version, prompt_version, status, mode,
       provider, model, external_transfer, simulated_observations, source_sha256,
       input_fingerprint, result_json, user_facts_json, clarification_question,
       clarification_answer, failure_code, guardrail_rules, guardrail_removed,
       latency_ms, input_tokens, output_tokens, applied_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      input.report.id,
      input.actor.id,
      ANALYSIS_SCHEMA_VERSION,
      PROMPT_VERSION,
      input.status,
      input.mode,
      input.provider,
      input.model,
      input.externalTransfer ? 1 : 0,
      input.simulatedObservations ? 1 : 0,
      input.sourceSha256,
      input.fingerprint,
      JSON.stringify(input.result),
      JSON.stringify(input.userFacts),
      input.question,
      input.answer,
      input.failureCode,
      JSON.stringify(input.guardrailRules),
      input.guardrailRemoved,
      input.latencyMs,
      input.inputTokens,
      input.outputTokens,
      input.now.toISOString(),
    ],
  );
  const row = one<AnalysisRow>(db, "SELECT * FROM report_analyses WHERE id = ?", [id]);
  if (!row) throw new Error("analysis insert did not return a row");
  const view = viewFromRow(row, input.report);
  if (!view) throw new Error("stored analysis did not parse");
  return view;
}

export type RequestAnalysisOptions = {
  clarificationAnswer?: string | null;
  /** Required when the selected provider sends the image off this server. */
  consent?: boolean;
  /** Explicit citizen retry: skip the identical-input cache. */
  refresh?: boolean;
  /** Injection seam for tests; `null` means "live configured but no key". */
  provider?: AnalysisProvider | null;
  now?: Date;
};

export type RequestAnalysisResult = { analysis: AnalysisView; reused: boolean };

function rateLimited(message: string): ApiError {
  return new ApiError(429, "RATE_LIMITED", message);
}

/**
 * Analyse one private draft. The caller must own it and it must still be a
 * draft: nothing after publication is rewritten by the assistant.
 */
export async function requestAnalysis(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  options: RequestAnalysisOptions = {},
): Promise<RequestAnalysisResult> {
  const report = getOwnedReportRow(db, actor, publicReportId);
  if (report.state !== "draft") {
    throw new ApiError(409, "CONFLICT", "공개되었거나 철회된 제보는 AI로 다시 정리할 수 없습니다.");
  }

  const working = getMediaByRole(db, report.id, "working");
  if (!working) throw new ApiError(409, "CONFLICT", "분석할 사진이 없습니다.");

  const provider = options.provider !== undefined ? options.provider : selectProvider();
  const now = options.now ?? new Date();
  const answer = options.clarificationAnswer
    ? cleanCitizenText(options.clarificationAnswer, ANALYSIS_LIMITS.maxClarificationAnswer)
    : "";
  const previous = latestAnalysisRow(db, report.id);
  // The question this request is answering, if any. A fallback asks none, so an
  // answer can still arrive without one; it is sent as additional context.
  const question = answer ? (previous?.clarification_question ?? null) : null;
  const citizenText = [report.user_description, answer].filter(Boolean).join("\n");

  // Everything that can change the result, including the prompt/schema version
  // and the provider identity. A prompt upgrade must not silently reuse an old
  // result produced by different instructions.
  const fingerprint = sha256(
    [
      ANALYSIS_SCHEMA_VERSION,
      PROMPT_VERSION,
      working.storage_key,
      report.category,
      report.area_id,
      report.area_label,
      report.user_description,
      answer,
      provider?.mode ?? "none",
      provider?.provider ?? "none",
      provider?.model ?? "none",
    ].join("\u0000"),
  );

  // Identical inputs (and the same provider) reuse the stored result. This is
  // what keeps a double-tap or a page retry from becoming a second paid call.
  if (!options.refresh) {
    const cached = one<AnalysisRow>(
      db,
      `SELECT * FROM report_analyses
        WHERE report_id = ? AND input_fingerprint = ? AND status = 'completed'
        ORDER BY created_at DESC LIMIT 1`,
      [report.id, fingerprint],
    );
    const view = cached ? viewFromRow(cached, report) : null;
    if (view) return { analysis: view, reused: true };
  }

  const attempts = one<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM report_analyses WHERE report_id = ?",
    [report.id],
  );
  if ((attempts?.count ?? 0) >= getAiPerReportLimit()) {
    throw rateLimited(
      `이 제보에서는 AI 분석을 ${getAiPerReportLimit()}회까지 사용할 수 있습니다. 직접 초안을 수정해 주세요.`,
    );
  }

  let sourceSha256 = sha256(working.storage_key);
  const original = getMediaByRole(db, report.id, "original");
  if (original) {
    try {
      sourceSha256 = sha256(await readMedia("private", original.storage_key));
    } catch {
      // A missing original only disables sample-fixture matching in simulation.
    }
  }

  if (!provider) {
    const result = fallbackResult(report, "missing_credentials");
    return {
      reused: false,
      analysis: persistAnalysis(db, {
        report,
        actor,
        status: "fallback",
        mode: "fallback",
        provider: null,
        model: null,
        externalTransfer: false,
        simulatedObservations: false,
        sourceSha256,
        fingerprint,
        result,
        userFacts: [report.user_description, answer].filter((value) => value.length > 0),
        question: null,
        answer: null,
        failureCode: "missing_credentials",
        guardrailRules: [],
        guardrailRemoved: 0,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        now,
      }),
    };
  }

  if (provider.external && !options.consent) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "사진을 외부 AI 서비스로 전송하려면 먼저 동의해 주세요.",
    );
  }

  if (provider.mode === "live") {
    const since = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const userCount = one<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM report_analyses
        WHERE mode = 'live' AND owner_id = ? AND created_at > ?`,
      [actor.id, since],
    );
    if ((userCount?.count ?? 0) >= getAiUserDailyLimit()) {
      throw rateLimited(
        "오늘 사용할 수 있는 AI 분석 횟수를 모두 사용했습니다. 내일 다시 시도하거나 직접 초안을 수정해 주세요.",
      );
    }
    const globalCount = one<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM report_analyses
        WHERE mode = 'live' AND created_at > ?`,
      [since],
    );
    if ((globalCount?.count ?? 0) >= getAiGlobalDailyLimit()) {
      throw rateLimited(
        "지금은 AI 분석 요청이 많아 사용할 수 없습니다. 직접 초안을 수정해 주세요.",
      );
    }
  }

  const fallback = (code: FailureCode, rules: string[] = [], removed = 0) => {
    const result = fallbackResult(report, code);
    return {
      reused: false,
      analysis: persistAnalysis(db, {
        report,
        actor,
        status: "fallback",
        mode: "fallback",
        provider: null,
        model: null,
        externalTransfer: false,
        simulatedObservations: false,
        sourceSha256,
        fingerprint: `${fingerprint}:fallback:${code}`,
        result,
        userFacts: [report.user_description, answer].filter((value) => value.length > 0),
        question: null,
        answer: null,
        failureCode: code,
        guardrailRules: rules,
        guardrailRemoved: removed,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        now,
      }),
    };
  };

  let image;
  try {
    image = await prepareModelImage(await readMedia("private", working.storage_key));
  } catch (error) {
    console.warn("[ai] image preparation failed", {
      report: report.public_id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return fallback("provider_error");
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await provider.analyze(
      {
        citizenText: report.user_description,
        clarification: answer
          ? { question: question ?? "추가 설명", answer }
          : null,
        areaLabel: report.area_label,
        categoryHint: report.category,
        image,
        uploadSha256: sourceSha256,
      },
      AbortSignal.timeout(getAiTimeoutMs()),
    );
  } catch (error) {
    const code: FailureCode =
      error instanceof ProviderError
        ? error.code
        : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "provider_error";
    // Never log citizen text, the image or a provider error body.
    console.warn("[ai] provider call failed", { report: report.public_id, code });
    return fallback(code);
  }
  const latencyMs = Date.now() - startedAt;

  const parsed = analysisResultSchema.safeParse(response.content);
  if (!parsed.success) {
    console.warn("[ai] response failed schema validation", {
      report: report.public_id,
      issues: parsed.error.issues.length,
    });
    return fallback("schema_invalid");
  }

  const checked = applyGuardrails(parsed.data, citizenText);
  if (!checked.ok) {
    console.warn("[ai] response rejected by guardrails", {
      report: report.public_id,
      rules: checked.report.rules,
    });
    return fallback("guardrail_rejected", checked.report.rules, checked.report.removedItems);
  }

  const result = checked.result;
  return {
    reused: false,
    analysis: persistAnalysis(db, {
      report,
      actor,
      status: "completed",
      mode: provider.mode,
      provider: provider.provider,
      model: response.model ?? provider.model,
      externalTransfer: provider.external,
      simulatedObservations: response.simulatedObservations,
      sourceSha256,
      fingerprint,
      result,
      userFacts: [report.user_description, answer].filter((value) => value.length > 0),
      // The next pending question, if any. When this call answered one and the
      // model asked nothing new, keep the answered question for the audit pair.
      question: result.clarificationQuestion ?? (question || null),
      answer: answer || null,
      failureCode: null,
      guardrailRules: checked.report.rules,
      guardrailRemoved: checked.report.removedItems,
      latencyMs,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      now,
    }),
  };
}

/**
 * Copy a completed analysis into the editable draft.
 *
 * Refuses to overwrite text the citizen already changed unless `overwrite` is
 * explicit, so a late-arriving model reply can never silently replace a
 * corrected sentence. Location is recomposed from the citizen's own choice.
 */
export function applyAnalysis(
  db: Db,
  actor: PublicUser,
  publicReportId: string,
  analysisId: string,
  options: { overwrite?: boolean; now?: Date } = {},
): OwnerReport {
  const report = getOwnedReportRow(db, actor, publicReportId);
  if (report.state !== "draft") {
    throw new ApiError(409, "CONFLICT", "초안 상태에서만 AI 초안을 적용할 수 있습니다.");
  }
  const row = getOwnedAnalysisRow(db, actor, report, analysisId);
  if (row.status !== "completed") {
    throw new ApiError(409, "CONFLICT", "대체 초안은 적용할 수 없습니다. 직접 초안을 수정해 주세요.");
  }
  const result = parseStoredResult(row);
  if (!result) {
    throw new ApiError(409, "CONFLICT", "저장된 분석 결과를 읽을 수 없습니다.");
  }

  // What the analyzer last wrote, if anything. Text identical to it is not a
  // citizen edit and can be replaced without a second confirmation.
  let previousText: { title: string; description: string } | null = null;
  if (report.applied_analysis_id) {
    const previous = one<AnalysisRow>(db, "SELECT * FROM report_analyses WHERE id = ?", [
      report.applied_analysis_id,
    ]);
    const previousResult = previous ? parseStoredResult(previous) : null;
    if (previousResult) {
      previousText = {
        title: previousResult.draft.title.slice(0, LIMITS.maxTitleLength),
        description: composeReportDescription({
          summary: previousResult.draft.summary,
          concern: previousResult.draft.concern,
          requestedAction: previousResult.draft.requestedAction,
          areaLabel: report.area_label,
          landmark: report.landmark,
        }),
      };
    }
  }

  const untouchedSinceApply =
    previousText !== null &&
    report.title === previousText.title &&
    report.description === previousText.description;
  const edited = report.updated_at !== report.created_at && !untouchedSinceApply;

  if (edited && !options.overwrite) {
    throw new ApiError(
      409,
      "CONFLICT",
      "이미 직접 수정한 본문이 있습니다. 덮어쓰려면 확인이 필요합니다.",
      { reason: "ALREADY_EDITED" },
    );
  }

  const now = options.now ?? new Date();
  const description = composeReportDescription({
    summary: result.draft.summary,
    concern: result.draft.concern,
    requestedAction: result.draft.requestedAction,
    areaLabel: report.area_label,
    landmark: report.landmark,
  });
  const title = result.draft.title.slice(0, LIMITS.maxTitleLength);

  run(
    db,
    `UPDATE reports
        SET title = ?, description = ?, applied_analysis_id = ?, updated_at = ?
      WHERE id = ? AND state = 'draft'`,
    [title, description, row.id, now.toISOString(), report.id],
  );
  run(db, "UPDATE report_analyses SET applied_at = ? WHERE id = ?", [
    now.toISOString(),
    row.id,
  ]);

  const updated = one<ReportRow>(db, "SELECT * FROM reports WHERE id = ?", [report.id]);
  if (!updated) throw new Error("report disappeared during analysis apply");
  return toOwnerReport(updated, getMediaByRole(db, report.id, "working"));
}

/** Count live (external, paid) calls in a window; used by health and tests. */
export function countLiveAnalysesSince(db: Db, since: Date): number {
  const row = one<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM report_analyses WHERE mode = 'live' AND created_at > ?",
    [since.toISOString()],
  );
  return row?.count ?? 0;
}
