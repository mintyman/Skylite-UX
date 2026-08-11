import { createMockH3Event } from "~~/test/nuxt/mocks/h3Event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "~~/server/api/ai/eventFromImage.post";

const mocks = vi.hoisted(() => ({
  readMultipartFormData: vi.fn(),
  useRuntimeConfig: vi.fn(),
  extractEventFromImage: vi.fn(),
  createError: vi.fn(
    (options: { statusCode?: number; statusMessage?: string }) => {
      const error = new Error(options?.statusMessage) as Error & {
        statusCode?: number;
        statusMessage?: string;
      };
      error.statusCode = options?.statusCode;
      error.statusMessage = options?.statusMessage;
      return error;
    },
  ),
  defineEventHandler: vi.fn(
    (handler: (event: never) => Promise<unknown>) => handler,
  ),
}));

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    readMultipartFormData: mocks.readMultipartFormData,
    createError: mocks.createError,
    defineEventHandler: mocks.defineEventHandler,
  };
});

vi.mock("#app/nuxt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#app/nuxt")>();
  return {
    ...actual,
    useRuntimeConfig: mocks.useRuntimeConfig,
  };
});

vi.mock("~~/server/utils/aiEventFromImage", () => ({
  extractEventFromImage: mocks.extractEventFromImage,
}));

const extractedEvent = {
  title: "Dentist appointment",
  description: "Routine checkup",
  location: "123 Main St",
  allDay: false,
  startDate: "2025-06-10",
  startTime: "09:00",
  endDate: "2025-06-10",
  endTime: "09:30",
};

function makeFormPart(
  overrides: Partial<{ name: string; data: Buffer; type: string }> = {},
) {
  return {
    name: "image",
    data: Buffer.from("image-bytes"),
    type: "image/jpeg",
    ...overrides,
  };
}

describe("POST /api/ai/eventFromImage", () => {
  beforeEach(() => {
    mocks.readMultipartFormData.mockReset();
    mocks.extractEventFromImage.mockReset();
    mocks.useRuntimeConfig.mockReset();
    mocks.useRuntimeConfig.mockReturnValue({
      ai: { apiKey: "test-key", model: "gemini-flash-latest" },
    });
  });

  it("is registered as an event handler", () =>
    expect(mocks.defineEventHandler).toHaveBeenCalled());

  it("returns 500 when AI is not configured", async () => {
    mocks.useRuntimeConfig.mockReturnValue({});
    mocks.readMultipartFormData.mockResolvedValue(undefined);

    const event = createMockH3Event({ method: "POST" });

    const error = await handler(event).then(
      () => null,
      (err: { statusCode?: number; statusMessage?: string }) => err,
    );

    expect(error?.statusCode).toBe(500);
    expect(error?.statusMessage).toBe("AI is not configured on the server");
    expect(mocks.extractEventFromImage).not.toHaveBeenCalled();
  });

  it("returns 400 when no image is provided", async () => {
    mocks.readMultipartFormData.mockResolvedValue(undefined);

    const event = createMockH3Event({ method: "POST" });

    const error = await handler(event).then(
      () => null,
      (err: { statusCode?: number }) => err,
    );

    expect(error?.statusCode).toBe(400);
    expect(mocks.extractEventFromImage).not.toHaveBeenCalled();
  });

  it("returns 400 when no image field is present", async () => {
    mocks.readMultipartFormData.mockResolvedValue([
      makeFormPart({ name: "other", data: Buffer.from("nope") }),
    ]);

    const event = createMockH3Event({ method: "POST" });

    const error = await handler(event).then(
      () => null,
      (err: { statusCode?: number }) => err,
    );

    expect(error?.statusCode).toBe(400);
  });

  it("returns 413 when the image exceeds the size limit", async () => {
    mocks.readMultipartFormData.mockResolvedValue([
      makeFormPart({ data: Buffer.alloc(15 * 1024 * 1024 + 1) }),
    ]);

    const event = createMockH3Event({ method: "POST" });

    const error = await handler(event).then(
      () => null,
      (err: { statusCode?: number }) => err,
    );

    expect(error?.statusCode).toBe(413);
    expect(mocks.extractEventFromImage).not.toHaveBeenCalled();
  });

  it("extracts an event from an uploaded image", async () => {
    mocks.readMultipartFormData.mockResolvedValue([makeFormPart()]);
    mocks.extractEventFromImage.mockResolvedValue(extractedEvent);

    const event = createMockH3Event({ method: "POST" });

    const result = await handler(event);

    expect(result).toEqual({ event: extractedEvent });
    expect(mocks.extractEventFromImage).toHaveBeenCalledWith({
      imageData: expect.any(Buffer),
      mimeType: "image/jpeg",
      apiKey: "test-key",
      model: "gemini-flash-latest",
    });
  });

  it("falls back to image/jpeg for non-image mime types", async () => {
    mocks.readMultipartFormData.mockResolvedValue([
      makeFormPart({ type: "application/octet-stream" }),
    ]);
    mocks.extractEventFromImage.mockResolvedValue(extractedEvent);

    const event = createMockH3Event({ method: "POST" });

    await handler(event);

    expect(mocks.extractEventFromImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg" }),
    );
  });

  it("returns 502 when extraction fails", async () => {
    mocks.readMultipartFormData.mockResolvedValue([makeFormPart()]);
    mocks.extractEventFromImage.mockRejectedValue(new Error("Gemini down"));

    const event = createMockH3Event({ method: "POST" });

    const error = await handler(event).then(
      () => null,
      (err: { statusCode?: number; statusMessage?: string }) => err,
    );

    expect(error?.statusCode).toBe(502);
    expect(error?.statusMessage).toContain("Gemini down");
  });
});
