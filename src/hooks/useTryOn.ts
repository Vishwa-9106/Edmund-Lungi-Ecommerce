import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase";
import type { TryOnError, TryOnQuota, TryOnRequest, TryOnResponse } from "@/types/aiTryOn";

function formatTryOnError(payload: TryOnError): string {
  if (payload.reason === "daily" || payload.reason === "monthly") {
    const daily = payload.daily_remaining ?? 0;
    const monthly = payload.monthly_remaining ?? 0;
    return `${payload.error} (Remaining: ${daily} today, ${monthly} this month)`;
  }
  return payload.error;
}

export function useTryOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: TryOnRequest): Promise<TryOnResponse> => {
      const { data, error } = await supabase.functions.invoke<TryOnResponse | TryOnError>(
        "replicate-tryon",
        {
          body: request,
        }
      );

      if (error) {
        let detailedMessage: string | null = null;
        const response = (error as { context?: Response }).context;
        if (response) {
          const payload = (await response.clone().json().catch(() => null)) as Partial<TryOnError> | null;
          if (payload?.error) {
            detailedMessage = formatTryOnError(payload as TryOnError);
          }

          if (!detailedMessage) {
            const text = await response.text().catch(() => null);
            if (text) {
              try {
                const parsed = JSON.parse(text) as Partial<TryOnError>;
                detailedMessage = parsed?.error
                  ? formatTryOnError(parsed as TryOnError)
                  : text;
              } catch {
                detailedMessage = text;
              }
            }
          }
        }
        throw new Error(detailedMessage || error.message || "Failed to generate try-on preview");
      }

      if (!data) {
        throw new Error("No data received from server");
      }

      if ("error" in data) {
        throw new Error(formatTryOnError(data));
      }

      if (!data.success) {
        throw new Error("Failed to generate try-on preview");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tryon-quota"] });
    },
  });
}

export function useTryOnQuota() {
  return useQuery<TryOnQuota>({
    queryKey: ["tryon-quota"],
    queryFn: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.rpc("get_tryon_quota", {
        p_user_id: user.id,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error("No quota data received");
      }

      if (Array.isArray(data)) {
        const first = data[0];
        if (!first) {
          throw new Error("No quota data received");
        }
        return first as TryOnQuota;
      }

      return data as TryOnQuota;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
