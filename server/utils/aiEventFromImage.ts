import type { Buffer } from "node:buffer";

const DEFAULT_MODEL = "gemini-flash-latest";
const DEFAULT_TIMEZONE = "Australia/Brisbane";
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;

type AiEventExtraction = {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
};

type ExtractEventParams = {
  imageData: Buffer;
  mimeType: string;
  apiKey: string;
  model?: string;
  now?: Date;
  timezone?: string;
};

export async function extractEventFromImage(
  params: ExtractEventParams,
): Promise<AiEventExtraction> {
  const {
    imageData,
    mimeType,
    apiKey,
    model = DEFAULT_MODEL,
    now = new Date(),
    timezone = DEFAULT_TIMEZONE,
  } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageData.toString("base64"),
                },
              },
              { text: buildPrompt(now, timezone) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
  }
  catch (error) {
    throw new Error(`Failed to reach Gemini API: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Gemini API error ${response.status}: ${responseText.slice(0, 500)}`,
    );
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.find(
    (part: { text?: string }) => part.text,
  )?.text;
  if (!text) {
    throw new Error("Gemini returned no text content");
  }

  const raw = parseJsonObject(text);
  const today = formatDate(now, timezone);
  const startDate = normalizeDate(raw.startDate, today);
  const startTime = normalizeTime(raw.startTime);
  const allDay = typeof raw.allDay === "boolean" ? raw.allDay : startTime === null;
  const endDate = normalizeDate(raw.endDate, startDate);
  const endTime = allDay ? null : normalizeTime(raw.endTime) ?? startTime;

  return {
    title: cleanText(raw.title, MAX_TITLE_LENGTH) || "(no title)",
    description: cleanText(raw.description, MAX_TEXT_LENGTH),
    location: cleanText(raw.location, MAX_TEXT_LENGTH),
    allDay,
    startDate,
    startTime: allDay ? null : startTime,
    endDate: allDay ? startDate : endDate,
    endTime,
  };
}

function buildPrompt(now: Date, timezone: string): string {
  return [
    "You are a helpful assistant that extracts calendar event details from a photo.",
    `Today's date is ${formatDate(now, timezone)} (${weekday(now, timezone)}) in the ${timezone} timezone.`,
    `The user's calendar is in the ${timezone} timezone. Interpret any dates or times shown in the photo in this timezone.`,
    "If the photo does not specify a date, use today. If it does not specify a time, treat the event as all-day.",
    "If the event has a start time but no end time, assume a sensible duration (for example 1 hour).",
    "",
    "Respond with ONLY a JSON object, with no commentary, using exactly these keys:",
    "{ \"title\": \"string\", \"description\": \"string\", \"location\": \"string\", \"allDay\": boolean, \"startDate\": \"YYYY-MM-DD\", \"startTime\": \"HH:MM or null\", \"endDate\": \"YYYY-MM-DD\", \"endTime\": \"HH:MM or null\" }",
    "",
    "Rules:",
    "- title: a short, human-readable event title.",
    "- Dates must use YYYY-MM-DD format. Convert written dates (for example '3rd August') into YYYY-MM-DD.",
    "- Times must use 24-hour HH:MM format.",
    "- If the photo shows a date range, use startDate and endDate accordingly; otherwise endDate must equal startDate.",
    "- If the event has no start time or is all-day, set startTime and endTime to null and allDay to true.",
    "- location: venue or address if visible, otherwise an empty string.",
    "- description: a brief summary of the event details shown in the photo.",
  ].join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  }
  catch {
    throw new Error("Gemini returned invalid JSON");
  }
}

function formatDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function weekday(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(date);
}

function normalizeDate(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") {
    return fallback;
  }
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (!match) {
    return fallback;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return fallback;
  }
  return `${match[1]}-${pad2(month)}-${pad2(day)}`;
}

function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function cleanText(raw: unknown, maxLength: number): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim().slice(0, maxLength);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
