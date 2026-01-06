import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Realistic demo images (Base64)
// These are representative images of a person in a dhoti
const DEMO_IMAGES = {
  full: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800", // Placeholder for full body
  half: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800", // Placeholder for half body
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

    // Read payload but don't strictly require images for demo mode
    const rawBody = await req.text();
    let bodyType = "half";
    try {
      const payload = JSON.parse(rawBody);
      bodyType = payload.bodyType === "full" ? "full" : "half";
    } catch (e) {
      console.warn("Could not parse request body, defaulting to half-body demo");
    }

    // Return the demo image based on body type
    // In a real production scenario, these would be pre-generated assets in Supabase Storage
    const demoImage = bodyType === "full" 
      ? DEMO_IMAGES.full 
      : DEMO_IMAGES.half;

    return createResponse({
      mode: "demo",
      image: demoImage,
      message: "AI preview is temporarily in demo mode"
    }, 200);

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("Edge Function internal error:", msg);
    return createResponse({ error: "Internal server error" }, 500);
  }
});
