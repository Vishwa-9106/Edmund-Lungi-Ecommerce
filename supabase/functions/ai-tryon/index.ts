import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface RequestPayload {
  userImage: string;
  dhotiImage: string;
  bodyType: "full" | "half";
}

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

serve(async (req: Request) => {
  // 7. Ensure CORS headers are included in all responses
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Helper to create JSON responses (5. Always return JSON)
  const createResponse = (body: any, status: number) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  };

  try {
    if (req.method !== "POST") {
      return createResponse({ error: "Method not allowed" }, 405);
    }

    // 2. Safely read the Gemini API key
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!geminiApiKey) {
      console.error("GEMINI_API_KEY is not configured in environment variables");
      return createResponse({ error: "Gemini API key not configured" }, 500);
    }

    // 1. Add detailed validation for request body
    let payload: RequestPayload;
    try {
      const rawBody = await req.text();
      // 6. Log request payload size
      console.log(`Request payload size: ${rawBody.length} characters`);
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error("Failed to parse request body:", e);
      return createResponse({ error: "Invalid request payload" }, 400);
    }

    const { userImage, dhotiImage, bodyType } = payload;

    if (
      typeof userImage !== "string" || !userImage ||
      typeof dhotiImage !== "string" || !dhotiImage ||
      (bodyType !== "full" && bodyType !== "half")
    ) {
      console.error("Validation failed: Missing or invalid required fields");
      return createResponse({ error: "Invalid request payload" }, 400);
    }

    const promptText = `Edit the provided photograph.

Strict rules:
- Do not change the face, hairstyle, skin tone, pose, or background.
- Do not change the upper body clothing.
- Only modify the lower body.

Task:
- Dress the person in the provided dhoti image.
- If the full body is visible, replace only the lower body clothing with the dhoti.
- If the image shows only half body, naturally generate the missing lower body and dress it with the dhoti.

Style:
- Ultra-realistic photographic quality
- Natural fabric folds and drape
- Correct body proportions and perspective
- Preserve original lighting and shadows
- The dhoti must look naturally worn, not artificial.

Output:
- High-resolution realistic photo
- No distortion
- No extra body parts
- No background changes`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: userImage,
              },
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: dhotiImage,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_modalities: ["IMAGE"],
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };

    // 3. Wrap the Gemini API call in try/catch
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });
    } catch (fetchError) {
      console.error("Network error calling Gemini API:", fetchError);
      return createResponse({ error: "Failed to connect to AI service" }, 502);
    }

    // 6. Log Gemini response status
    console.log(`Gemini API response status: ${response.status}`);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: { message: "Unknown error" } };
      }
      
      // 6. Log Gemini error messages
      console.error("Gemini API error body:", JSON.stringify(errorData));
      
      const errorMsg = errorData.error?.message || "";
      if (
        response.status === 429 || 
        response.status === 402 || 
        errorMsg.toLowerCase().includes("quota") || 
        errorMsg.toLowerCase().includes("credit") ||
        errorMsg.toLowerCase().includes("limit")
      ) {
        return createResponse({ 
          error: "AI preview is temporarily unavailable. Please try again later." 
        }, 503);
      }

      return createResponse({ error: "Failed to generate AI preview" }, response.status >= 500 ? 502 : 400);
    }

    const data = await response.json();
    
    // 4. Normalize Gemini API response
    const candidate = data.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((part: any) => part.inline_data);

    if (imagePart?.inline_data?.data) {
      // 5. Success response (Status 200)
      return createResponse({ image: imagePart.inline_data.data }, 200);
    }

    console.error("Gemini API response did not contain image data:", JSON.stringify(data));
    return createResponse({ error: "Failed to generate AI preview" }, 502);

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("Edge Function internal error:", msg);
    return createResponse({ error: "Internal server error" }, 500);
  }
});
