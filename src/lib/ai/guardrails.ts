import { scanText } from "../privacy/text.ts";
import type { AnalysisResult, GuardrailReport } from "./schema.ts";

/**
 * Deterministic content rules applied to every validated model response.
 *
 * The JSON schema guarantees shape, not truth. These rules catch the specific
 * failures this product must never show as if they were facts:
 *   - links, contact details and exact addresses the model could have invented,
 *   - named agencies or departments (routing comes only from the verified
 *     registry in `channels.ts`),
 *   - legal conclusions and claims that something was filed or fixed,
 *   - measurements, durations, incidents or prior reports the citizen never
 *     stated,
 *   - unqualified certainty.
 *
 * Policy: an offending list item is dropped (and counted); an offending draft
 * field rejects the whole analysis, because the draft is what a citizen would
 * copy into an official portal. The offending text itself is never logged or
 * stored in the report, only the rule id.
 *
 * Limitation: this is a pattern matcher. It reduces, but cannot eliminate,
 * fabricated or overconfident text, which is why the UI keeps every AI sentence
 * editable and labelled.
 */

export type GuardrailRule =
  | "url"
  | "contact"
  | "plate"
  | "address"
  | "agency"
  | "legal"
  | "government_action"
  | "prior_report"
  | "incident"
  | "measurement"
  | "certainty"
  | "unhedged_interpretation";

const URL = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:go\.kr|or\.kr|co\.kr|kr|com|net|org|io)\b)/i;

// Road-name addresses ("망원로 12", "성미산로3길 7"), lot numbers and floors.
// The number is consumed atomically ((?![\d-])) so a counted noun such as
// "앞으로 1년" or "도로 2곳" is not read as an address.
const ADDRESS =
  /(?:[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?(?![\d-])(?!\s?(?:개|명|분|초|곳|년|개월|시간|일|주|차|번|회|가지|cm|mm|m|%))|\d+\s?번지|\d+\s?층(?![가-힣]))/;

const AGENCY =
  /(?:[가-힣]{0,8}(?:구청|시청|군청|도청|주민센터|행정복지센터|경찰서|지구대|파출소|소방서|사업소|도로관리|시설관리공단|공단)|국토교통부|행정안전부|환경부|국민권익위원회|한국전력|한전|(?:도로|건설|청소|환경|교통|안전)과(?=\s|에|로|$)|민원실|담당자|담당\s?부서|콜센터|다산콜|(?<!\d)1(?:10|12|19|20|28)(?!\d))/;

const LEGAL =
  /(?:제\s?\d+\s?조|조례|시행령|시행규칙|법률|법령|도로법|위법|법\s?위반|불법(?!\s?(?:광고물|현수막))|과태료|벌금|처벌|고발|법적\s?(?:책임|의무|근거|조치)|손해\s?배상|소송|의무\s?위반)/;

const GOVERNMENT_ACTION =
  /(?:접수\s?(?:되었|됐|완료|했|하였)|신고\s?(?:되었|됐|완료)|제출\s?(?:되었|됐|완료|했|하였)|처리\s?(?:되었|됐|완료|중입니다)|조치\s?(?:되었|됐|완료|중입니다)|수리\s?(?:되었|됐|완료)|보수\s?(?:되었|됐|완료)|답변\s?(?:을\s?)?(?:받았|왔))/;

const PRIOR_REPORT = /(?:이전에|이미|여러\s?(?:차례|번)|반복적으로|수차례)\s?(?:신고|민원|제보|요청)/;

const INCIDENT = /(사고|부상|다쳤|다친|넘어졌|넘어진|낙상|골절|사망|피해를\s?입)/;

const MEASUREMENT =
  /(\d+(?:[.,]\d+)?)\s?(?:cm|mm|km|m(?![a-z])|㎝|㎜|센티미터|센티|미터|밀리|킬로|개월|년|주일|주째|일째|일\s?동안|시간|%|퍼센트)/gi;

const CERTAINTY = /(?:확실히|틀림없이|명백히|분명히|명백한|틀림없는|100\s?%\s?(?:확실|위험))/;

const HEDGE = /(?:가능성|보입니다|보임|보이는|추정|것\s?같|수\s?있|듯|로\s?보|의심|짐작|추측)/;

// A sentence that explicitly says something is unknown is allowed to mention it.
const NEGATED = /(?:여부|확인되지|확인할\s?수\s?없|알\s?수\s?없|판단할\s?수\s?없|단정할\s?수\s?없|않았|않습니다|않음|없습니다|모릅니다|불분명|미확인|아닙니다)/;

const QUALIFIED = /(?:수\s?있|가능성|우려|위험이\s?있|염려|여부|확인되지|않았|없습니다)/;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?。])\s+|\n+/).filter((part) => part.trim().length > 0);
}

/**
 * True when a sentence matches `pattern`, is not itself negated, and the matched
 * words were not the citizen's own (attributing "제보자는 구청에 … 라고
 * 설명했습니다" is restating, not inventing).
 *
 * The negation check looks only at the words immediately around the match. A
 * whole-sentence check was wrong: "이미 접수되었으므로 추가 조치는 없습니다"
 * would be exempted by the final 없습니다 even though it claims a positive
 * government action.
 */
