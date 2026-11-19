import { describe, expect, it } from "vitest";

import {
  OFFICIAL_CHANNELS,
  channelForCategory,
  getChannel,
  toPublicChannel,
} from "@/lib/domain/channels";

const ALLOWED_HOSTS = new Set(["www.safetyreport.go.kr", "www.epeople.go.kr"]);

describe("official channel registry", () => {
  it("contains only verified https entries with a source and check date", () => {
    expect(OFFICIAL_CHANNELS.length).toBeGreaterThan(0);
    for (const channel of OFFICIAL_CHANNELS) {
      expect(channel.verified).toBe(true);
      const url = new URL(channel.url);
      expect(url.protocol).toBe("https:");
      expect(ALLOWED_HOSTS.has(url.host)).toBe(true);

      const source = new URL(channel.sourceUrl);
      expect(source.protocol).toBe("https:");
      expect(ALLOWED_HOSTS.has(source.host)).toBe(true);

      expect(channel.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${channel.asOf}T00:00:00Z`).getTime()).toBeLessThanOrEqual(
        Date.now(),
      );
      expect(channel.limitations.length).toBeGreaterThan(20);
    }
  });

  it("never exposes an email address or phone-only route", () => {
    for (const channel of OFFICIAL_CHANNELS) {
      const text = [
        channel.name,
        channel.operator,
        channel.url,
        channel.whatToExpect,
        channel.limitations,
        channel.sourceLabel,
      ].join(" ");
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text).not.toMatch(/tel:/i);
    }
  });

  it("never claims the app submits on the citizen's behalf", () => {
    for (const channel of OFFICIAL_CHANNELS) {
      expect(channel.limitations).toMatch(/직접|본인|CivicPulse/);
    }
  });

  it("returns null for an unregistered category instead of guessing", () => {
    expect(channelForCategory("not-a-real-category")).toBeNull();
    expect(channelForCategory("sidewalk")?.id).toBe("safetyreport");
    expect(channelForCategory("other")?.id).toBe("epeople");
  });

  it("looks up by id and hides internal handling metadata publicly", () => {
    expect(getChannel("safetyreport")?.name).toBe("안전신문고");
    expect(getChannel("missing")).toBeNull();
    expect(getChannel(null)).toBeNull();
    const publicView = toPublicChannel(OFFICIAL_CHANNELS[0]!);
    expect(publicView).not.toHaveProperty("handles");
    expect(publicView.name).toBe("안전신문고");
  });
});
