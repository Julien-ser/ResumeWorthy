"use server";
import { supabase } from "@/lib/supabase";
import { assertCanSubmitApplication, recordApplicationUsage } from "./usage-limits";
import PDFParser from "pdf2json";
import OpenAI from "openai";

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const MAX_RESUME_TEXT_CHARS = 16000;
const MODEL_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: any) {
  return error?.status ?? error?.code ?? error?.response?.status;
}

function getRetryAfterMs(error: any) {
  const raw =
    error?.headers?.get?.("retry-after") ??
    error?.response?.headers?.get?.("retry-after") ??
    error?.response?.headers?.["retry-after"];

  if (!raw) return null;
  const retrySeconds = Number(raw);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return retrySeconds * 1000;
  }
  return null;
}

function isRetryableProviderError(error: any) {
  const status = getErrorStatus(error);
  return status === 429 || (typeof status === "number" && status >= 500);
}

function normalizeResumeText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_RESUME_TEXT_CHARS);
}

function sanitizeText(text: string) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeBlocks(blocks: any[]) {
  return blocks
    .filter((block) => block && typeof block === "object")
    .map((block) => {
      const safeType = ["experience", "education", "project", "skill", "summary"].includes(block.type)
        ? block.type
        : "summary";

      const safeBullets = Array.isArray(block?.content?.description_bullets)
        ? block.content.description_bullets
            .map((bullet: any) => sanitizeText(String(bullet ?? "")))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      return {
        type: safeType,
        content: {
          title: sanitizeText(String(block?.content?.title ?? "Resume Block")),
          company: sanitizeText(String(block?.content?.company ?? "")),
          description_bullets: safeBullets,
        },
        tags: Array.isArray(block?.tags)
          ? block.tags.map((tag: any) => sanitizeText(String(tag ?? ""))).filter(Boolean).slice(0, 12)
          : ["resume"],
      };
    });
}

function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing API key: set DEEPSEEK_API_KEY in your .env file.");
  }

  return new OpenAI({
    baseURL: "https://api.deepseek.com/v1",
    apiKey,
  });
}

export async function ingestResume(formData: FormData, userId: string) {
  const openai = getDeepSeekClient();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file uploaded");

  try {
    await assertCanSubmitApplication(userId);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extract Text (Using our stable loop)
    const rawText = await new Promise<string>((resolve, reject) => {
      const pdfParser = new PDFParser();
      pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        let extractedText = "";
        pdfData.Pages.forEach((page: any) => {
          page.Texts.forEach((textObj: any) => {
            let text = textObj.R[0].T;
            try { text = decodeURIComponent(text); } catch { text = unescape(text); }
            extractedText += text + " ";
          });
        });
        resolve(extractedText);
      });
      pdfParser.parseBuffer(buffer);
    });

    // 2. AI Shredding via DeepSeek API
    const normalizedText = normalizeResumeText(rawText);
    let completion: any = null;
    let lastModelError: any = null;
    const modelErrors: string[] = [];

    for (let attempt = 1; attempt <= MODEL_RETRIES; attempt++) {
      try {
        const requestBody: any = {
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content: `You are a lossless data extraction engine. Your goal is to convert a resume into a list of structured blocks.

            RULES:
            1. DO NOT omit any information. Every job, school, project, and skill must be its own block.
            2. Support these types: 'experience', 'education', 'project', 'skill', 'summary'.
            3. Use this schema for EVERY block:
                {"type": "string", "content": {"title": "string", "company": "string (or school/org)", "description_bullets": ["string"]}, "tags": ["string"]}
            4. For 'skills', group them into a single block or multiple blocks by category.
            5. Return ONLY valid JSON in this exact object shape: {"blocks": [...]}.
            6. Do not include markdown or explanation text.`,
            },
            {
              role: "user",
              content: `Shred this resume text completely. Leave nothing behind:

            ${normalizedText}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 3200,
        };

        completion = await openai.chat.completions.create(requestBody);
        break;
      } catch (error: any) {
        lastModelError = error;
        const status = getErrorStatus(error);
        modelErrors.push(
          `${DEEPSEEK_MODEL} (try ${attempt}/${MODEL_RETRIES}, status ${status ?? "unknown"}): ${error?.message || "Unknown provider error"}`
        );

        if (attempt < MODEL_RETRIES && isRetryableProviderError(error)) {
          const retryAfterMs = getRetryAfterMs(error);
          const jitterMs = Math.floor(Math.random() * 500);
          const backoffMs = retryAfterMs ?? 1200 * attempt + jitterMs;
          await sleep(backoffMs);
          continue;
        }
      }
    }

    let blocks: any[] = [];

    if (!completion) {
      throw new Error(
        `DeepSeek model is currently unavailable or rate-limited. ${lastModelError?.message || "Unknown error"}. Attempts: ${modelErrors.join(" | ")}`
      );
    } else {
      const aiResponse = completion.choices[0].message.content || "[]";

      try {
        blocks = parseBlocksFromModelResponse(aiResponse);
      } catch (e) {
        console.error("AI JSON Parse Error:", aiResponse);
        throw new Error("Model responded with invalid JSON. Please retry.");
      }
    }

    // 3. Attach User ID and Insert
    const sanitized = sanitizeBlocks(blocks);
    const ensuredBlocks = sanitized.length > 0 ? sanitized : [];
    if (ensuredBlocks.length === 0) {
      throw new Error("No valid blocks were returned by the model.");
    }
    const finalBlocks = ensuredBlocks.map((b: any) => ({ ...b, user_id: userId }));

    const { error: dbError } = await supabase.from("blocks").insert(finalBlocks);

    if (dbError) throw dbError;

    await recordApplicationUsage(userId);

    return { success: true };

  } catch (error: any) {
    console.error("SHREDDER ERROR:", error);
    throw new Error(`Process failed: ${error.message}`);
  }
}

function parseBlocksFromModelResponse(rawResponse: string) {
  const cleaned = rawResponse.replace(/```json|```/g, "").trim();

  const tryParse = (text: string) => {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.blocks)) return parsed.blocks;
    return [];
  };

  try {
    return tryParse(cleaned);
  } catch {
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      return tryParse(cleaned.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      return tryParse(cleaned.slice(objectStart, objectEnd + 1));
    }

    const recovered = extractCompleteBlocksFromPartialResponse(cleaned);
    if (recovered.length > 0) {
      return recovered;
    }

    throw new Error("Unable to parse JSON payload from model response.");
  }
}

function extractCompleteBlocksFromPartialResponse(text: string) {
  const blocksKeyIndex = text.indexOf("\"blocks\"");
  if (blocksKeyIndex === -1) return [];

  const arrayStart = text.indexOf("[", blocksKeyIndex);
  if (arrayStart === -1) return [];

  const recovered: any[] = [];
  let inString = false;
  let escape = false;
  let depth = 0;
  let objectStart = -1;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        objectStart = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        const candidate = text.slice(objectStart, i + 1);
        try {
          recovered.push(JSON.parse(candidate));
        } catch {
        }
        objectStart = -1;
      }
      continue;
    }

    if (char === "]" && depth === 0) {
      break;
    }
  }

  return recovered;
}