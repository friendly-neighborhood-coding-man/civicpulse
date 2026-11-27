import { categoryLabel, type ReportCategoryId } from "../../domain/areas.ts";
import { cleanCitizenText } from "../prompt.ts";
import { ANALYSIS_LIMITS, type AnalysisResult } from "../schema.ts";
import { ProviderError, type AnalysisProvider, type ProviderRequest, type ProviderResponse } from "./types.ts";

/**
 * Offline simulation provider (`CIVICPULSE_AI_MODE` unset or `mock`).
 *
 * It never sends anything anywhere and it does not look at pixels. For the three
 * synthetic sample photos shipped in `public/samples/`, it returns observations a
 * human wrote by looking at those illustrations; the uploaded bytes are matched
 * by SHA-256, so any other photo gets *no* visual observations at all and an
 * explicit "not analysed" uncertainty. Every result is stored with
 * `mode = 'mock'` and the UI labels it as a simulation.
 *
 * The clarification rule is deliberately simple and deterministic: one optional
 * question when the description is very short and none has been answered yet.
 */

type Fixture = {
  category: ReportCategoryId;
  quality: AnalysisResult["imageQuality"];
  observations: string[];
  interpretations: string[];
  safetyConcerns: string[];
  missingEvidence: string[];
  privacyWarnings: string[];
  sceneSummary: string;
  concern: string;
  requestedAction: string;
  title: string;
};

/** SHA-256 of public/samples/*.jpg. A changed sample simply stops matching. */
export const SAMPLE_FIXTURES: Record<string, Fixture> = {
  // public/samples/sidewalk.jpg
  "61ed2259440407122b13a4101947197a8b3ab8c8e69f4638b96166d7b7fdd05b": {
    category: "sidewalk",
    quality: { clarity: "clear", note: "보도 표면이 정면에서 밝게 보입니다." },
    observations: [
      "격자 모양 줄눈이 있는 보도 포장면이 보입니다.",
      "왼쪽 아래 포장면에 어두운 색의 갈라진 형태가 보입니다.",
      "그 옆에 주변과 색이 다른 밝은 판과 회색 판이 놓여 있습니다.",
      "오른쪽에 주황색 말뚝(볼라드) 하나가 서 있습니다.",
    ],
    interpretations: [
      "보도블록이 깨지거나 들뜬 부분일 가능성이 있습니다.",
      "색이 다른 판은 임시로 덮어 둔 보수 자재일 수 있습니다.",
    ],
    safetyConcerns: ["보행자가 걸려 넘어지거나 유모차·휠체어 바퀴가 걸릴 우려가 있습니다."],
    missingEvidence: [
      "파손 부위를 가까이에서 찍은 사진",
      "주변 건물이나 표지판이 함께 보이는 위치 확인용 사진",
    ],
    privacyWarnings: [],
    sceneSummary: "사진에는 보도 포장면 일부가 갈라지고 색이 다른 판이 놓여 있는 모습이 보입니다.",
    concern: "보행 중 걸려 넘어질 우려가 있어 보입니다. 실제 사고 발생 여부는 확인되지 않았습니다.",
    requestedAction: "관할 기관에서 현장을 확인하고, 필요하면 파손된 보도블록을 보수해 주시기 바랍니다.",
    title: "보도블록 파손 의심 구간 점검 요청",
  },
  // public/samples/streetlight.jpg
  e6692d907244fcc25f476eea3e6e4b11442d1157f6260bbaac93a4659d37058d: {
    category: "streetlight",
    quality: { clarity: "limited", note: "야간 장면이라 등기구 상태를 자세히 보기 어렵습니다." },
    observations: [
      "어두운 하늘 아래 건물들 사이에 가로등 한 개가 서 있습니다.",
      "가로등 머리 부분이 주변보다 어둡게 보이고, 희미한 빛 번짐만 보입니다.",
      "건물 창문 몇 곳에는 불이 켜져 있습니다.",
    ],
    interpretations: ["가로등이 꺼져 있거나 밝기가 약한 상태일 가능성이 있습니다."],
    safetyConcerns: ["밤에 보행로가 어두워 통행이 불편할 수 있습니다."],
    missingEvidence: [
      "같은 장소를 다른 날 밤에 다시 찍은 사진",
      "가로등 기둥에 붙은 관리 번호(있는 경우)",
    ],
    privacyWarnings: ["건물 창문 안쪽이 보이지 않는지 공개 전에 확인해 주세요."],
    sceneSummary: "사진에는 야간에 가로등의 등기구 부분이 어둡게 보이는 모습이 담겨 있습니다.",
    concern: "야간 보행 시 시야가 좁아질 우려가 있습니다.",
    requestedAction: "관할 기관에서 가로등 작동 상태를 점검하고, 고장이라면 수리해 주시기 바랍니다.",
    title: "가로등 소등 의심 점검 요청",
  },
  // public/samples/waste.jpg
  "38bf702efbf503928d177111a39e8de69c2e91a8b051aa7b8946c06193c49b7f": {
    category: "waste",
    quality: { clarity: "clear", note: "쓰레기 더미와 수거함이 함께 보입니다." },
    observations: [
      "초록색 수거함 옆 바닥에 흰색·회색 봉투 여러 개가 놓여 있습니다.",
      "봉투 주변에 갈색 상자 조각 두 개가 흩어져 있습니다.",
      "봉투들은 수거함 안이 아니라 바깥 바닥에 있습니다.",
    ],
    interpretations: ["배출 장소 밖에 쓰레기가 놓인 무단 투기일 가능성이 있습니다."],
    safetyConcerns: ["통행에 방해가 되거나 악취·위생 문제가 생길 수 있습니다."],
    missingEvidence: [
      "같은 장소에 쓰레기가 계속 쌓이는지 확인할 수 있는 다른 날의 사진",
      "배출 요일·장소 안내문이 있다면 그 사진",
    ],
    privacyWarnings: ["봉투에 이름·주소가 적힌 우편물이 보이면 가려 주세요."],
    sceneSummary: "사진에는 수거함 바깥 바닥에 봉투와 상자 조각이 놓여 있는 모습이 보입니다.",
    concern: "방치될 경우 통행 불편이나 위생 문제가 생길 우려가 있습니다.",
    requestedAction: "관할 기관에서 현장을 확인하고 수거 및 배출 안내를 검토해 주시기 바랍니다.",
    title: "수거함 주변 쓰레기 방치 확인 요청",
  },
};

