import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabase";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type MessageStatus = "unread" | "read" | string;

type MessageRow = {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string;
  read_status: MessageStatus | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeStatus(status: MessageStatus | null | undefined) {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "read" ? "read" : "unread";
}

export default function MessagesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [selected, setSelected] = useState<MessageRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const displayError = (msg: string) => {
    const m = String(msg ?? "");
    const normalized = m.toLowerCase();
    const missingTableHint =
      normalized.includes("could not find the table") ||
      normalized.includes("schema cache") ||
      normalized.includes("relation") ||
      normalized.includes("does not exist");

    setError(
      missingTableHint
        ? "Database table missing: create `public.messages` in Supabase (or refresh PostgREST schema cache), then reload."
        : m || "Failed to load messages"
    );
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from("messages")
          .select("id,sender_name,sender_email,subject,message,created_at,read_status")
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (error) {
          displayError(error.message);
          setMessages([]);
          return;
        }

        setMessages((data as MessageRow[]) ?? []);
      } catch (e: any) {
        if (!alive) return;
        displayError(e?.message);
        setMessages([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const unreadCount = useMemo(
    () => messages.filter((m) => normalizeStatus(m.read_status) === "unread").length,
    [messages]
  );

  const openMessage = (msg: MessageRow) => {
    setSelected(msg);
    setDetailOpen(true);

    if (normalizeStatus(msg.read_status) === "read") return;

    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read_status: "read" } : m)));
    void (async () => {
      try {
        await supabase.from("messages").update({ read_status: "read" }).eq("id", msg.id);
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read_status: "unread" } : m)));
      }
    })();
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+100px)]">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="bg-card rounded-2xl shadow-lg md:border border-border overflow-hidden">
          <div className="p-0 md:p-6">
            <div className="px-4 py-6 md:px-0 md:py-0 md:pb-6 md:border-b border-border md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">Messages</h1>
                <p className="text-[10px] md:text-sm text-muted-foreground uppercase font-medium md:normal-case md:font-normal">Customer Inquiry Inbox</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={unreadCount > 0 ? "default" : "secondary"} className="rounded-full px-3 py-1 font-bold">
                  {unreadCount} UNREAD
                </Badge>
              </div>
            </div>

            {error && <div className="mx-4 md:mx-0 mb-6 rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-xs text-destructive font-medium">{error}</div>}

            {loading ? (
              <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading inbox...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="mx-4 md:mx-0 min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 rounded-3xl border border-dashed border-border p-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground opacity-20" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Inbox is empty</p>
                  <p className="text-xs text-muted-foreground">New messages will appear here when customers contact you.</p>
                </div>
              </div>
            ) : (
              <div className="md:px-0">
                {/* Mobile Inbox View */}
                <div className="md:hidden divide-y divide-border/50">
                  {messages.map((m) => {
                    const status = normalizeStatus(m.read_status);
                    return (
                      <button
                        key={m.id}
                        onClick={() => openMessage(m)}
                        className={cn(
                          "w-full text-left p-5 flex flex-col gap-1 transition-colors active:bg-accent/50",
                          status === "unread" ? "bg-primary/5 border-l-4 border-primary" : "bg-card"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-xs uppercase font-bold tracking-wider truncate", status === "unread" ? "text-primary" : "text-muted-foreground")}>
                            {m.sender_name || "Anonymous"}
                          </span>
                          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                            {formatDateTime(m.created_at).split(",")[0]}
                          </span>
                        </div>
                        <div className={cn("text-sm leading-tight truncate", status === "unread" ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                          {m.subject || "(No Subject)"}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1 opacity-70">
                          {m.message}
                        </div>
                        {status === "unread" && (
                          <div className="mt-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold">Sender</TableHead>
                        <TableHead className="font-bold">Subject</TableHead>
                        <TableHead className="font-bold">Date</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((m) => {
                        const status = normalizeStatus(m.read_status);
                        return (
                          <TableRow
                            key={m.id}
                            role="button"
                            onClick={() => openMessage(m)}
                            className={cn("cursor-pointer hover:bg-muted/30 transition-colors", status === "unread" && "bg-primary/5 font-semibold")}
                          >
                            <TableCell className="py-4">
                              <div className="flex flex-col">
                                <span className="font-bold">{m.sender_name || "-"}</span>
                                <span className="text-[10px] text-muted-foreground">{m.sender_email}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">{m.subject || "-"}</TableCell>
                            <TableCell className="py-4 text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                            <TableCell className="py-4 text-center">
                              <Badge variant={status === "unread" ? "default" : "secondary"} className="rounded-full">
                                {status === "unread" ? "Unread" : "Read"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[95%] max-w-lg rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 bg-primary text-primary-foreground">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">
              {selected?.created_at ? formatDateTime(selected.created_at) : ""}
            </div>
            <DialogTitle className="text-xl font-bold leading-tight">{selected?.subject || "No Subject"}</DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-6 bg-card">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{selected?.sender_name || "Anonymous"}</div>
                {selected?.sender_email && (
                  <a href={`mailto:${selected.sender_email}`} className="text-xs text-primary underline truncate block">
                    {selected.sender_email}
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Message Body</div>
              <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-2xl border border-border/50">
                {selected?.message || "(Empty message)"}
              </div>
            </div>
          </div>
          <div className="p-4 bg-muted/20 flex justify-end">
             <Button variant="ghost" onClick={() => setDetailOpen(false)} className="rounded-xl font-bold uppercase text-[10px]">Close Message</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
