import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface RequestPayload {
  userImage: string;
  dhotiImage: string;
  bodyType: "full" | "half";
}

const GEMINI_MODEL = "gemini-1.5-pro";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const cleanBase64 = (str: string) => {
  if (!str) return "";
  const parts = str.split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "*";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!geminiApiKey) {
      console.error("Gemini API key not configured");
      return new Response(JSON.stringify({ error: "AI preview failed. Please try again later." }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const payload = (await req.json()) as RequestPayload;
    const { userImage, dhotiImage } = payload;

    if (!userImage || !dhotiImage) {
      return new Response(JSON.stringify({ error: "Missing required images" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
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
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64(userImage),
              },
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64(dhotiImage),
              },
            },
          ],
        },
      ],
      generationConfig: {
        // Only including if supported, but user didn't specify generationConfig changes
        // Some models need this for image output if they support it
        // responseModalities: ["IMAGE"],
      },
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${geminiApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);
      return new Response(JSON.stringify({ 
        error: "AI preview failed. Please try again later." 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Safely parse the response
    const candidates = data?.candidates || [];
    const content = candidates[0]?.content || {};
    const parts = content.parts || [];
    
    // Extract image from inlineData
    const imagePart = parts.find((part: any) => part.inlineData?.data);
    const imageData = imagePart?.inlineData?.data;

    if (imageData) {
      return new Response(JSON.stringify({ image: imageData }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.error("Gemini response missing image data:", JSON.stringify(data));
    return new Response(JSON.stringify({ error: "AI preview failed. Please try again later." }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error("Edge Function error:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "AI preview failed. Please try again later." }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
