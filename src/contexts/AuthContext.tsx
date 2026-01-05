import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/supabase";
import { toast } from "@/hooks/use-toast";

type Role = "admin" | "user";

interface AppUser {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AppUser | null;
  role: Role | null;
  authLoading: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signup: (
    name: string,
    email: string,
    password: string,
    mobile: string
  ) => Promise<{ ok: true; needsEmailConfirmation?: boolean } | { ok: false; error: string }>;
  googleSignIn: () => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserRole(userId: string): Promise<Role> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) {
      return "user";
    }

    return (data as any)?.role === "admin" ? "admin" : "user";
  } catch {
    return "user";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const initializedRef = useRef(false);
  const lastGoogleWelcomeToastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const applySessionUserOnly = (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null,
    ) => {
      if (!mounted) return;
      if (!session?.user) {
        setUser(null);
        setRole(null);
        return;
      }

      setUser({
        id: session.user.id,
        email: session.user.email || "",
        name:
          (session.user.user_metadata as any)?.name ||
          (session.user.user_metadata as any)?.full_name ||
          undefined,
        createdAt: (session.user as any)?.created_at || undefined,
      });
    };

    const applySession = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null,
    ) => {
      if (!mounted) return;
      if (!session?.user) {
        setUser(null);
        setRole(null);
        return;
      }

      const resolvedRole = await fetchUserRole(session.user.id);

      if (!mounted) return;
      setUser({
        id: session.user.id,
        email: session.user.email || "",
        name: (session.user.user_metadata as any)?.name || (session.user.user_metadata as any)?.full_name || undefined,
        createdAt: (session.user as any)?.created_at || undefined,
      });
      setRole(resolvedRole);
    };

    // Keep auth state in sync (login/logout/token refresh)
    // but do not interfere with initial restore.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initializedRef.current) return;

      if (
        _event === "SIGNED_IN" &&
        session?.user?.id &&
        (session.user.app_metadata as any)?.provider === "google" &&
        lastGoogleWelcomeToastUserIdRef.current !== session.user.id
      ) {
        lastGoogleWelcomeToastUserIdRef.current = session.user.id;
        toast({ title: "Welcome!", description: "Logged in with Google." });
      }

      // Critical: never toggle authLoading or re-fetch role after initial app startup.
      // Listener only keeps session/user data in sync.
      applySessionUserOnly(session);
    });

    // Restore existing session on app load (source of truth)
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setUser(null);
          setRole(null);
          return;
        }

        await applySession(data.session ?? null);
      } catch {
        if (!mounted) return;
        setUser(null);
        setRole(null);
      } finally {
        initializedRef.current = true;
        if (mounted) setAuthLoading(false);
      }
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const u = data.user;
      if (!u) return { ok: false as const, error: "Login failed" };

      const confirmedAt = (u as any)?.email_confirmed_at || (u as any)?.confirmed_at;
      if (!confirmedAt) {
        void supabase.auth.signOut();
        return { ok: false as const, error: "Please verify your email before logging in" };
      }

      const resolvedRole = await fetchUserRole(u.id);
      setUser({
        id: u.id,
        email: u.email || "",
        name: (u.user_metadata as any)?.name || (u.user_metadata as any)?.full_name || undefined,
        createdAt: (u as any)?.created_at || undefined,
      });
      setRole(resolvedRole);
      return { ok: true as const };
    } catch (e: any) {
      const msg = e?.message || "Login failed";
      return { ok: false as const, error: msg };
    }
  };

  const signup = async (name: string, email: string, password: string, mobile: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, mobile, role: "customer" },
        },
      });
      if (error) throw error;
      const u = data.user;
      const session = data.session;

      if (!session) {
        // Email confirmation enabled: user exists but is not signed in yet.
        return { ok: true as const, needsEmailConfirmation: true };
      }

      if (!u) return { ok: false as const, error: "Signup failed" };

      setUser({ id: u.id, email: u.email || "", name, createdAt: (u as any)?.created_at || undefined });
      setRole("user");
      return { ok: true as const };
    } catch (e: any) {
      const msg = e?.message || "Signup failed";
      return { ok: false as const, error: msg };
    }
  };

  const googleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Redirect will occur; return ok to satisfy caller
      return { ok: true as const };
    } catch (e: any) {
      const msg = e?.message || "Google sign-in failed";
      return { ok: false as const, error: msg };
    }
  };

  const logout = async () => {
    setUser(null);
    setRole(null);

    void supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      user,
      role,
      authLoading,
      loading: authLoading,
      login,
      signup,
      googleSignIn,
      logout,
      isAuthenticated: !!user,
      isAdmin: role === "admin",
    }),
    [user, role, authLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
