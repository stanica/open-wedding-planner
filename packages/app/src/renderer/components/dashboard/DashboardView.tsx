import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { useGatewayStore } from "../../stores/gateway-store";
import { Card, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import {
  Search,
  Users,
  Inbox,
  Activity,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
} from "lucide-react";

interface DashboardStats {
  vendors: {
    byStatus: Record<string, number>;
    byCategory: Array<{
      categoryId: number | null;
      categoryName: string;
      count: number;
    }>;
    total: number;
  };
  budget: {
    total: number;
    allocated: number;
    actual: number;
    paid: number;
    currency: string;
  };
  recentActivity: Array<{
    id: number;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }>;
  unreadMessages: number;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "info" }> = {
  prospect: { label: "Prospect", variant: "default" },
  contacted: { label: "Contacted", variant: "info" },
  negotiating: { label: "Negotiating", variant: "warning" },
  booked: { label: "Booked", variant: "success" },
  rejected: { label: "Rejected", variant: "default" },
};

export function DashboardView() {
  const connected = useGatewayStore((s) => s.connected);
  const state = useGatewayStore((s) => s.state);
  const { data: stats, loading } = useRequest<DashboardStats>("dashboard.stats");
  const { mutate: startResearch, loading: researching } = useMutation<
    { query: string },
    { taskId: string }
  >("agent.research");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  async function handleResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    await startResearch({ query: query.trim() });
    setQuery("");
    navigate("/research");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
          />
          <span className="text-sm text-gray-400">
            {connected
              ? `Gateway v${state?.version ?? "?"}`
              : "Connecting..."}
          </span>
        </div>
      </div>

      {/* Quick research */}
      <form onSubmit={handleResearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Research vendors... (e.g. 'florists in Tuscany')"
            disabled={researching}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card onClick={() => navigate("/vendors")}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="text-2xl font-bold">{stats.vendors.total}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">Total Vendors</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(stats.vendors.byStatus).map(([status, count]) => (
                    <Badge key={status} variant={STATUS_CONFIG[status]?.variant ?? "default"}>
                      {count} {STATUS_CONFIG[status]?.label ?? status}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card onClick={() => navigate("/budget")}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Activity className="h-5 w-5 text-green-400" />
                  <CurrencyDisplay
                    amount={stats.budget.actual}
                    currency={stats.budget.currency}
                    className="text-2xl font-bold"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {stats.budget.total > 0 ? (
                    <>
                      of <CurrencyDisplay amount={stats.budget.total} currency={stats.budget.currency} className="text-gray-300" /> budget
                    </>
                  ) : (
                    "Estimated costs"
                  )}
                </p>
                {stats.budget.total > 0 && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stats.budget.actual / stats.budget.total > 1
                          ? "bg-red-500"
                          : stats.budget.actual / stats.budget.total > 0.8
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min((stats.budget.actual / stats.budget.total) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card onClick={() => navigate("/inbox")}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Inbox className="h-5 w-5 text-purple-400" />
                  <span className="text-2xl font-bold">{stats.unreadMessages}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">Unread Messages</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-gray-400 mb-2">By Category</p>
                <div className="space-y-1">
                  {stats.vendors.byCategory.slice(0, 4).map((cat) => (
                    <div key={cat.categoryId} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate">{cat.categoryName}</span>
                      <span className="text-gray-500 ml-2">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          {stats.recentActivity.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
              <Card>
                <CardContent className="divide-y divide-white/5">
                  {stats.recentActivity.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <ActivityIcon status={task.status} />
                        <div>
                          <span className="text-sm text-gray-200 capitalize">
                            {task.type}
                          </span>
                          <p className="text-xs text-gray-500">
                            {new Date(task.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          task.status === "completed"
                            ? "success"
                            : task.status === "failed"
                              ? "danger"
                              : task.status === "running"
                                ? "info"
                                : "default"
                        }
                      >
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ActivityIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}
