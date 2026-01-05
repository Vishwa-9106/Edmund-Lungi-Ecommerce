import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabase";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<UserEmailById>({});

  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderModalCache, setOrderModalCache] = useState<Record<string, OrderModalData>>({});

  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) {
      if (o.user_id) ids.add(o.user_id);
    }
    return Array.from(ids);
  }, [orders]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("id, user_id, order_number, status, total, currency, items, created_at")
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (fetchError) {
          setOrders([]);
          setError(fetchError.message || "Failed to load orders");
          return;
        }

        const rows = Array.isArray(data) ? (data as OrderRow[]) : [];
        setOrders(rows);
      } catch (e: any) {
        if (!alive) return;
        setOrders([]);
        setError(e?.message || "Failed to load orders");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

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
