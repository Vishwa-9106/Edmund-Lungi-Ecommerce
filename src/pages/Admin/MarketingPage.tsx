import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function MarketingPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-sm text-muted-foreground">Manage marketing tools for your store.</p>
      </div>

      <div className="rounded-md border border-border bg-background p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Email Marketing</div>
            <div className="text-sm text-muted-foreground">Send announcements, offers, and updates.</div>
          </div>
          <Button asChild className="btn-primary">
            <Link to="/admin/marketing/email">Open</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
