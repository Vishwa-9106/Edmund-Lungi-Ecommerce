import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";

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
      const compact = mobileMq.matches || (standaloneMq.matches && tabletMq.matches);
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

  const empty = !loading && !error && todaysOrdersCount === 0 && recentOrders.length === 0;

  if (useCompactLayout) {
    return (
      <div className="admin-dashboard p-4 sm:p-6">
        <div className="mb-4 space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Quick overview</p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchDashboard()}
            disabled={loading}
            className="w-full h-12"
          >
            Refresh
          </Button>
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
          <div className="rounded-md border border-border bg-background p-6 text-center">
            <div className="text-sm font-medium">No dashboard data yet</div>
            <div className="text-sm text-muted-foreground">
              Once orders and products are added, you’ll see a live overview here.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <StatCard title="Today’s Orders" value={todaysOrdersCount} icon={ShoppingBag} className="min-h-[112px]" />
              <StatCard title="Today’s Revenue" value={`₹${formatINR(todaysRevenue)}`} icon={TrendingUp} className="min-h-[112px]" />
              <StatCard title="Pending Orders" value={pendingOrdersCount} icon={ShoppingBag} className="min-h-[112px]" />
              <StatCard title="Low Stock Products" value={lowStockCount} icon={Package} className="min-h-[112px]" />
            </div>

            <ChartCard title="Recent Orders" subtitle="Latest 10">
              <div className="mb-3">
                <Button type="button" variant="outline" onClick={() => navigate("/admin/orders")} className="w-full h-12">
                  Go to Orders Page
                </Button>
              </div>

              {recentOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No orders found.</div>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((o) => {
                    const status = normalizeStatus(o.status);
                    return (
                      <div key={o.id} className="rounded-md border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" title={o.order_number || o.id}>
                              {o.order_number ? `Order #${o.order_number}` : `Order #${o.id}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{formatDateTime(o.created_at)}</div>
                          </div>
                          <Badge className={statusBadgeClassName(status)} style={statusBadgeStyle(status)}>
                            {status}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">₹{formatINR(normalizeTotal(o.total))}</div>
                          <Button type="button" variant="outline" size="sm" className="h-12" onClick={() => navigate("/admin/orders")}>
                            View
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Orders Requiring Attention" subtitle="Stale orders by status & age">
              {attentionOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No orders currently require attention.</div>
              ) : (
                <div className="space-y-3">
                  {attentionOrders.map((o) => {
                    const status = normalizeStatus(o.status);
                    return (
                      <div key={o.id} className="rounded-md border border-border bg-yellow-500/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" title={o.order_number || o.id}>
                              {o.order_number ? `Order #${o.order_number}` : `Order #${o.id}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{timeAgo(o.created_at)}</div>
                          </div>
                          <Badge className={statusBadgeClassName(status)} style={statusBadgeStyle(status)}>
                            {status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
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
                    <div className="mt-2 space-y-2">
                      {outOfStockProducts.map((p) => (
                        <div key={p.id} className="rounded-md border border-border bg-background p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 text-sm font-medium truncate" title={p.name}>
                              {p.name}
                            </div>
                            <div className="text-sm font-semibold text-destructive">0</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium">Low Stock</div>
                  {lowStockProducts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">None</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {lowStockProducts.map((p) => {
                        const critical = p.stock_quantity <= 5;
                        return (
                          <div key={p.id} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 text-sm font-medium truncate" title={p.name}>
                                {p.name}
                              </div>
                              <div className={critical ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
                                {p.stock_quantity}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button type="button" variant="outline" onClick={() => navigate("/admin/products")} className="w-full h-12">
                  Update Stock
                </Button>
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

            <ChartCard title="Quick Admin Actions" subtitle="Navigation hub">
              <div className="grid gap-2">
                <Button type="button" onClick={() => navigate("/admin/products")} className="h-12 justify-start gap-2">
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/orders")} className="h-12 justify-start gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  View Orders
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/sales-analytics")}
                  className="h-12 justify-start gap-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  Sales Analytics
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/marketing")} className="h-12 justify-start gap-2">
                  <Megaphone className="h-4 w-4" />
                  Marketing
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/admin/messages")} className="h-12 justify-start gap-2">
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
                  <div className="font-medium text-right">{formatDateTime(lastOrderTime)}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Last product added</div>
                  <div className="font-medium text-right">{formatDateTime(lastProductAddedTime)}</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-muted-foreground">Total active products</div>
                  <div className="font-medium">{totalActiveProducts}</div>
                </div>
              </div>
            </ChartCard>
          </div>
        )}
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
