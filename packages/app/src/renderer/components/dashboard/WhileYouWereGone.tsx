import { useNavigate } from "react-router-dom";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { Card, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import {
  Bot,
  UserPlus,
  MessageSquare,
  Send,
  Check,
  X,
  Pencil,
} from "lucide-react";

interface HeartbeatActivity {
  tasks: Array<{
    id: number;
    status: string;
    summary: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  newVendors: Array<{
    id: number;
    name: string;
    categoryName: string | null;
    status: string;
    createdAt: string;
  }>;
  drafts: Array<{
    id: number;
    vendorId: number;
    vendorName: string | null;
    channel: string;
    subject: string | null;
    bodyOriginal: string;
    status: string;
  }>;
  sent: Array<{
    id: number;
    vendorId: number;
    vendorName: string | null;
    channel: string;
    subject: string | null;
    sentAt: string | null;
  }>;
  heartbeatEnabled: boolean;
  lastRunAt: string | null;
}

export function WhileYouWereGone() {
  const navigate = useNavigate();
  const { data, refetch } = useRequest<HeartbeatActivity>("dashboard.heartbeat-activity");
  const { mutate: approve } = useMutation<{ id: number }, unknown>("communications.approve");
  const { mutate: reject } = useMutation<{ id: number }, unknown>("communications.reject");

  if (!data) return null;

  const hasActivity =
    data.tasks.length > 0 ||
    data.newVendors.length > 0 ||
    data.drafts.length > 0 ||
    data.sent.length > 0;

  async function handleApprove(id: number) {
    await approve({ id });
    refetch();
  }

  async function handleReject(id: number) {
    await reject({ id });
    refetch();
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Bot className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">While You Were Gone</h2>
        {data.lastRunAt && (
          <span className="text-xs text-gray-500 ml-auto">
            Last run: {new Date(data.lastRunAt).toLocaleString()}
          </span>
        )}
      </div>

      {!hasActivity ? (
        <Card>
          <CardContent>
            <p className="text-sm text-gray-400">
              {data.heartbeatEnabled
                ? "No activity yet. The scheduled research agent will run automatically and results will appear here."
                : (
                  <>
                    Set up scheduled research to have an AI agent automatically find vendors while you're away.{" "}
                    <button
                      onClick={() => navigate("/settings")}
                      className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                    >
                      Enable in Settings
                    </button>
                  </>
                )}
            </p>
          </CardContent>
        </Card>
      ) : (
      <div className="space-y-3">
        {/* Research summaries */}
        {data.tasks.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Research completed
              </p>
              <div className="space-y-2">
                {data.tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2">
                    <Badge
                      variant={task.status === "completed" ? "success" : "danger"}
                    >
                      {task.status}
                    </Badge>
                    <p className="text-sm text-gray-300 flex-1">
                      {task.summary ?? "No summary available"}
                    </p>
                    <span className="text-xs text-gray-500 shrink-0">
                      {task.completedAt
                        ? new Date(task.completedAt).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New vendors */}
        {data.newVendors.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Vendors found
              </p>
              <div className="space-y-1">
                {data.newVendors.map((vendor) => (
                  <button
                    key={vendor.id}
                    onClick={() => navigate(`/vendors/${vendor.id}`)}
                    className="flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                  >
                    <UserPlus className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-gray-200 truncate">
                      {vendor.name}
                    </span>
                    {vendor.categoryName && (
                      <Badge variant="default">{vendor.categoryName}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Draft messages awaiting review */}
        {data.drafts.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Drafts awaiting review
              </p>
              <div className="space-y-3 divide-y divide-white/5">
                {data.drafts.map((draft) => (
                  <div key={draft.id} className="pt-2 first:pt-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-purple-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-200">
                        {draft.vendorName ?? `Vendor #${draft.vendorId}`}
                      </span>
                      <Badge variant="info">{draft.channel}</Badge>
                    </div>
                    {draft.subject && (
                      <p className="text-xs text-gray-400 mb-1 ml-6">
                        {draft.subject}
                      </p>
                    )}
                    <p className="text-sm text-gray-400 ml-6 line-clamp-2">
                      {draft.bodyOriginal}
                    </p>
                    <div className="flex gap-2 ml-6 mt-2">
                      <button
                        onClick={() => handleApprove(draft.id)}
                        className="flex items-center gap-1 rounded-md bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 transition-colors"
                      >
                        <Check className="h-3 w-3" />
                        Send
                      </button>
                      <button
                        onClick={() => navigate(`/inbox`)}
                        className="flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400 hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleReject(draft.id)}
                        className="flex items-center gap-1 rounded-md bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-600/30 transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sent messages */}
        {data.sent.length > 0 && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Messages sent
              </p>
              <div className="space-y-1">
                {data.sent.map((msg) => (
                  <div key={msg.id} className="flex items-center gap-2 py-1">
                    <Send className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="text-sm text-gray-300">
                      {msg.vendorName ?? `Vendor #${msg.vendorId}`}
                    </span>
                    <Badge variant="default">{msg.channel}</Badge>
                    <span className="text-xs text-gray-500 ml-auto">
                      {msg.sentAt
                        ? new Date(msg.sentAt).toLocaleTimeString()
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      )}
    </div>
  );
}
