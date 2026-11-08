export type ProjectBrainTaskSource = {
  id: string;
  sourceItemId: string;
  title: string;
  details: string;
  evidence: string;
  dueDate: string | null;
  status: string;
  createdAt: Date | string;
};

export type ConsolidatedProjectBrainTodo = {
  id: string;
  title: string;
  details: string;
  dueDate: string | null;
  status: "accepted" | "completed";
  taskIds: string[];
  completedTaskIds: string[];
  sourceCount: number;
  evidence: Array<{
    todoId: string;
    sourceItemId: string;
    quote: string;
  }>;
};

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Merge exact title/detail matches for a unified project view while retaining
 * every source proposal and evidence quote. Similar wording is never merged.
 */
export function consolidateProjectBrainTodos(
  todos: ProjectBrainTaskSource[],
): ConsolidatedProjectBrainTodo[] {
  const groups = new Map<string, { todos: ProjectBrainTaskSource[] }>();

  for (const todo of todos) {
    if (todo.status !== "accepted" && todo.status !== "completed") continue;
    const titleKey = normalize(todo.title);
    if (!titleKey) continue;
    const detailsKey = normalize(todo.details);
    const key = `${titleKey}\u0000${detailsKey}`;
    const group = groups.get(key) ?? { todos: [] };
    group.todos.push(todo);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([, group]) => {
      const sorted = [...group.todos].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime() ||
          left.id.localeCompare(right.id),
      );
      const open = sorted.filter((todo) => todo.status === "accepted");
      const completed = sorted.filter((todo) => todo.status === "completed");
      const dates = sorted
        .flatMap((todo) => (todo.dueDate ? [todo.dueDate] : []))
        .sort();
      return {
        id: sorted[0]!.id,
        title: sorted[0].title,
        details: sorted[0].details,
        dueDate: dates[0] ?? null,
        status: open.length ? ("accepted" as const) : ("completed" as const),
        taskIds: open.map((todo) => todo.id),
        completedTaskIds: completed.map((todo) => todo.id),
        sourceCount: new Set(sorted.map((todo) => todo.sourceItemId)).size,
        evidence: sorted.slice(0, 10).map((todo) => ({
          todoId: todo.id,
          sourceItemId: todo.sourceItemId,
          quote: todo.evidence,
        })),
      };
    })
    .sort(
      (left, right) =>
        left.status.localeCompare(right.status) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
}

export function hasSameProjectBrainTaskIdentity(
  titlesAndDetails: Array<{
    title: string;
    details: string;
  }>,
) {
  if (!titlesAndDetails.length) return false;
  const identity = `${normalize(titlesAndDetails[0].title)}\u0000${normalize(
    titlesAndDetails[0].details,
  )}`;
  return (
    identity.startsWith("\u0000") === false &&
    titlesAndDetails.every(
      (todo) =>
        `${normalize(todo.title)}\u0000${normalize(todo.details)}` === identity,
    )
  );
}
