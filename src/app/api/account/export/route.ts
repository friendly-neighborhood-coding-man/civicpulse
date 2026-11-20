import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";
import { exportAccountData } from "@/lib/domain/account";
import { withApi } from "@/lib/http/api";

/**
 * Download the signed-in account's own data as JSON.
 *
 * Contains only rows this account owns or authored. No password hash, other
 * identities, storage keys or precise coordinates. `no-store` because the
 * response is personalised.
 */
export async function GET() {
  return withApi(async () => {
    const user = await requireUser();
    const data = exportAccountData(getDb(), user);
    const filename = `civicpulse-account-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
