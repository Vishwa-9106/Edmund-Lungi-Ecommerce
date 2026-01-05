import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/supabase";
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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">View all registered customers.</p>
      </div>

      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm font-medium">Failed to load customers</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-md border border-border bg-background p-8 text-center">
          <div className="text-sm font-medium">No customers found</div>
          <div className="text-sm text-muted-foreground">New customers will appear here once they sign up.</div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>No of Orders</TableHead>
                <TableHead>Created Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name || "-"}</TableCell>
                  <TableCell>{c.email || "-"}</TableCell>
                  <TableCell>{c.mobile || "-"}</TableCell>
                  <TableCell>{c.no_of_orders ?? 0}</TableCell>
                  <TableCell>{c.created_at ? formatDateTime(c.created_at) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
