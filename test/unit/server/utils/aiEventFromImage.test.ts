import { afterEach, describe, expect, it, vi } from "vitest";

import { extractEventFromImage } from "../../../../server/utils/aiEventFromImage";

const geminiPayload = (text: string) => ({
  candidates: [
    {
      content: {
        parts: [{ text }],
      },
    },
  ],
});

const baseParams = () => ({
  imageData: Buffer.from("fake-image-bytes"),
  mimeType: "image/jpeg",
  apiKey: "test-key",
  now: new Date("2025-06-01T12:00:00Z"),
  timezone: "Australia/Brisbane",
});

describe("extractEventFromImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts a full event from a Gemini response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          geminiPayload(
            JSON.stringify({
              title: "Dentist appointment",
              description: "Routine checkup",
              location: "123 Main St",
              allDay: false,
              startDate: "2025-06-10",
              startTime: "09:00",
              endDate: "2025-06-10",
              endTime: "09:30",
            }),
          ),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractEventFromImage(baseParams());

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("models/gemini-flash-latest:generateContent");
    expect(url).toContain("key=test-key");

    expect(result).toEqual({
      title: "Dentist appointment",
      description: "Routine checkup",
      location: "123 Main St",
      allDay: false,
      startDate: "2025-06-10",
      startTime: "09:00",
      endDate: "2025-06-10",
      endTime: "09:30",
    });
  });

  it("treats a missing time as all-day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            geminiPayload(
              JSON.stringify({
                title: "Conference",
                description: "",
                location: "",
                startDate: "2025-06-10",
              }),
            ),
          ),
      }),
    );

    const result = await extractEventFromImage(baseParams());

    expect(result).toEqual({
      title: "Conference",
      description: "",
      location: "",
      allDay: true,
      startDate: "2025-06-10",
      startTime: null,
      endDate: "2025-06-10",
      endTime: null,
    });
  });

  it("normalizes invalid dates and times to fallbacks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            geminiPayload(
              JSON.stringify({
                title: "Gym",
                startDate: "not-a-date",
                startTime: "25:99",
                endDate: "not-a-date",
                endTime: "99:99",
              }),
            ),
          ),
      }),
    );

    const result = await extractEventFromImage(baseParams());

    expect(result.startDate).toBe("2025-06-01");
    expect(result.startTime).toBeNull();
    expect(result.allDay).toBe(true);
    expect(result.endDate).toBe("2025-06-01");
    expect(result.endTime).toBeNull();
  });

  it("throws when Gemini returns an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("rate limited"),
      }),
    );

    await expect(extractEventFromImage(baseParams())).rejects.toThrow(
      "Gemini API error 429",
    );
  });

  it("throws when Gemini returns invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(geminiPayload("this is not json")),
      }),
    );

    await expect(extractEventFromImage(baseParams())).rejects.toThrow(
      "Gemini returned invalid JSON",
    );
  });

  it("uses a custom model when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          geminiPayload(
            JSON.stringify({
              title: "Lunch",
              startDate: "2025-06-10",
              startTime: "12:00",
              endTime: "13:00",
            }),
          ),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    await extractEventFromImage({
      ...baseParams(),
      model: "gemini-2.0-flash",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("models/gemini-2.0-flash:generateContent");
  });
});
