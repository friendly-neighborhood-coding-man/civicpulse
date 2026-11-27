/**
 * Categories describe the *kind of issue*, not a legal classification.
 * Ids are stable because they are stored in SQLite and used in API payloads.
 */
export const REPORT_CATEGORIES = [
  { id: "sidewalk", label: "보도·도로 파손", description: "갈라진 보도, 꺼진 맨홀, 파인 도로" },
  { id: "streetlight", label: "가로등·시설 고장", description: "꺼진 가로등, 고장 난 시설물" },
  { id: "waste", label: "쓰레기·폐기물", description: "무단 투기, 방치된 폐기물" },
  { id: "water", label: "누수·배수 문제", description: "도로 누수, 막힌 배수로" },
  { id: "signage", label: "불법 광고물", description: "불법 현수막, 부착 광고" },
  { id: "accessibility", label: "보행 장애물·접근성", description: "통행을 막는 적치물, 휠체어·유모차 통행 방해" },
  { id: "other", label: "기타 생활 불편", description: "위 항목에 해당하지 않는 문제" },
] as const;

/** Stable tuple used for validation and storage. Never reorder without a migration. */
export const REPORT_CATEGORY_IDS = [
  "sidewalk",
  "streetlight",
  "waste",
  "water",
  "signage",
  "other",
  // Appended (stage 12): ids are stored, so new ones go at the end.
  "accessibility",
] as const;

export type ReportCategoryId = (typeof REPORT_CATEGORY_IDS)[number];

export function categoryLabel(id: string): string {
  return REPORT_CATEGORIES.find((category) => category.id === id)?.label ?? "기타";
}

/**
 * Curated demo areas. Coordinates are approximate administrative-district
 * centres used only to place a report at district level; they are NOT precise
 * addresses and are labelled as approximate in the UI.
 *
 * `publicLat/publicLng` are rounded to 2 decimals (~1.1 km) on purpose.
 */
export type DemoArea = {
  id: string;
  city: string;
  district: string;
  label: string;
  lat: number;
  lng: number;
};

export const DEMO_AREAS: DemoArea[] = [
  { id: "seoul-mapo", city: "서울특별시", district: "마포구", label: "서울 마포구", lat: 37.5663, lng: 126.9019 },
  { id: "seoul-seongdong", city: "서울특별시", district: "성동구", label: "서울 성동구", lat: 37.5634, lng: 127.0369 },
  { id: "seoul-gwanak", city: "서울특별시", district: "관악구", label: "서울 관악구", lat: 37.4784, lng: 126.9516 },
  { id: "busan-haeundae", city: "부산광역시", district: "해운대구", label: "부산 해운대구", lat: 35.1631, lng: 129.1636 },
  { id: "daejeon-yuseong", city: "대전광역시", district: "유성구", label: "대전 유성구", lat: 36.3622, lng: 127.3564 },
];

export function findArea(id: string): DemoArea | undefined {
  return DEMO_AREAS.find((area) => area.id === id);
}

/** Round to ~1.1 km so a public view never reveals a precise location. */
export function approximateCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
