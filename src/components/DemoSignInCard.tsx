import Link from "next/link";

import { getAuthMode } from "@/lib/auth/mode";
import { getDb } from "@/lib/db/connection";
import { listDemoUsers } from "@/lib/domain/users";

import IdentitySwitcher from "./IdentitySwitcher";

type Props = { heading: string; body?: string };

/**
 * Shown when a page needs an acting identity.
 *
 * In demo mode it renders the fixed synthetic switcher and says it is not
 * authentication. In password mode it renders a login link only: listing
 * accounts there would disclose the directory and imply that selecting an
 * identity is authentication.
 */
export default function DemoSignInCard({ heading, body }: Props) {
  if (getAuthMode() !== "demo") {
    return (
      <div className="card mx-auto max-w-xl p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-ink">{heading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          이 배포는 운영자가 발급한 이메일과 비밀번호 계정을 사용합니다. 계정
          목록이나 사용자 전환은 제공하지 않습니다.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white"
        >
          로그인
        </Link>
      </div>
    );
  }

  const users = listDemoUsers(getDb());
  return (
    <div className="card mx-auto max-w-xl p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-ink">{heading}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {body ??
          "이 프로토타입은 비밀번호 없는 데모 세션을 사용합니다. 실제 인증 수단이 아니며, 합성 데이터에만 사용됩니다."}
      </p>
      <div className="mt-5">
        <IdentitySwitcher users={users} currentUser={null} variant="panel" />
      </div>
    </div>
  );
}
