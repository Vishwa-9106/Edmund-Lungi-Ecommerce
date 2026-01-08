import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { AdminBottomNav } from "@/components/AdminBottomNav";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/supabase";

type AdminMenuItem =
  | "Dashboard"
  | "Sales Analytics"
  | "Orders"
  | "Products"
  | "Customers"
  | "Marketing"
  | "Messages";

export default function AdminPage() {
  const items = useMemo<Array<{ label: AdminMenuItem; to: string; Icon: React.ComponentType<{ className?: string }> }>>(
    () => [
      { label: "Dashboard", to: "/admin/dashboard", Icon: LayoutDashboard },
      { label: "Sales Analytics", to: "/admin/sales-analytics", Icon: BarChart3 },
      { label: "Orders", to: "/admin/orders", Icon: ShoppingBag },
      { label: "Products", to: "/admin/products", Icon: Package },
      { label: "Customers", to: "/admin/customers", Icon: Users },
      { label: "Marketing", to: "/admin/marketing", Icon: Megaphone },
      { label: "Messages", to: "/admin/messages", Icon: MessageSquare },
    ],
    []
  );

  const navigate = useNavigate();
  const location = useLocation();
  const isMobileOptimizedRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const [logoutBusy, setLogoutBusy] = useState(false);

  const handleConfirmLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLogoutBusy(false);
      navigate("/", { replace: true });
    }
  };

  const [collapsed, setCollapsed] = useState(false);
  const [shouldHideSidebar, setShouldHideSidebar] = useState(() => {
    if (!isMobileOptimizedRoute) return false;
    if (typeof window === "undefined") return false;

    const isMobileWidth = window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
    const isStandaloneDisplayMode = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    const isIOSStandalone = (window.navigator as any)?.standalone === true;

    return isMobileWidth || isStandaloneDisplayMode || isIOSStandalone;
  });

  useEffect(() => {
    if (!isMobileOptimizedRoute) return;
    if (typeof window === "undefined") return;

    const mobileMq = window.matchMedia("(max-width: 768px)");
    const standaloneMq = window.matchMedia("(display-mode: standalone)");

    const update = () => {
      const isIOSStandalone = (window.navigator as any)?.standalone === true;
      setShouldHideSidebar(mobileMq.matches || standaloneMq.matches || isIOSStandalone);
    };

    update();

    mobileMq.addEventListener?.("change", update);
    standaloneMq.addEventListener?.("change", update);
    return () => {
      mobileMq.removeEventListener?.("change", update);
      standaloneMq.removeEventListener?.("change", update);
    };
  }, [isMobileOptimizedRoute]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="flex min-h-screen">
        <aside
            className={cn(
              "shrink-0 border-r border-border bg-background transition-[width] duration-200",
              collapsed ? "w-16" : "w-64",
              shouldHideSidebar && "hidden"
            )}
        >
          <div className="h-16 flex items-center justify-between px-3">
            <div className={cn("min-w-0", collapsed && "sr-only")}> </div>
            {!shouldHideSidebar && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
            )}
          </div>

          <nav className="px-2 pb-4">
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={({ isActive }) =>
                    cn(
                      "h-10 w-full rounded-md px-3 text-sm font-medium transition-colors",
                      "flex items-center",
                      !collapsed && "gap-2",
                      collapsed ? "justify-center" : "justify-start",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <item.Icon className="h-4 w-4 shrink-0" />
                  <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </aside>

        <main
          className={cn(
            "flex-1 overflow-x-hidden min-w-0",
            shouldHideSidebar && "w-full pb-[calc(76px+env(safe-area-inset-bottom))]"
          )}
        >
          <Outlet />
        </main>
      </div>

      <div className={cn("fixed bottom-4 left-4 z-50", shouldHideSidebar && "hidden")}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={logoutBusy}>
              Logout
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmation</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to logout?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLogout} disabled={logoutBusy}>
                Yes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <AdminBottomNav forceVisible={shouldHideSidebar} />
    </div>
  );
}
