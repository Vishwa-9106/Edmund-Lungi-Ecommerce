import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { supabase } from "@/supabase";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ShoppingBag,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderStatus = "Pending" | "Confirmed" | "Processing" | "Shipped" | "Delivered" | "Completed" | "Cancelled";

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string;
  status: string | null;
  total: number | string | null;
  currency: string | null;
  items: unknown;
  created_at: string;
};

type UserEmailById = Record<string, string>;

type UserDetails = {
  id: string;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
};

type ProductDetails = {
  id: string;
  name: string;
  image_url: string | null;
};

type NormalizedOrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type OrderModalData = {
  loading: boolean;
  error: string | null;
  user: UserDetails | null;
  items: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
};

const ALL_STATUSES: OrderStatus[] = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Completed", "Cancelled"];

function normalizeStatus(status: string | null | undefined): OrderStatus {
  if (!status) return "Pending";
  const normalized = status.trim().toLowerCase();
  const match = ALL_STATUSES.find((s) => s.toLowerCase() === normalized);
  return match ?? "Pending";
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatMoney(total: number | string | null, currency: string | null) {
  const n = typeof total === "string" ? Number(total) : total;
  if (typeof n !== "number" || Number.isNaN(n)) return "-";
  if (!currency) return n.toFixed(2);
  return `${n.toFixed(2)}`;
}

function parseOrderItems(raw: unknown): NormalizedOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const productId = String((x as any).id ?? (x as any).productId ?? "").trim();
      const name = String((x as any).name ?? "").trim();
      const price = Number((x as any).price ?? 0);
      const quantity = Number((x as any).quantity ?? (x as any).qty ?? 0);
      return {
        productId,
        name,
        price,
        quantity,
      };
    })
    .filter((x) => x.productId.length > 0)
    .filter((x) => x.name.length > 0)
    .filter((x) => Number.isFinite(x.price) && x.price >= 0)
    .filter((x) => Number.isFinite(x.quantity) && x.quantity > 0);
}

function statusBadgeVariant(status: OrderStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Confirmed":
      return "secondary";
    case "Delivered":
      return "default";
    case "Completed":
      return "default";
    case "Shipped":
      return "secondary";
    case "Processing":
      return "outline";
    case "Cancelled":
      return "destructive";
    case "Pending":
    default:
      return "outline";
  }
}

