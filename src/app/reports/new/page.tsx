import Link from "next/link";

import DemoSignInCard from "@/components/DemoSignInCard";
import NewReportForm from "@/components/NewReportForm";
import { describeAiConfig } from "@/lib/ai/config";
import { getSessionUser } from "@/lib/auth/session";
import { DEMO_AREAS, REPORT_CATEGORIES } from "@/lib/domain/areas";

export const dynamic = "force-dynamic";

export const metadata = { title: "새 제보" };

export default async function NewReportPage() {
  const user = await getSessionUser();

  return (
    <div className="container-page py-10 sm:py-14">
      <nav className="text-xs text-muted">
        <Link href="/" className="hover:text-ink">
          홈
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink-soft">새 제보</span>
      </nav>

      <header className="mt-5 max-w-2xl">
        <p className="label-caps text-accent">1단계 · 기록</p>
        <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
          사진 한 장으로 초안을 만듭니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
          사진과 구역, 짧은 설명을 넣으면 편집 가능한 비공개 초안이 만들어집니다.
          아직 공개되지 않으며, 공식 창구로 자동 전송되는 일도 없습니다.
        </p>
      </header>

      <div className="mt-8">
        {user ? (
          <NewReportForm
            areas={DEMO_AREAS.map((area) => ({ id: area.id, label: area.label }))}
            categories={REPORT_CATEGORIES}
            ai={describeAiConfig()}
          />
        ) : (
          <DemoSignInCard heading="제보를 만들려면 로그인하세요" />
        )}
      </div>
    </div>
  );
}
