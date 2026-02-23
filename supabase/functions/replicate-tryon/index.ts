import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ENFORCE_TRYON_QUOTA = false; // testing mode: disable limits
const TRYON_RESULTS_BUCKET = 'tryon-results';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function jsonResponse(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function normalizeBase64Image(value: string): string {
  return value
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .replace(/\s/g, '');
}

function extractStoragePath(value: string): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value;

  const publicPrefix = `/storage/v1/object/public/${TRYON_RESULTS_BUCKET}/`;
  const signPrefix = `/storage/v1/object/sign/${TRYON_RESULTS_BUCKET}/`;

  if (value.includes(publicPrefix)) {
    return value.split(publicPrefix)[1]?.split('?')[0] ?? null;
  }

  if (value.includes(signPrefix)) {
    return value.split(signPrefix)[1]?.split('?')[0] ?? null;
  }

  return null;
}

async function ensureResultsBucket(supabaseClient: ReturnType<typeof createClient>) {
  const { data: buckets, error: listError } = await supabaseClient.storage.listBuckets();
  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }

  const exists = (buckets ?? []).some((bucket) => bucket.name === TRYON_RESULTS_BUCKET);
  if (exists) return;

  const { error: createError } = await supabaseClient.storage.createBucket(TRYON_RESULTS_BUCKET, {
    public: false,
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(`Could not create ${TRYON_RESULTS_BUCKET} bucket: ${createError.message}`);
  }
}

async function createAccessibleResultUrl(
  supabaseClient: ReturnType<typeof createClient>,
  objectPath: string
) {
  const { data: signed, error: signedError } = await supabaseClient.storage
    .from(TRYON_RESULTS_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (!signedError && signed?.signedUrl) {
    return signed.signedUrl;
  }

  const { data: { publicUrl } } = supabaseClient.storage
    .from(TRYON_RESULTS_BUCKET)
    .getPublicUrl(objectPath);

  return publicUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Virtual Try-On with Colab ===');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) throw new Error('Unauthorized');

    const { personImageUrl, productId } = await req.json();
    if (!personImageUrl || !productId) throw new Error('Missing personImageUrl or productId');

    // Check quota (disabled for testing)
    if (ENFORCE_TRYON_QUOTA) {
      const { data: quotaCheck } = await supabaseClient.rpc(
        'check_and_consume_tryon_quota',
        { p_user_id: user.id }
      );

      if (!quotaCheck?.allowed) {
        return new Response(
          JSON.stringify({ error: 'Quota exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get product
    const { data: product } = await supabaseClient
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!product) throw new Error('Product not found');

    // Check cache
    const cacheKey = `${await hashString(personImageUrl)}_${productId}`;
    const { data: cachedResult } = await supabaseClient.rpc('check_tryon_cache', {
      p_cache_key: cacheKey
    });

    if (cachedResult && typeof cachedResult === 'string') {
      if (cachedResult.startsWith('data:image/')) {
        return jsonResponse({ success: true, result_url: cachedResult, cached: true });
      }

      const cachedPath = extractStoragePath(cachedResult);
      if (cachedPath) {
        const { error: cachedReadError } = await supabaseClient.storage
          .from(TRYON_RESULTS_BUCKET)
          .download(cachedPath);

        if (!cachedReadError) {
          const cachedUrl = await createAccessibleResultUrl(supabaseClient, cachedPath);
          return jsonResponse({ success: true, result_url: cachedUrl, cached: true });
        }

        console.warn('Cached result invalid; regenerating', cachedReadError.message);
      }
    } else if (cachedResult) {
      if (ENFORCE_TRYON_QUOTA) {
        await supabaseClient.rpc('refund_tryon_quota', { p_user_id: user.id });
      }
      return jsonResponse({ success: true, result_url: String(cachedResult), cached: true });
    }

    const { data: tryonRequest, error: insertError } = await supabaseClient
      .from('ai_tryon_requests')
      .insert({
        user_id: user.id,
        product_id: productId,
        person_image_url: personImageUrl,
        product_image_url: product.image_url,
        status: 'processing'
      })
      .select()
      .single();
    if (insertError || !tryonRequest) {
      throw new Error(`Failed to create try-on request: ${insertError?.message ?? 'Unknown error'}`);
    }

    const colabUrl = Deno.env.get('COLAB_API_URL');
    if (!colabUrl) {
      throw new Error('COLAB_API_URL not set');
    }

    console.log('Calling Colab Virtual Try-On...');

    // Call Colab with BOTH images
    const colabResponse = await fetch(`${colabUrl}/tryon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_image_url: personImageUrl,        // User's photo
        product_image_url: product.image_url,    // Product image
        product_name: product.name               // Product name
      })
    });

    if (!colabResponse.ok) {
      throw new Error(`Colab error: ${colabResponse.status}`);
    }

    const colabData = await colabResponse.json();

    if (!colabData.success || !colabData.image_base64) {
      throw new Error('No result from Colab');
    }

    // Decode base64
    const cleanedBase64 = normalizeBase64Image(String(colabData.image_base64));
    const imageBuffer = Uint8Array.from(atob(cleanedBase64), c => c.charCodeAt(0));

    let resultUrl = `data:image/png;base64,${cleanedBase64}`; // fallback that always renders
    let cacheValue: string | null = null;

    // Upload result if storage bucket exists/created; otherwise keep base64 fallback.
    try {
      await ensureResultsBucket(supabaseClient);
      const fileName = `${user.id}/${tryonRequest.id}.png`;

      let { error: uploadError } = await supabaseClient.storage
        .from(TRYON_RESULTS_BUCKET)
        .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: false });

      if (uploadError?.message?.toLowerCase().includes('bucket not found')) {
        await ensureResultsBucket(supabaseClient);
        ({ error: uploadError } = await supabaseClient.storage
          .from(TRYON_RESULTS_BUCKET)
          .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: false }));
      }

      if (uploadError) {
        console.warn('Result upload failed; using base64 fallback:', uploadError.message);
      } else {
        resultUrl = await createAccessibleResultUrl(supabaseClient, fileName);
        cacheValue = fileName;
      }
    } catch (storageError) {
      console.warn('Storage unavailable; using base64 fallback:', storageError);
    }

    const { error: updateError } = await supabaseClient
      .from('ai_tryon_requests')
      .update({
        result_image_url: resultUrl,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', tryonRequest.id);
    if (updateError) {
      console.warn('Failed to update ai_tryon_requests result URL:', updateError.message);
    }

    if (cacheValue) {
      const { error: cacheError } = await supabaseClient.rpc('store_tryon_cache', {
        p_cache_key: cacheKey,
        p_product_id: productId,
        p_result_url: cacheValue
      });
      if (cacheError) {
        console.warn('Failed to store cache:', cacheError.message);
      }
    }

    return jsonResponse({ success: true, result_url: resultUrl, cached: false });

  } catch (error: any) {
    console.error('replicate-tryon failed:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
