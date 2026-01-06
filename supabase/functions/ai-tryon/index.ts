import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface RequestPayload {
  userImage: string;
  dhotImage: string;
  bodyType: "full" | "half";
}

const SEGMIND_API_URL = "https://api.segmind.com/v1/segfit-v1.3";

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const segmindApiKey = Deno.env.get("SEGMIND_API_KEY")?.trim();

  if (!segmindApiKey) {
    return new Response(JSON.stringify({ error: "Segmind API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const payload = (await req.json()) as RequestPayload;
    const { userImage, dhotImage, bodyType } = payload;

    if (!userImage || !dhotImage) {
      return new Response(JSON.stringify({ error: "Missing required images" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const prompt = bodyType === "half"
      ? "wearing traditional South Indian dhoti lungi, photorealistic, natural drape and folds, same pose and background, same face and hairstyle, generate lower body naturally wearing the dhoti"
      : "wearing traditional South Indian dhoti lungi, photorealistic, natural drape and folds, same pose and background, same face and hairstyle, only replace lower body garment with dhoti";

    const segmindPayload = {
      model_image: userImage,
      outfit_image: dhotImage,
      seed: -1,
      image_format: "png",
      image_quality: 90,
    };

    const response = await fetch(SEGMIND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": segmindApiKey,
      },
      body: JSON.stringify(segmindPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Segmind API error:", response.status, errorText);
      
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      if (response.status === 406) {
        return new Response(JSON.stringify({ 
          error: "Insufficient API credits. Please recharge your Segmind account to continue using the AI Try-On feature.",
          rechargeUrl: "https://cloud.segmind.com/billing?type=TOPUP"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to generate image" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("image")) {
      const imageBuffer = await response.arrayBuffer();
      const base64Image = btoa(
        new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      return new Response(JSON.stringify({ image: base64Image }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const data = await response.json();
    
    if (data.image) {
      return new Response(JSON.stringify({ image: data.image }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Unexpected response format" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("AI Try-On error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
