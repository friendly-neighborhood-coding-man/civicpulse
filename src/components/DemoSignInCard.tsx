import { getDb } from "@/lib/db/connection";
import { listUsers } from "@/lib/domain/users";

import IdentitySwitcher from "./IdentitySwitcher";

type Props = { heading: string; body?: string };

/**
 * Shown when a page needs an acting identity. There is no password flow in this
 * prototype: the card says so instead of implying real authentication.
 */
export default function DemoSignInCard({ heading, body }: Props) {
  const users = listUsers(getDb());
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
