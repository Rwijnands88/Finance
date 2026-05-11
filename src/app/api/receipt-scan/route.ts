import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReceiptScanResult = {
  amount: number | null;
  date: string | null;
  merchant: string | null;
};

const receiptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: {
      type: ["number", "null"],
      description: "The total receipt amount as a decimal number.",
    },
    date: {
      type: ["string", "null"],
      description: "The receipt date in YYYY-MM-DD format.",
    },
    merchant: {
      type: ["string", "null"],
      description: "The merchant or store name.",
    },
  },
  required: ["amount", "date", "merchant"],
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY ontbreekt op de server." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "Upload een foto van een bon." },
      { status: 400 },
    );
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Het bestand moet een afbeelding zijn." },
      { status: 400 },
    );
  }

  if (image.size > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "De afbeelding is groter dan 8 MB." },
      { status: 400 },
    );
  }

  const dataUrl = await fileToDataUrl(image);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Extraheer uit deze kassabon:",
                "- totaalbedrag als getal, zonder valuta",
                "- datum in YYYY-MM-DD formaat",
                "- winkelnaam als string",
                "Geef alleen betrouwbare waarden terug. Gebruik null als iets niet duidelijk leesbaar is.",
              ].join("\n"),
            },
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_scan",
          schema: receiptSchema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    return NextResponse.json(
      { error: readableOpenAiError(errorText) },
      { status: 502 },
    );
  }

  const payload = await response.json();
  const parsed = parseReceiptPayload(payload);

  if (!parsed.amount && !parsed.date && !parsed.merchant) {
    return NextResponse.json(
      { error: "De bon kon niet duidelijk gelezen worden." },
      { status: 422 },
    );
  }

  return NextResponse.json(parsed);
}

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

function parseReceiptPayload(payload: unknown): ReceiptScanResult {
  if (!isRecord(payload)) {
    return emptyResult();
  }

  const outputText =
    typeof payload.output_text === "string"
      ? payload.output_text
      : findOutputText(payload.output);

  if (!outputText) {
    return emptyResult();
  }

  try {
    const result = JSON.parse(outputText);

    return {
      amount: normalizeAmount(result.amount),
      date: normalizeDate(result.date),
      merchant:
        typeof result.merchant === "string" && result.merchant.trim()
          ? result.merchant.trim()
          : null,
    };
  } catch {
    return emptyResult();
  }
}

function findOutputText(output: unknown): string | null {
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function normalizeAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Number(value.toFixed(2));
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readableOpenAiError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText);
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message;
    }
  } catch {
    return "OpenAI kon de bon niet verwerken.";
  }

  return "OpenAI kon de bon niet verwerken.";
}

function emptyResult(): ReceiptScanResult {
  return { amount: null, date: null, merchant: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
