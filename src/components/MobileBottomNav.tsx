import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, Info, LayoutGrid, LogOut, Mail, Search, UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function MobileBottomNav() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const items = useMemo(
    () =>
      [
        { key: "home", to: "/", icon: Home },
        { key: "shop", to: "/shop", icon: Search },
        { key: "about", to: "/about", icon: Info },
        { key: "contact", to: "/contact", icon: Mail },
        { key: "dashboard", to: "/dashboard", icon: LayoutGrid },
      ] as const,
    []
  );

  return (
    <>
      <nav className="mobile-bottom-nav">
        <div className="mx-auto max-w-3xl px-3">
          <div className="rounded-t-2xl border border-border bg-background/90 backdrop-blur-lg shadow-lg">
            <div className="grid grid-cols-6">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    aria-label={item.key}
                    className={({ isActive }) =>
                      [
                        "flex items-center justify-center",
                        "py-3",
                        "min-h-[56px]",
                        "transition-colors",
                        isActive
                          ? "text-primary bg-secondary/60"
                          : "text-muted-foreground hover:text-foreground",
                        "mx-1 my-1 rounded-xl",
                      ].join(" ")
                    }
                    end={item.to === "/"}
                  >
                    <Icon className="h-6 w-6" />
                  </NavLink>
                );
              })}

              {isAuthenticated ? (
                <button
                  type="button"
                  aria-label="logout"
                  onClick={() => setLogoutOpen(true)}
                  className={[
                    "relative",
                    "flex items-center justify-center",
                    "py-3",
                    "min-h-[56px]",
                    "transition-colors",
                    logoutOpen ? "text-primary bg-secondary/60" : "text-muted-foreground hover:text-foreground",
                    "mx-1 my-1 rounded-xl",
                  ].join(" ")}
                >
                  <UserCircle className="h-6 w-6" />
                  <span className="absolute right-3 top-3 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                    <LogOut className="h-3 w-3" />
                  </span>
                </button>
              ) : (
                <NavLink
                  to="/login"
                  aria-label="login"
                  className={({ isActive }) =>
                    [
                      "flex items-center justify-center",
                      "py-3",
                      "min-h-[56px]",
                      "transition-colors",
                      isActive
                        ? "text-primary bg-secondary/60"
                        : "text-muted-foreground hover:text-foreground",
                      "mx-1 my-1 rounded-xl",
                    ].join(" ")
                  }
                >
                  <UserCircle className="h-6 w-6" />
                </NavLink>
              )}
            </div>
          </div>
        </div>
      </nav>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmation</DialogTitle>
            <DialogDescription>Are you sure?</DialogDescription>
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
                setLogoutOpen(false);
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
