import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, User, Mail, Phone, Lock, UserPlus, Chrome } from "lucide-react";

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [gmail, setGmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [cpassword, setCpassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showCPass, setShowCPass] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; gmail?: string; mobile?: string; password?: string; cpassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { signup, googleSignIn, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required";
    if (!gmail.trim()) next.gmail = "Email is required";
    if (gmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) next.gmail = "Enter a valid email address";
    if (!mobile.trim()) next.mobile = "Mobile number is required";
    if (mobile && !INDIAN_MOBILE_REGEX.test(mobile)) next.mobile = "Enter a valid 10-digit Indian mobile (starts with 6–9)";
    if (!password) next.password = "Password is required";
    if (!cpassword) next.cpassword = "Confirm your password";
    if (password && cpassword && password !== cpassword) next.cpassword = "Passwords do not match";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    const result = await signup(name.trim(), gmail.trim(), password, mobile.trim());
    setIsLoading(false);

    if (result.ok) {
      if (result.needsEmailConfirmation) {
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link. Verify your email, then log in.",
        });
        navigate("/verify-email", { replace: true, state: { email: gmail.trim() } });
      } else {
        toast({ title: "Account created!", description: "Welcome to Edmund Lungi's." });
        navigate("/home", { replace: true });
      }
    } else {
      toast({ title: "Signup failed", description: result.error || "Please try again.", variant: "destructive" });
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    const result = await googleSignIn();
    setIsLoading(false);
    if (!result.ok) {
      toast({ title: "Google sign-in failed", description: result.error, variant: "destructive" });
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
            <p className="text-muted-foreground mt-2">Create your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2"><User className="h-4 w-4" /> Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gmail" className="flex items-center gap-2"><Mail className="h-4 w-4" /> Gmail</Label>
              <Input
                id="gmail"
                type="email"
                placeholder="you@gmail.com"
                value={gmail}
                onChange={(e) => setGmail(e.target.value)}
                aria-invalid={!!errors.gmail}
              />
              {errors.gmail && <p className="text-sm text-red-600">{errors.gmail}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile" className="flex items-center gap-2"><Phone className="h-4 w-4" /> Indian Mobile Number</Label>
              <Input
                id="mobile"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit number (starts with 6–9)"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                aria-invalid={!!errors.mobile}
                maxLength={10}
              />
              {errors.mobile && <p className="text-sm text-red-600">{errors.mobile}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2"><Lock className="h-4 w-4" /> Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="Create a password"
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

            <div className="space-y-2">
              <Label htmlFor="cpassword" className="flex items-center gap-2"><Lock className="h-4 w-4" /> Confirm Password</Label>
              <div className="relative">
                <Input
                  id="cpassword"
                  type={showCPass ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={cpassword}
                  onChange={(e) => setCpassword(e.target.value)}
                  aria-invalid={!!errors.cpassword}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCPass((s) => !s)}
                  aria-label={showCPass ? "Hide password" : "Show password"}
                >
                  {showCPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.cpassword && <p className="text-sm text-red-600">{errors.cpassword}</p>}
            </div>

            <Button type="submit" className="w-full btn-primary" size="lg" disabled={isLoading}>
              <UserPlus className="h-4 w-4 mr-2" />
              {isLoading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-4">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={isLoading}>
              <Chrome className="h-4 w-4 mr-2" />
              {isLoading ? "Please wait..." : "Continue with Google"}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
