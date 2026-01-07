import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { supabase } from "@/supabase";
import { StatCard } from "@/components/StatCard";
import { ChartCard } from "@/components/ChartCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Megaphone,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
  MessageSquare,
  LayoutDashboard,
  LogOut,
  RefreshCw,
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

type OrderStatus = "Pending" | "Confirmed" | "Processing" | "Shipped" | "Delivered" | "Completed" | "Cancelled";

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string | null;
  status: string | null;
  total: number | string | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
};

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  Pending: "#FACC15",
  Confirmed: "#3B82F6",
  Processing: "#0EA5E9",
  Shipped: "#8B5CF6",
  Delivered: "#22C55E",
  Completed: "#16A34A",
  Cancelled: "#EF4444",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatINR(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function normalizeTotal(total: number | string | null) {
  const n = typeof total === "string" ? Number(total) : total;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function timeAgo(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function normalizeStatus(status: string | null | undefined): OrderStatus {
  if (!status) return "Pending";
  const normalized = status.trim().toLowerCase();
  const match = (Object.keys(ORDER_STATUS_COLORS) as OrderStatus[]).find((s) => s.toLowerCase() === normalized);
  return match ?? "Pending";
}

function statusBadgeClassName(_: OrderStatus) {
  return "border-transparent text-white";
}

function statusBadgeStyle(status: OrderStatus): React.CSSProperties {
  return {
    backgroundColor: ORDER_STATUS_COLORS[status],
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [useCompactLayout, setUseCompactLayout] = useState(false);

  useEffect(() => {
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const mobileMq = window.matchMedia("(max-width: 768px)");
    const tabletMq = window.matchMedia("(max-width: 1023px)");

    const recompute = () => {
      const compact = mobileMq.matches || standaloneMq.matches;
      setUseCompactLayout(compact);
    };

    recompute();

    standaloneMq.addEventListener("change", recompute);
    mobileMq.addEventListener("change", recompute);
    tabletMq.addEventListener("change", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      standaloneMq.removeEventListener("change", recompute);
      mobileMq.removeEventListener("change", recompute);
      tabletMq.removeEventListener("change", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [todaysOrdersCount, setTodaysOrdersCount] = useState(0);
  const [todaysRevenue, setTodaysRevenue] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [attentionOrders, setAttentionOrders] = useState<OrderRow[]>([]);

  const [lowStockProducts, setLowStockProducts] = useState<ProductRow[]>([]);
  const [outOfStockProducts, setOutOfStockProducts] = useState<ProductRow[]>([]);

  const [lastOrderTime, setLastOrderTime] = useState<string | null>(null);
  const [lastProductAddedTime, setLastProductAddedTime] = useState<string | null>(null);
  const [totalActiveProducts, setTotalActiveProducts] = useState(0);

  const [activityFeed, setActivityFeed] = useState<
    Array<
      | { type: "user_registered"; created_at: string; user_id: string }
      | { type: "first_order"; created_at: string; user_id: string; order_number: string | null }
      | { type: "repeat_order"; created_at: string; user_id: string; order_number: string | null }
    >
  >([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = addDays(todayStart, 1);

    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    const pendingThresholdIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const confirmedThresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const processingThresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deliveredThresholdIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const olderThan5DaysIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [
        todayOrdersRes,
        todayRevenueRes,
        pendingOrdersRes,
        lowStockRes,
        totalActiveProductsRes,
        recentOrdersRes,
        attentionPendingRes,
        attentionConfirmedRes,
        attentionProcessingRes,
        attentionDeliveredRes,
        attentionOlderThan5DaysRes,
        lowStockListRes,
        outOfStockListRes,
        recentUsersRes,
        lastOrderRes,
        lastProductRes,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStartIso)
          .lt("created_at", todayEndIso),

        supabase
          .from("orders")
          .select("total")
          .in("status", ["Delivered", "Completed"])
          .gte("created_at", todayStartIso)
          .lt("created_at", todayEndIso),

        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "Pending"),

        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .lt("stock_quantity", 10),

        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .eq("status", "Pending")
          .lt("created_at", pendingThresholdIso)
          .order("created_at", { ascending: true })
          .limit(10),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .eq("status", "Confirmed")
          .lt("created_at", confirmedThresholdIso)
          .order("created_at", { ascending: true })
          .limit(10),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .eq("status", "Processing")
          .lt("created_at", processingThresholdIso)
          .order("created_at", { ascending: true })
          .limit(10),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .eq("status", "Delivered")
          .lt("created_at", deliveredThresholdIso)
          .order("created_at", { ascending: true })
          .limit(10),

        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,created_at")
          .lt("created_at", olderThan5DaysIso)
          .order("created_at", { ascending: true })
          .limit(10),

        supabase
          .from("products")
          .select("id,name,stock_quantity,is_active,created_at")
          .eq("is_active", true)
          .gt("stock_quantity", 0)
          .lt("stock_quantity", 10)
          .order("stock_quantity", { ascending: true })
          .limit(6),

        supabase
          .from("products")
          .select("id,name,stock_quantity,is_active,created_at")
          .eq("is_active", true)
          .eq("stock_quantity", 0)
          .order("created_at", { ascending: false })
          .limit(6),

        supabase
          .from("users")
          .select("id,created_at,no_of_orders")
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(8),

        supabase.from("orders").select("created_at").order("created_at", { ascending: false }).limit(1),

        supabase.from("products").select("created_at").order("created_at", { ascending: false }).limit(1),
      ]);

      if (todayOrdersRes.error) throw todayOrdersRes.error;
      if (todayRevenueRes.error) throw todayRevenueRes.error;
      if (pendingOrdersRes.error) throw pendingOrdersRes.error;
      if (lowStockRes.error) throw lowStockRes.error;
      if (totalActiveProductsRes.error) throw totalActiveProductsRes.error;
      if (recentOrdersRes.error) throw recentOrdersRes.error;
      if (attentionPendingRes.error) throw attentionPendingRes.error;
      if (attentionConfirmedRes.error) throw attentionConfirmedRes.error;
      if (attentionProcessingRes.error) throw attentionProcessingRes.error;
      if (attentionDeliveredRes.error) throw attentionDeliveredRes.error;
      if (attentionOlderThan5DaysRes.error) throw attentionOlderThan5DaysRes.error;
      if (lowStockListRes.error) throw lowStockListRes.error;
      if (outOfStockListRes.error) throw outOfStockListRes.error;
      if (recentUsersRes.error) throw recentUsersRes.error;
      if (lastOrderRes.error) throw lastOrderRes.error;
      if (lastProductRes.error) throw lastProductRes.error;

      setTodaysOrdersCount(todayOrdersRes.count ?? 0);

      const todayRevenueRows = (Array.isArray(todayRevenueRes.data) ? (todayRevenueRes.data as any[]) : []) as Array<{
        total: number | string | null;
      }>;
      setTodaysRevenue(todayRevenueRows.reduce((sum, r) => sum + normalizeTotal(r.total), 0));

      setPendingOrdersCount(pendingOrdersRes.count ?? 0);
      setLowStockCount(lowStockRes.count ?? 0);

      setTotalActiveProducts(totalActiveProductsRes.count ?? 0);

      setRecentOrders((Array.isArray(recentOrdersRes.data) ? (recentOrdersRes.data as OrderRow[]) : []) ?? []);

      const attentionRows = [
        ...(Array.isArray(attentionPendingRes.data) ? (attentionPendingRes.data as OrderRow[]) : []),
        ...(Array.isArray(attentionConfirmedRes.data) ? (attentionConfirmedRes.data as OrderRow[]) : []),
        ...(Array.isArray(attentionProcessingRes.data) ? (attentionProcessingRes.data as OrderRow[]) : []),
        ...(Array.isArray(attentionDeliveredRes.data) ? (attentionDeliveredRes.data as OrderRow[]) : []),
        ...(Array.isArray(attentionOlderThan5DaysRes.data) ? (attentionOlderThan5DaysRes.data as OrderRow[]) : []),
      ];
      const byId = new Map<string, OrderRow>();
      for (const o of attentionRows) byId.set(o.id, o);
      setAttentionOrders(Array.from(byId.values()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));

      setLowStockProducts((Array.isArray(lowStockListRes.data) ? (lowStockListRes.data as ProductRow[]) : []) ?? []);
      setOutOfStockProducts((Array.isArray(outOfStockListRes.data) ? (outOfStockListRes.data as ProductRow[]) : []) ?? []);

      const recentUserRows = (Array.isArray(recentUsersRes.data) ? (recentUsersRes.data as any[]) : []) as Array<{
        id: string;
        created_at: string;
        no_of_orders: number | null;
      }>;

      const recentOrdersData = (Array.isArray(recentOrdersRes.data) ? (recentOrdersRes.data as OrderRow[]) : []) ?? [];
      const recentOrderUserIds = Array.from(new Set(recentOrdersData.map((o) => String(o.user_id)).filter((x) => x.length > 0)));

      const userOrdersInfo = new Map<string, { no_of_orders: number | null }>();
      if (recentOrderUserIds.length > 0) {
        const { data: userInfoRows, error: userInfoErr } = await supabase
          .from("users")
          .select("id,no_of_orders")
          .in("id", recentOrderUserIds);
        if (userInfoErr) throw userInfoErr;
        for (const r of Array.isArray(userInfoRows) ? userInfoRows : []) {
          userOrdersInfo.set(String((r as any).id), { no_of_orders: (r as any).no_of_orders ?? null });
        }
      }

      const feed: Array<
        | { type: "user_registered"; created_at: string; user_id: string }
        | { type: "first_order"; created_at: string; user_id: string; order_number: string | null }
        | { type: "repeat_order"; created_at: string; user_id: string; order_number: string | null }
      > = [];

      for (const u of recentUserRows) {
        feed.push({ type: "user_registered", created_at: u.created_at, user_id: u.id });
      }

      for (const o of recentOrdersData.slice(0, 8)) {
        const no = userOrdersInfo.get(String(o.user_id))?.no_of_orders ?? null;
        if (no === 1) {
          feed.push({ type: "first_order", created_at: o.created_at, user_id: o.user_id, order_number: o.order_number });
        } else if (typeof no === "number" && no > 1) {
          feed.push({ type: "repeat_order", created_at: o.created_at, user_id: o.user_id, order_number: o.order_number });
        }
      }

      feed.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setActivityFeed(feed.slice(0, 12));

      const lastOrder = Array.isArray(lastOrderRes.data) ? lastOrderRes.data[0] : null;
      const lastProduct = Array.isArray(lastProductRes.data) ? lastProductRes.data[0] : null;
      setLastOrderTime(lastOrder?.created_at ?? null);
      setLastProductAddedTime(lastProduct?.created_at ?? null);
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
      setTodaysOrdersCount(0);
      setTodaysRevenue(0);
      setPendingOrdersCount(0);
      setLowStockCount(0);
      setRecentOrders([]);
      setAttentionOrders([]);
      setLowStockProducts([]);
      setOutOfStockProducts([]);
      setTotalActiveProducts(0);
      setActivityFeed([]);
      setLastOrderTime(null);
      setLastProductAddedTime(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

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

  const empty = !loading && !error && todaysOrdersCount === 0 && recentOrders.length === 0;

  if (useCompactLayout) {
    return (
      <div className="admin-dashboard-mobile flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+80px)]">
        {/* Minimal Header */}
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Lungi Store Control</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void fetchDashboard()}
            disabled={loading}
            className="rounded-full hover:bg-accent"
          >
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </Button>
        </header>

        <main className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
          {loading ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Syncing store data...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
              <div className="text-sm font-semibold text-destructive">Dashboard Unavailable</div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchDashboard()}>Retry</Button>
            </div>
          ) : empty ? (
            <div className="rounded-2xl border border-border bg-background p-10 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                <LayoutDashboard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold">No Activity Yet</div>
                <p className="text-xs text-muted-foreground">Orders and inventory stats will appear here as they happen.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-3">
                <StatCard 
                  title="Today’s Orders" 
                  value={todaysOrdersCount} 
                  icon={ShoppingBag} 
                  className="min-h-[112px] border-none bg-primary/5 hover:bg-primary/10 transition-colors" 
                />
                <StatCard 
                  title="Today’s Revenue" 
                  value={`₹${formatINR(todaysRevenue)}`} 
                  icon={TrendingUp} 
                  className="min-h-[112px] border-none bg-green-500/5 hover:bg-green-500/10 transition-colors" 
                />
                <StatCard 
                  title="Pending Orders" 
                  value={pendingOrdersCount} 
                  icon={ShoppingBag} 
                  className="min-h-[112px] border-none bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors" 
                />
                <StatCard 
                  title="Low Stock" 
                  value={lowStockCount} 
                  icon={Package} 
                  className="min-h-[112px] border-none bg-destructive/5 hover:bg-destructive/10 transition-colors" 
                />
              </div>

              {/* Recent Orders - Card Based */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Orders</h2>
                  <Button variant="link" size="sm" onClick={() => navigate("/admin/orders")} className="h-auto p-0 text-xs">View All</Button>
                </div>
                
                {recentOrders.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4 bg-secondary/20 rounded-xl">No recent orders.</div>
                ) : (
                  <div className="space-y-3">
                    {recentOrders.map((o) => {
                      const status = normalizeStatus(o.status);
                      return (
                        <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm active:scale-[0.98] transition-transform" onClick={() => navigate("/admin/orders")}>
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="text-sm font-bold">#{o.order_number || o.id.slice(0, 8)}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">{timeAgo(o.created_at)}</div>
                            </div>
                            <Badge className={cn("text-[10px] uppercase font-bold px-2 py-0.5", statusBadgeClassName(status))} style={statusBadgeStyle(status)}>
                              {status}
                            </Badge>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-lg font-black">₹{formatINR(normalizeTotal(o.total))}</div>
                            <Button size="sm" variant="secondary" className="h-8 rounded-full text-[10px] font-bold uppercase">Details</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Critical Attention */}
              {attentionOrders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Needs Attention</h2>
                  </div>
                  <div className="space-y-2">
                    {attentionOrders.slice(0, 3).map((o) => (
                      <div key={o.id} className="rounded-xl border border-destructive/10 bg-destructive/5 p-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">Order #{o.order_number || o.id.slice(0, 8)}</div>
                          <div className="text-[10px] text-destructive/70 font-medium">Stale: {timeAgo(o.created_at)}</div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full text-destructive" onClick={() => navigate("/admin/orders")}>
                          <Plus className="h-4 w-4 rotate-45" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Hub */}
              <div className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => navigate("/admin/products")} className="h-20 flex-col gap-1 rounded-2xl bg-background border-border hover:bg-accent text-foreground shadow-sm">
                    <Plus className="h-5 w-5 text-primary" />
                    <span className="text-[10px] font-bold uppercase">Add Lungi</span>
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/orders")} className="h-20 flex-col gap-1 rounded-2xl bg-background border-border shadow-sm">
                    <ShoppingBag className="h-5 w-5 text-green-500" />
                    <span className="text-[10px] font-bold uppercase">Orders</span>
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/marketing")} className="h-20 flex-col gap-1 rounded-2xl bg-background border-border shadow-sm">
                    <Megaphone className="h-5 w-5 text-orange-500" />
                    <span className="text-[10px] font-bold uppercase">Marketing</span>
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/admin/messages")} className="h-20 flex-col gap-1 rounded-2xl bg-background border-border shadow-sm">
                    <MessageSquare className="h-5 w-5 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase">Messages</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Mobile Admin Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-md mx-auto rounded-2xl border border-border bg-background/90 backdrop-blur-xl shadow-2xl p-1 grid grid-cols-5">
            <NavLink 
              to="/admin/dashboard" 
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase mt-1">Home</span>
            </NavLink>
            <NavLink 
              to="/admin/orders" 
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase mt-1">Orders</span>
            </NavLink>
            <NavLink 
              to="/admin/products" 
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Package className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase mt-1">Lungi</span>
            </NavLink>
            <NavLink 
              to="/admin/sales-analytics" 
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center py-2 rounded-xl transition-all",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
              )}
            >
              <BarChart3 className="h-5 w-5" />
              <span className="text-[8px] font-bold uppercase mt-1">Sales</span>
            </NavLink>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex flex-col items-center justify-center py-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
                  <LogOut className="h-5 w-5" />
                  <span className="text-[8px] font-bold uppercase mt-1">Exit</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[90%] max-w-sm rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Admin Logout</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to sign out of the admin panel?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 mt-4">
                  <AlertDialogAction onClick={handleLogout} disabled={logoutBusy} className="w-full h-12 rounded-xl">Logout</AlertDialogAction>
                  <AlertDialogCancel className="w-full h-12 rounded-xl border-none">Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="admin-dashboard p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Quick overview of orders, revenue, customers, and inventory.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchDashboard()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm font-medium">Failed to load dashboard</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      ) : empty ? (
        <div className="rounded-md border border-border bg-background p-8 text-center">
          <div className="text-sm font-medium">No dashboard data yet</div>
          <div className="text-sm text-muted-foreground">Once orders and products are added, you’ll see a live overview here.</div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Today’s Orders" value={todaysOrdersCount} icon={ShoppingBag} />
            <StatCard title="Today’s Revenue" value={`₹${formatINR(todaysRevenue)}`} icon={TrendingUp} />
            <StatCard title="Pending Orders" value={pendingOrdersCount} icon={ShoppingBag} />
            <StatCard title="Low Stock Products" value={lowStockCount} icon={Package} />
          </div>

          <div className="grid gap-6">
            <ChartCard title="Recent Orders" subtitle="Latest 10">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => navigate("/admin/orders")}>
                  Go to Orders Page
                </Button>
              </div>

              {recentOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No orders found.</div>
              ) : (
                <div className="rounded-md border border-border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total (₹)</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentOrders.map((o) => {
                        const status = normalizeStatus(o.status);
                        return (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">{o.order_number || "-"}</TableCell>
                            <TableCell>
                              <Badge className={statusBadgeClassName(status)} style={statusBadgeStyle(status)}>
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatINR(normalizeTotal(o.total))}</TableCell>
                            <TableCell>{formatDateTime(o.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button type="button" variant="outline" size="sm" onClick={() => navigate("/admin/orders")}>
                                View Order
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title="Orders Requiring Attention" subtitle="Stale orders by status & age">
              {attentionOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No orders currently require attention.</div>
              ) : (
                <div className="rounded-md border border-border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attentionOrders.map((o) => {
                        const status = normalizeStatus(o.status);
                        return (
                          <TableRow key={o.id} className="bg-yellow-500/10">
                            <TableCell className="font-medium">{o.order_number || "-"}</TableCell>
                            <TableCell>
                              <Badge className={statusBadgeClassName(status)} style={statusBadgeStyle(status)}>
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell>{timeAgo(o.created_at)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Inventory Alerts" subtitle="Low stock and out of stock">
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium">Out of Stock</div>
                  {outOfStockProducts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">None</div>
                  ) : (
                    <div className="rounded-md border border-border bg-background mt-2">
                      <Table>
                        <TableBody>
                          {outOfStockProducts.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-right font-semibold text-destructive">0</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium">Low Stock</div>
                  {lowStockProducts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">None</div>
                  ) : (
                    <div className="rounded-md border border-border bg-background mt-2">
                      <Table>
                        <TableBody>
                          {lowStockProducts.map((p) => {
                            const critical = p.stock_quantity <= 5;
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-right">
                                  <span className={critical ? "font-semibold text-destructive" : ""}>{p.stock_quantity}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div>
                  <Button type="button" variant="outline" onClick={() => navigate("/admin/products")}>
                    Update Stock
                  </Button>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Customer Activity" subtitle="Recent registrations & orders">
              {activityFeed.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent activity.</div>
              ) : (
                <div className="space-y-3">
                  {activityFeed.map((a, idx) => (
                    <div key={`${a.type}-${a.created_at}-${idx}`} className="rounded-md border border-border bg-background p-3">
                      <div className="text-sm font-medium">
                        {a.type === "user_registered"
                          ? "New user registered"
                          : a.type === "first_order"
                            ? "First order placed"
                            : "Repeat customer order"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {timeAgo(a.created_at)} · {a.type === "user_registered" ? a.user_id : `${a.user_id} · ${a.order_number ?? "-"}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title="Quick Admin Actions" subtitle="Navigation hub">
              <div className="grid gap-2">
                <Button type="button" onClick={() => navigate("/admin/products")}>
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/orders")}>
                  <ShoppingBag className="h-4 w-4" />
                  View Orders
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/sales-analytics")}>
                  <BarChart3 className="h-4 w-4" />
                  Sales Analytics
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/marketing")}>
                  <Megaphone className="h-4 w-4" />
                  Marketing
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/messages")}>
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </Button>
              </div>
            </ChartCard>

            <ChartCard title="System Health & Store Status" subtitle="Quick status checks">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Store status</div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Last order time</div>
                  <div className="font-medium">{formatDateTime(lastOrderTime)}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Last product added</div>
                  <div className="font-medium">{formatDateTime(lastProductAddedTime)}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Total active products</div>
                  <div className="font-medium">{totalActiveProducts}</div>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
