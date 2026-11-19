import { requireUser } from "@/lib/auth/session";
import { LIMITS } from "@/lib/config";
import { getDb } from "@/lib/db/connection";
import { findArea } from "@/lib/domain/areas";
import { toPublicChannel, getChannel } from "@/lib/domain/channels";
import {
  createDraftReport,
  getWorkingMedia,
  listOwnerReports,
  toOwnerReport,
} from "@/lib/domain/reports";
import {
  assertSameOrigin,
  jsonOk,
  readFormData,
  withApi,
} from "@/lib/http/api";
import { badRequest } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { generateDraft } from "@/lib/services/assistant";
import { processUpload } from "@/lib/services/image";
import { createReportSchema } from "@/lib/validation/report";

export async function GET() {
  return withApi(async () => {
    const user = await requireUser();
    const db = getDb();
    return jsonOk({ reports: listOwnerReports(db, user) });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    // Abuse guard, not a UX limit: a person cannot realistically create 20
    // drafts in ten minutes, while automated spam is still bounded.
    enforceRateLimit(`reports:create:${user.id}`, {
      limit: 20,
      windowMs: 10 * 60_000,
      message: "제보 초안은 잠시 후 다시 만들 수 있습니다.",
    });

    const form = await readFormData(request, LIMITS.uploadMaxBytes + 1024 * 1024);
    const input = createReportSchema.parse({
      description: String(form.get("description") ?? ""),
      category: String(form.get("category") ?? ""),
      areaId: String(form.get("areaId") ?? ""),
      landmark: String(form.get("landmark") ?? ""),
    });

    const area = findArea(input.areaId);
    if (!area) throw badRequest("알 수 없는 위치 구역입니다.");

    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      throw badRequest("사진을 첨부해 주세요.");
    }

    // Validate/decode the real image bytes before anything is stored.
    const image = await processUpload(photo);
    const draft = generateDraft({
      userDescription: input.description,
      category: input.category,
      areaLabel: area.label,
      landmark: input.landmark,
    });

    const db = getDb();
    const row = await createDraftReport(db, { actor: user, input, draft, image });
    const channel = getChannel(row.channel_id);

    return jsonOk(
      {
        report: toOwnerReport(row, getWorkingMedia(db, row)),
        channel: channel ? toPublicChannel(channel) : null,
        // Explicit: nothing is published or submitted by this endpoint.
        published: false,
        submitted: false,
      },
      { status: 201 },
    );
  });
}
