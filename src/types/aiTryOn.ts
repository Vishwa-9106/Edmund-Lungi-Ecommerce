export interface TryOnRequest {
  personImageUrl: string;
  productId: string;
}

export interface TryOnResponse {
  success: boolean;
  result_url: string;
  cached: boolean;
  processing_time_ms?: number;
  quota?: {
    daily_remaining: number;
    monthly_remaining: number;
  };
}

export interface TryOnQuota {
  daily_limit: number;
  daily_used: number;
  daily_remaining: number;
  monthly_limit: number;
  monthly_used: number;
  monthly_remaining: number;
}

export interface TryOnError {
  error: string;
  reason?: string;
  daily_remaining?: number;
  monthly_remaining?: number;
}
