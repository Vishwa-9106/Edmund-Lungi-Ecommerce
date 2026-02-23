import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import logo from "./edmund lungi's logo.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [hideMobileMenu, setHideMobileMenu] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const mobileMq = window.matchMedia("(max-width: 768px)");
    const coarsePointerMq = window.matchMedia("(pointer: coarse)");

    const recompute = () => {
      const isIosStandalone = Boolean(
        (window.navigator as Navigator & { standalone?: boolean }).standalone
      );
      const showBottomNav = standaloneMq.matches || isIosStandalone || (mobileMq.matches && coarsePointerMq.matches);
      const shouldHide = showBottomNav;
      setHideMobileMenu(shouldHide);
      if (shouldHide) setIsMenuOpen(false);
    };

    recompute();

    standaloneMq.addEventListener("change", recompute);
    mobileMq.addEventListener("change", recompute);
    coarsePointerMq.addEventListener("change", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      standaloneMq.removeEventListener("change", recompute);
      mobileMq.removeEventListener("change", recompute);
      coarsePointerMq.removeEventListener("change", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Shop", href: "/shop" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
    { name: "Dashboard", href: "/dashboard" },
  ];

  return (
    <nav className="site-navbar sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img
              src={logo}
              alt="Edmund Lungi's Logo"
              className="h-12 w-12 object-contain"
            />
            <span className="font-display text-xl md:text-2xl font-semibold gradient-text">
              Edmund Lungi's
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.name} to={link.href} className="nav-link font-medium">
                {link.name}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Cart */}
            <Link to="/cart" className="relative p-2 hover:bg-secondary rounded-full transition-colors">
              <ShoppingBag className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Link>

            {/* Auth */}
            {isAuthenticated ? (
              <div className="hidden md:flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsLogoutDialogOpen(true)}>
                  Logout
                </Button>
                <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirmation</DialogTitle>
                      <DialogDescription>
                        Are you sure?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">No</Button>
                      </DialogClose>
                      <Button 
                        variant="default" 
                        onClick={() => {
                          navigate("/", { replace: true });
                          void logout();
                          setIsLogoutDialogOpen(false);
                        }}
                      >
                        Yes
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <Link to="/login" className="hidden md:block">
                <Button size="sm" className="btn-primary">
                  Login
                </Button>
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            {!hideMobileMenu && (
              <button
                className="md:hidden p-2 hover:bg-secondary rounded-full transition-colors"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        {!hideMobileMenu && isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className="px-4 py-3 hover:bg-secondary rounded-lg transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsLogoutDialogOpen(true);
                    }}
                    className="px-4 py-3 text-left hover:bg-secondary rounded-lg transition-colors text-destructive"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="mx-4 mt-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Button className="w-full btn-primary">Login</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
