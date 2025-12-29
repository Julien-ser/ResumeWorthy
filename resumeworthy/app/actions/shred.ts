"use server";
import { supabase } from "@/lib/supabase";
import PDFParser from "pdf2json";
import OpenAI from "openai";

// Initialize OpenAI client but point it to OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function ingestResume(formData: FormData, userId: string) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file uploaded");

  try {
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

    // 2. AI Shredding via OpenRouter
    // 2. AI Shredding via OpenRouter
    const completion = await openai.chat.completions.create({
        model: "xiaomi/mimo-v2-flash:free", 
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
            5. Output ONLY a raw JSON array.`
            },
            {
            role: "user",
            content: `Shred this resume text completely. Leave nothing behind:
            
            ${rawText}`
            }
        ],
        temperature: 0.1, // Slight temperature helps with complex formatting
        });

    const aiResponse = completion.choices[0].message.content || "[]";
    
    // Clean and parse the response
    let blocks = [];
    try {
      // Sometimes models wrap JSON in markdown; this regex strips it
      const cleaned = aiResponse.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      // Ensure we have an array
      blocks = Array.isArray(parsed) ? parsed : parsed.blocks || [parsed];
    } catch (e) {
      console.error("AI JSON Parse Error:", aiResponse);
      throw new Error("AI returned invalid data format.");
    }

    // 3. Attach User ID and Insert
    const finalBlocks = blocks.map((b: any) => ({ ...b, user_id: userId }));
    const { error: dbError } = await supabase.from("blocks").insert(finalBlocks);
    
    if (dbError) throw dbError;
    return { success: true };

  } catch (error: any) {
    console.error("SHREDDER ERROR:", error);
    throw new Error(`Process failed: ${error.message}`);
  }
}