export default function OrdersPage() {
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

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<UserEmailById>({});
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderModalCache, setOrderModalCache] = useState<Record<string, OrderModalData>>({});

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("id, user_id, order_number, status, total, currency, items, created_at")
        .order("created_at", { ascending: false });

      if (fetchError) {
        setOrders([]);
        setError(fetchError.message || "Failed to load orders");
        return;
      }

      const rows = Array.isArray(data) ? (data as OrderRow[]) : [];
      setOrders(rows);
    } catch (e: any) {
      setOrders([]);
      setError(e?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => o.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  const ensureModalDataLoaded = useCallback(
    async (order: OrderRow) => {
      const existing = orderModalCache[order.id];
      if (existing && !existing.error && existing.items.length > 0) return;

      setOrderModalCache((prev) => ({
        ...prev,
        [order.id]: {
          loading: true,
          error: null,
          user: prev[order.id]?.user ?? null,
          items: prev[order.id]?.items ?? [],
        },
      }));

      try {
        const parsedItems = parseOrderItems(order.items);
        const productIds = Array.from(new Set(parsedItems.map((x) => x.productId)));

        const [{ data: userRow }, { data: productRows, error: productErr }] = await Promise.all([
          supabase
            .from("users")
            .select("id, name, email, mobile")
            .eq("id", order.user_id)
            .maybeSingle(),
          productIds.length === 0
            ? Promise.resolve({ data: [] as any[], error: null as any })
            : supabase
                .from("products")
                .select("id, name, image_url")
                .in("id", productIds),
        ]);

        if (productErr) throw productErr;

        const productById = new Map(
          (Array.isArray(productRows) ? (productRows as ProductDetails[]) : []).map((p) => [String(p.id), p] as const),
        );

        const hydratedItems = parsedItems.map((it) => {
          const p = productById.get(it.productId);
          const imageUrl = p?.image_url ?? null;
          const name = (p?.name ?? it.name).toString();
          const subtotal = it.price * it.quantity;
          return {
            productId: it.productId,
            name,
            imageUrl,
            price: it.price,
            quantity: it.quantity,
            subtotal,
          };
        });

        const user: UserDetails | null = userRow
          ? {
              id: String((userRow as any).id),
              name: (userRow as any).name ?? null,
              email: (userRow as any).email ?? null,
              mobile: (userRow as any).mobile ?? null,
            }
          : null;

        setOrderModalCache((prev) => ({
          ...prev,
          [order.id]: {
            loading: false,
            error: null,
            user,
            items: hydratedItems,
          },
        }));
      } catch (e: any) {
        setOrderModalCache((prev) => ({
          ...prev,
          [order.id]: {
            loading: false,
            error: e?.message || "Failed to load order items",
            user: prev[order.id]?.user ?? null,
            items: prev[order.id]?.items ?? [],
          },
        }));
      }
    },
    [orderModalCache],
  );

  useEffect(() => {
    let alive = true;
    if (userIds.length === 0) return;

    (async () => {
      try {
        const { data, error: usersError } = await supabase
          .from("users")
          .select("id, email")
          .in("id", userIds);

        if (!alive) return;
        if (usersError) return;

        const map: UserEmailById = {};
        for (const row of Array.isArray(data) ? (data as any[]) : []) {
          if (row?.id && row?.email) map[String(row.id)] = String(row.email);
        }
        setUserEmails((prev) => ({ ...prev, ...map }));
      } catch {
        // Intentionally ignore; we can fall back to user_id.
      }
    })();

    return () => {
      alive = false;
    };
  }, [userIds]);

  const handleStatusChange = async (orderId: string, next: OrderStatus) => {
    if (updatingOrderIds.has(orderId)) return;

    const prev = orders.find((o) => o.id === orderId);
    const prevStatus = normalizeStatus(prev?.status);

    setUpdatingOrderIds((s) => new Set(s).add(orderId));
    setOrders((curr) => curr.map((o) => (o.id === orderId ? { ...o, status: next } : o)));

    try {
      const { error: invokeError } = await supabase.functions.invoke("order-status-email", {
        body: { order_id: orderId, new_status: next },
      });

      if (invokeError) {
        setOrders((curr) => curr.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)));
        toast({ title: "Update failed", description: invokeError.message || "Could not update order status" });
        return;
      }
    } catch (e: any) {
      setOrders((curr) => curr.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)));
      toast({ title: "Update failed", description: e?.message || "Could not update order status" });
      return;
    } finally {
      setUpdatingOrderIds((s) => {
        const nextSet = new Set(s);
        nextSet.delete(orderId);
        return nextSet;
      });
    }
  };

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

  if (useCompactLayout) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+80px)]">
        {/* Minimal Header */}
        <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Orders</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Customer Transactions</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void fetchOrders()}
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
              <p className="text-sm text-muted-foreground animate-pulse">Fetching orders...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
              <div className="text-sm font-semibold text-destructive">Failed to load orders</div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchOrders()}>Retry</Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-background p-10 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold">No Orders Yet</div>
                <p className="text-xs text-muted-foreground">When customers place orders, they will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const status = normalizeStatus(order.status);
                const updating = updatingOrderIds.has(order.id);
                const userLabel = userEmails[order.user_id] || order.user_id;

                return (
                  <div key={order.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm active:scale-[0.98] transition-transform">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1">
                        <div className="text-sm font-bold">#{order.order_number || order.id.slice(0, 8)}</div>
                        <div className="text-[10px] text-muted-foreground font-medium">{formatDateTime(order.created_at)}</div>
                      </div>
                      <Badge variant={statusBadgeVariant(status)} className="text-[10px] uppercase font-bold">
                        {status}
                      </Badge>
                    </div>

                    <div className="mb-4">
                      <div className="text-xs text-muted-foreground mb-1">Customer</div>
                      <div className="text-sm font-medium truncate" title={userLabel}>{userLabel}</div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Total</div>
                        <div className="text-lg font-black">{formatMoney(order.total, order.currency)} {order.currency || ""}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-10 rounded-xl px-4 text-[10px] font-bold uppercase"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setItemsDialogOpen(true);
                          void ensureModalDataLoaded(order);
                        }}
                      >
                        View Items
                      </Button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Update Status</div>
                      <Select
                        value={status}
                        onValueChange={(v) => handleStatusChange(order.id, v as OrderStatus)}
                        disabled={updating}
                      >
                        <SelectTrigger className="h-12 rounded-xl bg-muted/50 border-none">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">View and manage all customer orders.</p>
      </div>

      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm font-medium">Failed to load orders</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-md border border-border bg-background p-8 text-center">
          <div className="text-sm font-medium">No orders found</div>
          <div className="text-sm text-muted-foreground">Orders will appear here once customers place them.</div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Number</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const status = normalizeStatus(order.status);
                const updating = updatingOrderIds.has(order.id);
                const userLabel = userEmails[order.user_id] || order.user_id;

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number || "-"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={userLabel}>
                      {userLabel}
                    </TableCell>
                    <TableCell>{formatMoney(order.total, order.currency)}</TableCell>
                    <TableCell>{order.currency || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
                        <div className="w-[190px]">
                          <Select
                            value={status}
                            onValueChange={(v) => handleStatusChange(order.id, v as OrderStatus)}
                            disabled={updating}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setItemsDialogOpen(true);
                          void ensureModalDataLoaded(order);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={itemsDialogOpen}
        onOpenChange={(open) => {
          setItemsDialogOpen(open);
          if (!open) setSelectedOrderId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Order Items</DialogTitle>
            <DialogDescription>Order #{selectedOrder?.order_number || selectedOrder?.id || "-"}</DialogDescription>
          </DialogHeader>

          {!selectedOrder ? (
            <div className="text-sm text-muted-foreground">No order selected.</div>
          ) : (
            (() => {
              const modal = orderModalCache[selectedOrder.id];
              const userLabelFallback = userEmails[selectedOrder.user_id] || selectedOrder.user_id;

              const displayName = modal?.user?.name?.toString().trim()
                ? String(modal.user.name)
                : "-";
              const displayContact = modal?.user?.email || modal?.user?.mobile || userLabelFallback;

              if (modal?.loading) {
                return (
                  <div className="min-h-[220px] flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                );
              }

              if (modal?.error) {
                return (
                  <div className="rounded-md border border-border bg-background p-4">
                    <div className="text-sm font-medium">Failed to load order items</div>
                    <div className="text-sm text-muted-foreground">{modal.error}</div>
                  </div>
                );
              }

              const items = modal?.items ?? [];

              return (
                <div className="space-y-4">
                  <div className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">User Name</div>
                        <div className="text-sm font-semibold">{displayName}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">User Email / Mobile</div>
                        <div className="text-sm font-semibold truncate" title={String(displayContact)}>
                          {displayContact}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Order Number</div>
                        <div className="text-sm font-semibold">{selectedOrder.order_number || "-"}</div>
                      </div>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No items found for this order.</div>
                  ) : (
                    <div className="max-h-[55vh] overflow-auto pr-1">
                      <div className="space-y-3">
                        {items.map((it) => (
                          <div
                            key={`${selectedOrder.id}:${it.productId}`}
                            className="rounded-md border border-border bg-background p-3"
                          >
                            <div className="flex gap-3">
                              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                                {it.imageUrl ? (
                                  <img
                                    src={it.imageUrl}
                                    alt={it.name}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="h-full w-full" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate" title={it.name}>
                                      {it.name}
                                    </div>
                                    <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                                      <div>
                                        <div className="text-muted-foreground">Price</div>
                                        <div className="text-foreground font-medium">
                                          {formatMoney(it.price, selectedOrder.currency)}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Qty</div>
                                        <div className="text-foreground font-medium">{it.quantity}</div>
                                      </div>
                                      <div>
                                        <div className="text-muted-foreground">Subtotal</div>
                                        <div className="text-foreground font-medium">
                                          {formatMoney(it.subtotal, selectedOrder.currency)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