const QUESTION: Record<ReportCategoryId, string> = {
  sidewalk: "문제가 있는 부분이 사람들이 주로 걷는 길 한가운데에 있나요, 가장자리에 있나요?",
  streetlight: "가로등이 계속 꺼져 있나요, 아니면 깜빡이거나 가끔 꺼지나요?",
  waste: "쓰레기가 처음 보인 뒤로 계속 그 자리에 있나요?",
  water: "물이 계속 새고 있나요, 비가 온 뒤에만 고이나요?",
  signage: "광고물이 어디에 붙어 있나요(전봇대, 벽, 가로수 등)?",
  accessibility: "막힌 부분 때문에 휠체어나 유모차가 지나갈 수 없나요?",
  other: "어떤 점이 가장 불편하거나 위험한지 한 가지만 더 알려 주세요.",
};

const SHORT_DESCRIPTION = 30;

function quote(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export class SimulationProvider implements AnalysisProvider {
  readonly mode = "mock" as const;
  readonly provider = "civicpulse-simulation";
  readonly model = "fixture-v1";
  readonly external = false;

  async analyze(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    if (signal?.aborted) throw new ProviderError("timeout", "aborted before simulation");
    const citizen = cleanCitizenText(request.citizenText, ANALYSIS_LIMITS.maxCitizenText);
    const answer = request.clarification?.answer ?? null;
    const fixture = SAMPLE_FIXTURES[request.uploadSha256];
    const hint = request.categoryHint as ReportCategoryId;
    const category = fixture?.category ?? hint;

    const said = `제보자는 "${quote(citizen.replace(/\s+/g, " "))}"라고 설명했습니다.`;
    const added = answer ? ` 추가 설명: "${quote(answer.replace(/\s+/g, " "))}".` : "";

    const uncertainties = [
      "실제 사고나 피해가 있었는지는 확인되지 않았습니다.",
      "문제가 언제부터 있었는지는 사진만으로 알 수 없습니다.",
      "정확한 위치는 구역 단위로만 기록되어 있습니다.",
    ];
    if (!fixture) {
      uncertainties.unshift(
        "시뮬레이션 모드라 사진 내용은 분석하지 않았습니다. 사진은 서버 밖으로 전송되지 않았습니다.",
      );
    } else if (fixture.category !== hint) {
      uncertainties.unshift(
        `선택한 유형(${categoryLabel(hint)})과 사진에서 보이는 유형(${categoryLabel(fixture.category)})이 다를 수 있습니다.`,
      );
    }

    const result: AnalysisResult = {
      category,
      categoryConfidence: fixture ? "medium" : "low",
      imageQuality: fixture?.quality ?? {
        clarity: "limited",
        note: "시뮬레이션 모드에서는 사진을 분석하지 않습니다.",
      },
      imageMatchesDescription: fixture
        ? fixture.category === hint
          ? "consistent"
          : "unclear"
        : "unclear",
      observations: fixture?.observations ?? [],
      interpretations: fixture?.interpretations ?? [],
      safetyConcerns: fixture?.safetyConcerns ?? [],
      uncertainties: uncertainties.slice(0, ANALYSIS_LIMITS.maxUncertainties),
      missingEvidence: fixture?.missingEvidence ?? [
        "문제를 가까이에서 찍은 사진",
        "위치를 알 수 있는 주변 사진",
      ],
      privacyWarnings: fixture?.privacyWarnings ?? [],
      nextSteps: [
        "사진에 얼굴·번호판·이름이 보이면 공개 전에 가려 주세요.",
        "초안 문장이 실제 상황과 다르면 직접 고쳐 주세요.",
      ],
      clarificationQuestion:
        !request.clarification && citizen.length < SHORT_DESCRIPTION ? QUESTION[category] : null,
      draft: {
        title: (fixture?.title ?? `${categoryLabel(category)} 확인 요청`).slice(
          0,
          ANALYSIS_LIMITS.maxTitleLength,
        ),
        summary: `${fixture ? `${fixture.sceneSummary} ` : ""}${said}${added}`.slice(
          0,
          ANALYSIS_LIMITS.maxSummaryLength,
        ),
        concern: fixture?.concern ?? "",
        requestedAction:
          fixture?.requestedAction ??
          "관할 기관에서 현장을 확인하고 필요한 조치를 검토해 주시기 바랍니다.",
      },
    };

    return {
      content: result,
      model: this.model,
      usage: { inputTokens: null, outputTokens: null },
      simulatedObservations: Boolean(fixture),
    };
  }
}
