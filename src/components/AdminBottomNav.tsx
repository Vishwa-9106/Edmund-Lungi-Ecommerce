import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Megaphone,
  MessageSquare,
  LogOut,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { supabase } from "@/supabase";
import { useState } from "react";

export function AdminBottomNav({ forceVisible = false }: { forceVisible?: boolean }) {
  const navigate = useNavigate();
  const [logoutBusy, setLogoutBusy] = useState(false);

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await supabase.auth.signOut();
      navigate("/", { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  };

  const navItems = [
    { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/admin/orders", icon: ShoppingBag, label: "Orders" },
    { to: "/admin/products", icon: Package, label: "Products" },
    { to: "/admin/customers", icon: Users, label: "Customers" },
    { to: "/admin/marketing", icon: Megaphone, label: "Marketing" },
    { to: "/admin/messages", icon: MessageSquare, label: "Messages" },
  ];

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 bg-gradient-to-t from-background via-background/95 to-transparent",
        !forceVisible && "md:hidden"
      )}
    >
      <div className="max-w-md mx-auto rounded-2xl border border-border bg-background/90 backdrop-blur-xl shadow-2xl p-1 flex justify-between items-center overflow-x-auto no-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center py-2 px-3 rounded-xl transition-all min-w-[48px]",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:bg-accent"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[8px] font-bold uppercase mt-1 sr-only">{item.label}</span>
          </NavLink>
        ))}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex flex-col items-center justify-center py-2 px-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all min-w-[48px]">
              <LogOut className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase mt-1 sr-only">Exit</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="w-[90%] max-w-sm rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Admin Logout</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to sign out?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 mt-4">
              <AlertDialogAction
                onClick={handleLogout}
                disabled={logoutBusy}
                className="w-full h-12 rounded-xl"
              >
                Logout
              </AlertDialogAction>
              <AlertDialogCancel className="w-full h-12 rounded-xl border-none">
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </nav>
  );
}
