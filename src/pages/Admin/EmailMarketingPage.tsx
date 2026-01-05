import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabase";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Audience = "all" | "ordered" | "single";

type CampaignRow = {
  id: string;
  subject: string;
  audience: string | null;
  status: string | null;
  sent_count: number | null;
  created_at: string;
  sent_at: string | null;
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function audienceLabel(a: string | null | undefined) {
  const v = String(a ?? "").trim().toLowerCase();
  if (v === "all") return "All Users";
  if (v === "ordered") return "Users Who Have Ordered Before";
  if (v === "single") return "Single User";
  return a || "-";
}

export default function EmailMarketingPage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience | "">("");
  const [singleEmail, setSingleEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

  const canSend = useMemo(() => {
    if (!subject.trim()) return false;
    if (!body.trim()) return false;
    if (!audience) return false;
    if (audience === "single" && !singleEmail.trim()) return false;
    return true;
  }, [audience, body, singleEmail, subject]);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id, subject, audience, status, sent_count, created_at, sent_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setCampaigns([]);
        return;
      }

      setCampaigns(Array.isArray(data) ? (data as CampaignRow[]) : []);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const handleSend = async () => {
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    const cleanAudience = audience;
    const cleanEmail = singleEmail.trim();

    if (!cleanSubject) {
      toast({ title: "Validation", description: "Email subject is required", variant: "destructive" });
      return;
    }

    if (!cleanBody) {
      toast({ title: "Validation", description: "Email message is required", variant: "destructive" });
      return;
    }

    if (!cleanAudience) {
      toast({ title: "Validation", description: "Audience is required", variant: "destructive" });
      return;
    }

    if (cleanAudience === "single" && !cleanEmail) {
      toast({ title: "Validation", description: "Recipient email is required", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-marketing", {
        body: {
          subject: cleanSubject,
          body: cleanBody,
          audience: cleanAudience,
          single_email: cleanAudience === "single" ? cleanEmail : undefined,
        },
      });

      if (error) {
        toast({ title: "Send failed", description: error.message || "Could not send campaign", variant: "destructive" });
        return;
      }

      toast({
        title: "Campaign sent",
        description: `Sent ${data?.sent_count ?? 0} of ${data?.total ?? 0} emails.`,
      });

      setSubject("");
      setBody("");
      setAudience("");
      setSingleEmail("");

      await loadCampaigns();
    } catch (e: any) {
      toast({ title: "Send failed", description: e?.message || "Could not send campaign", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email Marketing</h1>
        <p className="text-sm text-muted-foreground">Send announcements, offers, and updates to your customers.</p>
      </div>

      <div className="rounded-md border border-border bg-background p-5">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="message">Email Message</Label>
            <Textarea
              id="message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message. Basic HTML is allowed."
              className="min-h-[140px]"
            />
          </div>

          <div className="grid gap-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="ordered">Users Who Have Ordered Before</SelectItem>
                <SelectItem value="single">Single User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {audience === "single" && (
            <div className="grid gap-2">
              <Label htmlFor="singleEmail">User Email</Label>
              <Input
                id="singleEmail"
                type="email"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
          )}

          <div className="pt-2">
            <Button type="button" className="btn-primary" onClick={handleSend} disabled={sending || !canSend}>
              {sending ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Campaign History</h2>
          <p className="text-sm text-muted-foreground">Newest first.</p>
        </div>

        {loadingCampaigns ? (
          <div className="min-h-[160px] flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-md border border-border bg-background p-6 text-sm text-muted-foreground">
            No campaigns yet.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent Count</TableHead>
                  <TableHead>Sent Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium max-w-[420px] truncate" title={c.subject}>
                      {c.subject}
                    </TableCell>
                    <TableCell>{audienceLabel(c.audience)}</TableCell>
                    <TableCell>{c.status || "-"}</TableCell>
                    <TableCell>{typeof c.sent_count === "number" ? c.sent_count : 0}</TableCell>
                    <TableCell>{formatDateTime(c.sent_at || c.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
