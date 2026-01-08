import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock, LogIn, Chrome } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { login, googleSignIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const validate = () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required";
    if (!password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.ok) {
      toast({ title: "Welcome back!", description: "You have been logged in successfully." });
      navigate(result.role === "admin" ? "/admin/dashboard" : "/", { replace: true });
    } else {
      const message = "error" in result ? result.error : "Please check your credentials and try again.";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    const result = await googleSignIn();
    setIsLoading(false);
    if (!result.ok) {
      const message = "error" in result ? result.error : "Google login failed";
      toast({ title: "Google login failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-lg p-8 animate-scale-in">
          <div className="text-center mb-8">
            <Link to="/">
              <h1 className="font-display text-2xl font-bold gradient-text">
                Edmund Lungi's
              </h1>
            </Link>
            <p className="text-muted-foreground mt-2">Welcome back! Please login.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2"><Lock className="h-4 w-4" /> Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full btn-primary" size="lg" disabled={isLoading}>
              <LogIn className="h-4 w-4 mr-2" />
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-4">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={isLoading}>
              <Chrome className="h-4 w-4 mr-2" />
              {isLoading ? "Please wait..." : "Login with Google"}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
