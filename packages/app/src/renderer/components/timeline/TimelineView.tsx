import { useState } from "react";
import { useRequest, useMutation } from "../../hooks/useRequest";
import { Card, CardContent } from "../common/Card";
import { Badge } from "../common/Badge";
import { EmptyState } from "../common/EmptyState";
import {
  CalendarDays,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Task {
  id: number;
  title: string;
  owner: string | null;
  status: string;
  deadline: string | null;
  categoryId: number | null;
  vendorId: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

function groupByMonth(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();
  const noDate: Task[] = [];

  for (const task of tasks) {
    if (task.deadline) {
      const date = new Date(task.deadline);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      });
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(task);
    } else {
      noDate.push(task);
    }
  }

  // Sort tasks within each group by deadline
  for (const [, group] of groups) {
    group.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  }

  if (noDate.length > 0) {
    groups.set("No deadline", noDate);
  }

  return groups;
}

export function TimelineView() {
  const { data: tasks, loading, refetch } = useRequest<Task[]>("tasks.list");
  const { mutate: createTask } = useMutation<Partial<Task>, Task>("tasks.create");
  const { mutate: updateTask } = useMutation<Partial<Task> & { id: number }, Task>(
    "tasks.update",
  );
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createTask({
      title: newTitle.trim(),
      deadline: newDeadline || null,
      owner: newOwner || null,
    });
    setNewTitle("");
    setNewDeadline("");
    setNewOwner("");
    setShowForm(false);
    refetch();
  }

  async function toggleStatus(task: Task) {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    await updateTask({ id: task.id, status: nextStatus });
    refetch();
  }

  function toggleMonth(month: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Timeline</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const grouped = groupByMonth(tasks ?? []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Timeline</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </div>

      {showForm && (
        <Card>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-3">
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="Owner"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {(!tasks || tasks.length === 0) && !showForm ? (
        <EmptyState
          icon={CalendarDays}
          title="No tasks yet"
          description="Create tasks to track your wedding planning timeline."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Create First Task
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([month, monthTasks]) => {
            const completed = monthTasks.filter(
              (t) => t.status === "completed",
            ).length;
            const isCollapsed = collapsedMonths.has(month);

            return (
              <div key={month}>
                <button
                  onClick={() => toggleMonth(month)}
                  className="flex items-center gap-2 mb-2 w-full text-left group"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                    {month}
                  </span>
                  <span className="text-xs text-gray-500">
                    {completed}/{monthTasks.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="ml-6 border-l border-white/10 pl-4 space-y-1">
                    {monthTasks.map((task) => (
                      <TimelineTask
                        key={task.id}
                        task={task}
                        onToggle={() => toggleStatus(task)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineTask({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  const isDone = task.status === "completed";
  const isOverdue =
    task.deadline &&
    !isDone &&
    new Date(task.deadline) < new Date();

  return (
    <div className="flex items-center gap-3 py-2 group">
      <button onClick={onToggle} className="flex-shrink-0">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : (
          <Circle className="h-4 w-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm ${
            isDone ? "text-gray-500 line-through" : "text-gray-200"
          }`}
        >
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {task.owner && (
          <Badge variant="default">{task.owner}</Badge>
        )}
        {task.deadline && (
          <span
            className={`flex items-center gap-1 text-xs ${
              isOverdue ? "text-red-400" : "text-gray-500"
            }`}
          >
            <Clock className="h-3 w-3" />
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
