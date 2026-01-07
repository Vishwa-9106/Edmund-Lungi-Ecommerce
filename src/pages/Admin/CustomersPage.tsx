import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/supabase";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  no_of_orders: number | null;
  created_at: string;
  role?: string | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchCustomers = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, mobile, no_of_orders, created_at, role")
        .ilike("role", "user")
        .order("created_at", { ascending: false });

      if (fetchId !== fetchIdRef.current) return;

      if (error) {
        setCustomers([]);
        setError(error.message || "Failed to load customers");
        return;
      }

      setCustomers((Array.isArray(data) ? (data as CustomerRow[]) : []) ?? []);
    } catch (e: any) {
      if (fetchId !== fetchIdRef.current) return;
      setCustomers([]);
      setError(e?.message || "Failed to load customers");
    } finally {
      if (fetchId !== fetchIdRef.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-customers-users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users", filter: "role=ilike.user" },
        () => {
          void fetchCustomers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchCustomers]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+100px)]">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="bg-card rounded-2xl shadow-lg md:border border-border">
          <div className="p-0 md:p-6">
            <div className="px-4 py-6 md:px-0 md:py-0 md:pb-6 md:border-b border-border md:mb-6">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Customers</h1>
              <p className="text-[10px] md:text-sm text-muted-foreground uppercase font-medium md:normal-case md:font-normal">View all registered customers</p>
            </div>

            {loading ? (
              <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading customers...</p>
              </div>
            ) : error ? (
              <div className="mx-4 md:mx-0 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
                <div className="text-sm font-semibold text-destructive">Failed to load customers</div>
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={() => void fetchCustomers()}>Retry</Button>
              </div>
            ) : customers.length === 0 ? (
              <div className="mx-4 md:mx-0 min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 rounded-3xl border border-dashed border-border p-12">
                <Users className="h-12 w-12 text-muted-foreground opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">No customers found</p>
                  <p className="text-xs text-muted-foreground">New customers will appear here once they sign up.</p>
                </div>
              </div>
            ) : (
              <div className="px-4 md:px-0">
                {/* Mobile List View */}
                <div className="grid gap-4 md:hidden">
                  {customers.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card shadow-sm active:scale-[0.98] transition-transform"
                    >
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-lg font-bold text-primary">
                          {(c.name || "U")[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-bold text-base leading-tight truncate">
                          {c.name || "Unknown User"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate opacity-70">
                          {c.email || "No email provided"}
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider bg-secondary px-2 py-0.5 rounded-full">
                            {c.no_of_orders ?? 0} Orders
                          </div>
                          {c.mobile && (
                            <div className="text-[10px] font-medium text-muted-foreground">
                              {c.mobile}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold">Name</TableHead>
                        <TableHead className="font-bold">Email</TableHead>
                        <TableHead className="font-bold">Mobile</TableHead>
                        <TableHead className="font-bold text-center">Orders</TableHead>
                        <TableHead className="font-bold">Member Since</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-semibold py-4">{c.name || "-"}</TableCell>
                          <TableCell className="py-4">{c.email || "-"}</TableCell>
                          <TableCell className="py-4">{c.mobile || "-"}</TableCell>
                          <TableCell className="text-center py-4">
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] h-8 rounded-lg bg-primary/5 text-primary font-bold">
                              {c.no_of_orders ?? 0}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 text-muted-foreground">
                            {c.created_at ? formatDateTime(c.created_at) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
