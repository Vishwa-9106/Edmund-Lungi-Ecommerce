import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/supabase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type LocationState = {
  email?: string;
};

const STORAGE_KEY = "pending_verification_email";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [isResending, setIsResending] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const emailFromState = (location.state as LocationState | null)?.email;

  const email = useMemo(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || "";
    return (emailFromState || stored).trim();
  }, [emailFromState]);

  useEffect(() => {
    if (email) localStorage.setItem(STORAGE_KEY, email);
  }, [email]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = data.session?.user;
      const confirmedAt = (u as any)?.email_confirmed_at || (u as any)?.confirmed_at;
      if (u && confirmedAt) {
        localStorage.removeItem(STORAGE_KEY);
        navigate("/home", { replace: true });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (cooldownMs <= 0) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = window.setInterval(() => {
      setCooldownMs((v) => Math.max(0, v - 250));
    }, 250);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cooldownMs]);

  const handleResend = async () => {
    if (!email) {
      toast({
        title: "Email missing",
        description: "Please go back to signup and enter your email again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsResending(true);
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;

      toast({ title: "Verification email sent", description: "Please check your inbox (and Spam/Promotions)." });
      setCooldownMs(8000);
    } catch (e: any) {
      toast({
        title: "Could not resend email",
        description: e?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const cooldownSeconds = Math.ceil(cooldownMs / 1000);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-lg p-8 animate-scale-in">
          <div className="text-center mb-6">
            <Link to="/">
              <h1 className="font-display text-2xl font-bold gradient-text">Edmund Lungi's</h1>
            </Link>
            <h2 className="mt-4 text-xl font-semibold">Verify your email</h2>
            <p className="text-muted-foreground mt-2">
              We sent a verification link to {email ? <span className="font-medium text-foreground">{email}</span> : "your email address"}.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-sm text-foreground">
                Please check your inbox and click the verification link to continue.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                If you don't see it, check your Spam or Promotions folder.
              </p>
            </div>

            <Button
              type="button"
              className="w-full btn-primary"
              size="lg"
              onClick={handleResend}
              disabled={isResending || cooldownMs > 0}
            >
              {isResending
                ? "Sending..."
                : cooldownMs > 0
                  ? `Resend available in ${cooldownSeconds}s`
                  : "Resend verification email"}
            </Button>

            <div className="text-center">
              <Link to="/login" className="text-primary hover:underline font-medium">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
