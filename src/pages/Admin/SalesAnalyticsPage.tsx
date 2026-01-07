import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/supabase";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ChartCard";
import { StatCard } from "@/components/StatCard";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  DollarSign,
  Package,
  Percent,
  ShoppingBag,
  TrendingUp,
  Users,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  BarChart3,
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

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string | null;
  status: string | null;
  total: number | string | null;
  currency: string | null;
  items: unknown;
  created_at: string;
};

type OrderItem = {
  product_id?: string;
  productId?: string;
  id?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  price?: number;
};

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  material: string | null;
};

type PeriodPreset = "today" | "7d" | "30d";
type TrendMetric = "revenue" | "orders";

const ORDER_STATUS_COLORS: Record<string, string> = {
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

function isoDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatINR(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function normalizeTotal(total: number | string | null) {
  const n = typeof total === "string" ? Number(total) : total;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function parseItems(raw: unknown): Array<{ productId: string; name: string; quantity: number; price: number }> {
  if (!Array.isArray(raw)) return [];

  return (raw as OrderItem[])
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const productId = String(x.product_id ?? x.productId ?? x.id ?? "").trim();
      const name = String(x.name ?? "").trim();
      const quantity = Number(x.quantity ?? x.qty ?? 0);
      const price = Number(x.price ?? 0);
      return { productId, name, quantity, price };
    })
    .filter((x) => x.productId.length > 0)
    .filter((x) => x.name.length > 0)
    .filter((x) => Number.isFinite(x.quantity) && x.quantity > 0)
    .filter((x) => Number.isFinite(x.price) && x.price >= 0);
}

function buildCsv(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/\"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SalesAnalyticsPage() {
  const navigate = useNavigate();
  const [useCompactLayout, setUseCompactLayout] = useState(false);

  useEffect(() => {
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const mobileMq = window.matchMedia("(max-width: 768px)");

    const recompute = () => {
      setUseCompactLayout(mobileMq.matches || standaloneMq.matches);
    };

    recompute();
    standaloneMq.addEventListener("change", recompute);
    mobileMq.addEventListener("change", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      standaloneMq.removeEventListener("change", recompute);
      mobileMq.removeEventListener("change", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [metric, setMetric] = useState<TrendMetric>("revenue");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [prevDeliveredTotals, setPrevDeliveredTotals] = useState<number[]>([]);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const { rangeStart, rangeEnd, prevStart, prevEnd } = useMemo(() => {
    const today = startOfDay(new Date());
    const end = addDays(today, 1);
    const days = preset === "today" ? 1 : preset === "7d" ? 7 : 30;
    const start = addDays(end, -days);
    const prevEnd = start;
    const prevStart = addDays(prevEnd, -days);
    return { rangeStart: start, rangeEnd: end, prevStart, prevEnd };
  }, [preset]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const startIso = rangeStart.toISOString();
    const endIso = rangeEnd.toISOString();
    const prevStartIso = prevStart.toISOString();
    const prevEndIso = prevEnd.toISOString();

    try {
      const [{ data: ordersData, error: ordersErr }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,user_id,order_number,status,total,currency,items,created_at")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .order("created_at", { ascending: true }),
      ]);

      if (ordersErr) throw ordersErr;

      const allOrders = (Array.isArray(ordersData) ? (ordersData as OrderRow[]) : []) ?? [];
      const delivered = allOrders.filter((o) => String(o.status ?? "").trim() === "Delivered");

      setOrders(allOrders);
      setDeliveredOrders(delivered);

      const { data: prevDelivered, error: prevErr } = await supabase
        .from("orders")
        .select("total")
        .eq("status", "Delivered")
        .gte("created_at", prevStartIso)
        .lt("created_at", prevEndIso);
      if (prevErr) throw prevErr;
      const totals = (Array.isArray(prevDelivered) ? (prevDelivered as any[]) : []).map((r) => normalizeTotal(r?.total ?? 0));
      setPrevDeliveredTotals(totals);

      const productIds = Array.from(
        new Set(
          delivered
            .flatMap((o) => parseItems(o.items))
            .map((it) => it.productId)
            .filter((id) => id.length > 0)
        )
      );

      if (productIds.length === 0) {
        setProducts([]);
      } else {
        const { data: productRows, error: prodErr } = await supabase
          .from("products")
          .select("id,name,category,material")
          .in("id", productIds);
        if (prodErr) throw prodErr;
        setProducts((Array.isArray(productRows) ? (productRows as ProductRow[]) : []) ?? []);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load analytics");
      setOrders([]);
      setDeliveredOrders([]);
      setProducts([]);
      setPrevDeliveredTotals([]);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, prevStart, prevEnd]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const deliveredRevenue = useMemo(() => {
    return deliveredOrders.reduce((sum, o) => sum + normalizeTotal(o.total), 0);
  }, [deliveredOrders]);

  const deliveredOrdersCount = deliveredOrders.length;
  const totalOrdersCount = orders.length;

  const totalItemsSold = useMemo(() => {
    return deliveredOrders.reduce((sum, o) => {
      const items = parseItems(o.items);
      return sum + items.reduce((s, it) => s + it.quantity, 0);
    }, 0);
  }, [deliveredOrders]);

  const avgOrderValue = useMemo(() => {
    if (deliveredOrdersCount === 0) return 0;
    return deliveredRevenue / deliveredOrdersCount;
  }, [deliveredRevenue, deliveredOrdersCount]);

  const prevDeliveredRevenue = useMemo(() => prevDeliveredTotals.reduce((s, x) => s + x, 0), [prevDeliveredTotals]);
  const revenueGrowthPct = useMemo(() => {
    if (prevDeliveredRevenue <= 0) {
      if (deliveredRevenue <= 0) return 0;
      return 100;
    }
    return ((deliveredRevenue - prevDeliveredRevenue) / prevDeliveredRevenue) * 100;
  }, [deliveredRevenue, prevDeliveredRevenue]);

  const trendData = useMemo(() => {
    const start = rangeStart;
    const end = rangeEnd;
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));

    const base = new Map<string, { date: string; revenue: number; orders: number }>();
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const key = isoDateKey(d);
      base.set(key, { date: key, revenue: 0, orders: 0 });
    }

    for (const o of orders) {
      const key = String(o.created_at ?? "").slice(0, 10);
      const bucket = base.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
    }

    for (const o of deliveredOrders) {
      const key = String(o.created_at ?? "").slice(0, 10);
      const bucket = base.get(key);
      if (!bucket) continue;
      bucket.revenue += normalizeTotal(o.total);
    }

    return Array.from(base.values());
  }, [orders, deliveredOrders, rangeStart, rangeEnd]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      const s = String(o.status ?? "Pending").trim() || "Pending";
      map[s] = (map[s] ?? 0) + 1;
    }

    return Object.entries(map)
      .map(([status, count]) => ({
        status,
        count,
        fill: ORDER_STATUS_COLORS[status] ?? "hsl(var(--muted-foreground))",
      }))
      .filter((x) => x.count > 0);
  }, [orders]);

  const deliveredPct = useMemo(() => {
    if (totalOrdersCount === 0) return 0;
    const delivered = statusBreakdown.find((x) => x.status === "Delivered")?.count ?? 0;
    return (delivered / totalOrdersCount) * 100;
  }, [statusBreakdown, totalOrdersCount]);

  const cancelledPct = useMemo(() => {
    if (totalOrdersCount === 0) return 0;
    const cancelled = statusBreakdown.find((x) => x.status === "Cancelled")?.count ?? 0;
    return (cancelled / totalOrdersCount) * 100;
  }, [statusBreakdown, totalOrdersCount]);

  const productById = useMemo(() => {
    return new Map(products.map((p) => [String(p.id), p] as const));
  }, [products]);

  const productPerformance = useMemo(() => {
    const byProduct = new Map<string, { productId: string; name: string; units: number; revenue: number }>();

    for (const o of deliveredOrders) {
      for (const it of parseItems(o.items)) {
        const existing = byProduct.get(it.productId);
        const name = productById.get(it.productId)?.name ?? it.name;
        const deltaRevenue = it.quantity * it.price;
        if (!existing) {
          byProduct.set(it.productId, { productId: it.productId, name, units: it.quantity, revenue: deltaRevenue });
        } else {
          existing.units += it.quantity;
          existing.revenue += deltaRevenue;
          existing.name = existing.name || name;
        }
      }
    }

    const all = Array.from(byProduct.values());
    const top = [...all].sort((a, b) => b.units - a.units).slice(0, 5);
    const least = [...all].sort((a, b) => a.units - b.units).slice(0, 5);
    return { top, least, all };
  }, [deliveredOrders, productById]);

  const categoryMaterialAnalytics = useMemo(() => {
    const categoryRevenue: Record<string, number> = {};
    const materialRevenue: Record<string, number> = {};

    for (const o of deliveredOrders) {
      for (const it of parseItems(o.items)) {
        const p = productById.get(it.productId);
        if (!p) continue;
        const revenue = it.quantity * it.price;
        const category = String(p.category ?? "Uncategorized");
        const material = String(p.material ?? "Unknown");
        categoryRevenue[category] = (categoryRevenue[category] ?? 0) + revenue;
        materialRevenue[material] = (materialRevenue[material] ?? 0) + revenue;
      }
    }

    return {
      categories: Object.entries(categoryRevenue).map(([name, value]) => ({ name, value })),
      materials: Object.entries(materialRevenue).map(([name, value]) => ({ name, value })),
    };
  }, [deliveredOrders, productById]);

  const ordersByUserInRange = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const uid = String(o.user_id ?? "").trim();
      if (!uid) continue;
      map.set(uid, (map.get(uid) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  const uniqueCustomersInRange = ordersByUserInRange.size;

  const avgOrdersPerUserInRange = useMemo(() => {
    if (uniqueCustomersInRange === 0) return 0;
    return totalOrdersCount / uniqueCustomersInRange;
  }, [totalOrdersCount, uniqueCustomersInRange]);

  const [newCustomers, setNewCustomers] = useState(0);
  const [returningCustomers, setReturningCustomers] = useState(0);

  useEffect(() => {
    let alive = true;
    const startIso = rangeStart.toISOString();

    (async () => {
      const usersWithOrdersInRange = Array.from(ordersByUserInRange.keys());
      if (usersWithOrdersInRange.length === 0) {
        if (alive) setNewCustomers(0);
        if (alive) setReturningCustomers(0);
        return;
      }

      const { data: priorRows, error } = await supabase
        .from("orders")
        .select("user_id")
        .in("user_id", usersWithOrdersInRange)
        .lt("created_at", startIso);

      if (!alive) return;
      if (error) {
        setNewCustomers(0);
        setReturningCustomers(0);
        return;
      }

      const priorSet = new Set((Array.isArray(priorRows) ? priorRows : []).map((r: any) => String(r.user_id)));
      const newCount = usersWithOrdersInRange.filter((id) => !priorSet.has(String(id))).length;
      const returningCount = usersWithOrdersInRange.filter((id) => priorSet.has(String(id))).length;
      setNewCustomers(newCount);
      setReturningCustomers(returningCount);
    })();

    return () => {
      alive = false;
    };
  }, [ordersByUserInRange, rangeStart]);

  const handleExportCsv = () => {
    const rows = orders.map((o) => ({
      order_number: o.order_number ?? "",
      date: o.created_at,
      status: o.status ?? "",
      total: normalizeTotal(o.total),
      user_id: o.user_id,
    }));

    const csv = buildCsv(rows);
    const filename = `sales-${isoDateKey(rangeStart)}-to-${isoDateKey(addDays(rangeEnd, -1))}.csv`;
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  };

  const trendConfig = useMemo(
    () => ({
      revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
      orders: { label: "Orders", color: "hsl(var(--chart-2))" },
    }),
    []
  );

  const statusConfig = useMemo(
    () => ({
      count: { label: "Orders", color: "hsl(var(--chart-1))" },
    }),
    []
  );

  const categoryConfig = useMemo(
    () => ({
      value: { label: "Revenue", color: "hsl(var(--chart-1))" },
    }),
    []
  );

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

  const empty = !loading && !error && orders.length === 0;

  if (useCompactLayout) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+80px)]">
        {/* Minimal Header */}
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sales Analytics</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Live Insights</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void fetchData()}
            disabled={loading}
            className="rounded-full hover:bg-accent"
          >
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </Button>
        </header>

        {/* Sticky Filters */}
        <div className="sticky top-16 z-30 w-full bg-background/95 backdrop-blur border-b border-border px-4 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            <Button
              type="button"
              variant={preset === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("today")}
              className="rounded-full h-10 px-6 text-xs font-bold uppercase"
            >
              Today
            </Button>
            <Button
              type="button"
              variant={preset === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("7d")}
              className="rounded-full h-10 px-6 text-xs font-bold uppercase"
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant={preset === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("30d")}
              className="rounded-full h-10 px-6 text-xs font-bold uppercase"
            >
              Last 30 days
            </Button>
          </div>
        </div>

        <main className="flex-1 p-4 space-y-4 max-w-md mx-auto w-full">
          {loading ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">Fetching analytics...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
              <div className="text-sm font-semibold text-destructive">Failed to load analytics</div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchData()}>Retry</Button>
            </div>
          ) : empty ? (
            <div className="rounded-2xl border border-border bg-background p-10 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold">No Data for this Period</div>
                <p className="text-xs text-muted-foreground">Sales activity will appear here once orders are placed.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPI Cards Stacked */}
              <div className="space-y-3">
                <StatCard
                  title="Total Revenue"
                  value={`₹${formatINR(deliveredRevenue)}`}
                  change={Math.round(revenueGrowthPct * 10) / 10}
                  icon={DollarSign}
                  className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                />
                <StatCard 
                  title="Total Orders" 
                  value={totalOrdersCount} 
                  icon={ShoppingBag} 
                  className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                />
                <StatCard 
                  title="Average Order Value" 
                  value={`₹${formatINR(avgOrderValue)}`} 
                  icon={TrendingUp} 
                  className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                />
                <StatCard 
                  title="Total Items Sold" 
                  value={totalItemsSold} 
                  icon={Package} 
                  className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                />
                <StatCard 
                  title="Delivered %" 
                  value={`${formatINR(deliveredPct)}%`} 
                  icon={Percent} 
                  className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm"
                />
              </div>

              {/* Export Button */}
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-14 rounded-2xl border-2 font-bold uppercase text-xs"
                onClick={handleExportCsv} 
                disabled={orders.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV Report
              </Button>

              {/* Charts (Responsive) */}
              <div className="space-y-6">
                <ChartCard title="Sales Trend" subtitle="Revenue (Delivered) vs Orders.">
                  <div className="mb-4 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={metric === "revenue" ? "default" : "outline"}
                      onClick={() => setMetric("revenue")}
                      className="rounded-full h-8 px-4 text-[10px] font-bold uppercase"
                    >
                      Revenue
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={metric === "orders" ? "default" : "outline"}
                      onClick={() => setMetric("orders")}
                      className="rounded-full h-8 px-4 text-[10px] font-bold uppercase"
                    >
                      Orders
                    </Button>
                  </div>

                  <ChartContainer config={trendConfig} className="h-[200px]">
                    <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      {metric === "revenue" ? (
                        <Area
                          dataKey="revenue"
                          type="monotone"
                          stroke="var(--color-revenue)"
                          fill="var(--color-revenue)"
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      ) : (
                        <Area
                          dataKey="orders"
                          type="monotone"
                          stroke="var(--color-orders)"
                          fill="var(--color-orders)"
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      )}
                    </AreaChart>
                  </ChartContainer>
                </ChartCard>

                <ChartCard title="Order Status" subtitle={`Delivered: ${formatINR(deliveredPct)}%`}>
                  <ChartContainer config={statusConfig} className="h-[240px]">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      <Pie
                        data={statusBreakdown}
                        dataKey="count"
                        nameKey="status"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                      >
                        {statusBreakdown.map((entry) => (
                          <Cell key={entry.status} fill={(entry as any).fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </ChartCard>

                <div className="space-y-4">
                  <StatCard title="New Customers" value={newCustomers} icon={Users} className="rounded-2xl border border-border bg-card p-5 shadow-sm" />
                  <StatCard title="Returning Customers" value={returningCustomers} icon={Users} className="rounded-2xl border border-border bg-card p-5 shadow-sm" />
                  <StatCard title="Avg Orders / User" value={formatINR(avgOrdersPerUserInRange)} icon={Users} className="rounded-2xl border border-border bg-card p-5 shadow-sm" />
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
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Analytics</h1>
          <p className="text-sm text-muted-foreground">Live insights from Supabase orders, products, and customers.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={preset === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              variant={preset === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("7d")}
            >
              Last 7 days
            </Button>
            <Button
              type="button"
              variant={preset === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset("30d")}
            >
              Last 30 days
            </Button>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv} disabled={orders.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm font-medium">Failed to load analytics</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      ) : empty ? (
        <div className="rounded-md border border-border bg-background p-8 text-center">
          <div className="text-sm font-medium">No data for this period</div>
          <div className="text-sm text-muted-foreground">Orders will appear here once customers start placing them.</div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="Total Revenue"
              value={`₹${formatINR(deliveredRevenue)}`}
              change={Math.round(revenueGrowthPct * 10) / 10}
              icon={DollarSign}
            />
            <StatCard title="Total Orders" value={totalOrdersCount} icon={ShoppingBag} />
            <StatCard title="Average Order Value" value={`₹${formatINR(avgOrderValue)}`} icon={TrendingUp} />
            <StatCard title="Total Items Sold" value={totalItemsSold} icon={Package} />
            <StatCard title="Delivered %" value={`${formatINR(deliveredPct)}%`} icon={Percent} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Sales Trend" subtitle="Revenue uses Delivered orders only. Orders count includes all statuses.">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={metric === "revenue" ? "default" : "outline"}
                    onClick={() => setMetric("revenue")}
                  >
                    Revenue
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={metric === "orders" ? "default" : "outline"}
                    onClick={() => setMetric("orders")}
                  >
                    Orders
                  </Button>
                </div>

                <ChartContainer config={trendConfig}>
                  <AreaChart data={trendData} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} width={60} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {metric === "revenue" ? (
                      <Area
                        dataKey="revenue"
                        type="monotone"
                        stroke="var(--color-revenue)"
                        fill="var(--color-revenue)"
                        fillOpacity={0.15}
                      />
                    ) : (
                      <Area
                        dataKey="orders"
                        type="monotone"
                        stroke="var(--color-orders)"
                        fill="var(--color-orders)"
                        fillOpacity={0.15}
                      />
                    )}
                  </AreaChart>
                </ChartContainer>
              </ChartCard>
            </div>

            <ChartCard title="Order Status Breakdown" subtitle={`Delivered: ${formatINR(deliveredPct)}% · Cancelled: ${formatINR(cancelledPct)}%`}>
              <ChartContainer config={statusConfig} className="max-h-[320px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                  <Pie
                    data={statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={55}
                    outerRadius={90}
                    strokeWidth={2}
                  >
                    {statusBreakdown.map((entry) => (
                      <Cell key={entry.status} fill={(entry as any).fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Top Products" subtitle="Top 5 products by units sold (Delivered orders only).">
              {productPerformance.top.length === 0 ? (
                <div className="text-sm text-muted-foreground">No delivered items for this period.</div>
              ) : (
                <div className="space-y-3">
                  {productPerformance.top.map((p) => (
                    <div key={p.productId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={p.name}>
                          {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p.productId}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{p.units} units</div>
                        <div className="text-xs text-muted-foreground">₹{formatINR(p.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Least Products" subtitle="Least 5 products by units sold (Delivered orders only).">
              {productPerformance.least.length === 0 ? (
                <div className="text-sm text-muted-foreground">No delivered items for this period.</div>
              ) : (
                <div className="space-y-3">
                  {productPerformance.least.map((p) => (
                    <div key={p.productId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={p.name}>
                          {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p.productId}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{p.units} units</div>
                        <div className="text-xs text-muted-foreground">₹{formatINR(p.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Revenue by Category" subtitle="Delivered orders only.">
              {categoryMaterialAnalytics.categories.length === 0 ? (
                <div className="text-sm text-muted-foreground">No category revenue for this period.</div>
              ) : (
                <ChartContainer config={categoryConfig} className="max-h-[340px]">
                  <BarChart data={categoryMaterialAnalytics.categories} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickLine={false} axisLine={false} width={70} />
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </ChartCard>

            <ChartCard title="Revenue by Material" subtitle="Delivered orders only.">
              {categoryMaterialAnalytics.materials.length === 0 ? (
                <div className="text-sm text-muted-foreground">No material revenue for this period.</div>
              ) : (
                <ChartContainer config={categoryConfig} className="max-h-[340px]">
                  <BarChart data={categoryMaterialAnalytics.materials} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickLine={false} axisLine={false} width={70} />
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="New Customers" value={newCustomers} icon={Users} />
            <StatCard title="Returning Customers" value={returningCustomers} icon={Users} />
            <StatCard title="Avg Orders / User" value={formatINR(avgOrdersPerUserInRange)} icon={Users} />
          </div>
        </div>
      )}
    </div>
  );
}
