import { describe, expect, it } from "vitest";

import { isPublicId, publicId } from "@/lib/ids";

describe("public ids", () => {
  it("generates prefixed ids without ambiguous characters", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = publicId("cp");
      expect(id).toMatch(/^cp_[23456789abcdefghjkmnpqrstuvwxyz]{10}$/);
      expect(id).not.toMatch(/[01loi]/);
      ids.add(id);
    }
    // Collisions at 200 draws over a 32^10 space would indicate a broken RNG.
    expect(ids.size).toBe(200);
  });

  it("validates the expected prefix and alphabet", () => {
    expect(isPublicId(publicId("cp"), "cp")).toBe(true);
    expect(isPublicId("cp_ABCdef", "cp")).toBe(false);
    expect(isPublicId("cp_", "cp")).toBe(false);
    expect(isPublicId("cp_abcdefghij", "rep")).toBe(false);
    expect(isPublicId("cp_abcdefghij'; DROP TABLE reports;--", "cp")).toBe(false);
  });
});
