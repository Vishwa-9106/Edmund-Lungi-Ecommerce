import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-[calc(env(safe-area-inset-bottom)+100px)]">
      <div className="container mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
            <p className="text-sm text-muted-foreground">Manage marketing tools for your store.</p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8 shadow-xl space-y-6 text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">📧</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Email Marketing</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Send announcements, offers, and updates directly to your customers' inbox.
              </p>
            </div>
            <Button asChild className="w-full h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/20">
              <Link to="/admin/marketing/email">Open Marketing Dashboard</Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card/50 p-4 text-center space-y-1">
              <div className="text-xs font-bold text-muted-foreground uppercase">Status</div>
              <div className="text-sm font-bold text-green-500">Active</div>
            </div>
            <div className="rounded-2xl border border-border bg-card/50 p-4 text-center space-y-1">
              <div className="text-xs font-bold text-muted-foreground uppercase">Tools</div>
              <div className="text-sm font-bold">1 Available</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