function sentenceViolates(text: string, pattern: RegExp, userText: string): boolean {
  return sentences(text).some((sentence) => {
    const match = sentence.match(pattern);
    if (!match || match.index === undefined) return false;
    if (userText.includes(match[0])) return false;
    const end = match.index + match[0].length;
    const around = `${sentence.slice(Math.max(0, match.index - 8), match.index)} ${sentence.slice(end, end + 14)}`;
    return !NEGATED.test(around);
  });
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
}

type Context = { userText: string; userNumbers: Set<string> };

type FieldKind =
  | "observation"
  | "interpretation"
  | "concern"
  | "uncertainty"
  | "evidence"
  | "privacy"
  | "step"
  | "question"
  | "note"
  | "draft";

/** Return the first rule a string breaks, or null. */
export function checkText(text: string, kind: FieldKind, context: Context): GuardrailRule | null {
  if (URL.test(text)) return "url";
  const findings = scanText("description", text);
  if (findings.some((f) => f.kind === "email" || f.kind === "phone" || f.kind === "resident_id")) {
    return "contact";
  }
  if (findings.some((f) => f.kind === "plate")) return "plate";
  if (findings.some((f) => f.kind === "unit_address") || ADDRESS.test(text)) return "address";
  const agency = text.match(AGENCY);
  if (agency && !context.userText.includes(agency[0])) return "agency";
  if (sentenceViolates(text, LEGAL, context.userText)) return "legal";
  if (sentenceViolates(text, GOVERNMENT_ACTION, context.userText)) return "government_action";

  for (const match of text.matchAll(MEASUREMENT)) {
    const value = match[1]!.replace(",", ".");
    if (!context.userNumbers.has(value)) return "measurement";
  }

  // Unknowns, evidence requests and privacy prompts may name an incident or a
  // prior report ("사고 발생 여부는 확인되지 않았습니다"); statements may not.
  const statement =
    kind === "observation" ||
    kind === "interpretation" ||
    kind === "concern" ||
    kind === "draft";
  if (statement) {
    for (const sentence of sentences(text)) {
      if (PRIOR_REPORT.test(sentence) && !NEGATED.test(sentence) && !PRIOR_REPORT.test(context.userText)) {
        return "prior_report";
      }
      const incident = sentence.match(INCIDENT);
      if (
        incident &&
        !QUALIFIED.test(sentence) &&
        !NEGATED.test(sentence) &&
        !context.userText.includes(incident[1]!)
      ) {
        return "incident";
      }
    }
    if (CERTAINTY.test(text)) return "certainty";
  }
  if (kind === "interpretation" && !HEDGE.test(text)) return "unhedged_interpretation";
  return null;
}

export type GuardrailOutcome =
  | { ok: true; result: AnalysisResult; report: GuardrailReport }
  | { ok: false; report: GuardrailReport };

/**
 * @param userText everything the citizen supplied (description + answer). Facts
 *   the citizen stated themselves (a measurement, an injury) may be restated.
 */
export function applyGuardrails(result: AnalysisResult, userText: string): GuardrailOutcome {
  const context: Context = { userText, userNumbers: numbersIn(userText) };
  const rules = new Set<GuardrailRule>();
  let removedItems = 0;

  const filter = (items: string[], kind: FieldKind): string[] =>
    items.filter((value) => {
      const rule = checkText(value, kind, context);
      if (!rule) return true;
      rules.add(rule);
      removedItems += 1;
      return false;
    });

  const draftRules = (
    [
      ["title", result.draft.title],
      ["summary", result.draft.summary],
      ["concern", result.draft.concern],
      ["requestedAction", result.draft.requestedAction],
    ] as const
  )
    .map(([, value]) => (value ? checkText(value, "draft", context) : null))
    .filter((rule): rule is GuardrailRule => rule !== null);

  if (draftRules.length > 0) {
    for (const rule of draftRules) rules.add(rule);
    return { ok: false, report: { removedItems, rules: [...rules].sort() } };
  }

  let question = result.clarificationQuestion;
  if (question) {
    const rule = checkText(question, "question", context);
    if (rule) {
      rules.add(rule);
      removedItems += 1;
      question = null;
    }
  }

  let note = result.imageQuality.note;
  if (note) {
    const rule = checkText(note, "note", context);
    if (rule) {
      rules.add(rule);
      removedItems += 1;
      note = "";
    }
  }

  const cleaned: AnalysisResult = {
    ...result,
    imageQuality: { ...result.imageQuality, note },
    observations: filter(result.observations, "observation"),
    interpretations: filter(result.interpretations, "interpretation"),
    safetyConcerns: filter(result.safetyConcerns, "concern"),
    uncertainties: filter(result.uncertainties, "uncertainty"),
    missingEvidence: filter(result.missingEvidence, "evidence"),
    privacyWarnings: filter(result.privacyWarnings, "privacy"),
    nextSteps: filter(result.nextSteps, "step"),
    clarificationQuestion: question,
  };

  return { ok: true, result: cleaned, report: { removedItems, rules: [...rules].sort() } };
}
