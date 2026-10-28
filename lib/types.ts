export interface JiraSettings {
  /** Atlassian site host, e.g. "example.atlassian.net". */
  site: string;
  /** Project key, e.g. "DEMO". */
  projectKey: string;
  /** Agile board id. When null the plugin resolves the first board for the project. */
  boardId: number | null;
  /** Seconds a fetched payload is reused before a network round trip. */
  cacheSeconds: number;
  /** How many link hops the dependency tree follows. */
  linkDepth: number;
}

export type AssigneeFilter = "mine" | "others" | "unassigned" | "all";

export type ViewName = "mine" | "sprint" | "backlog" | "epics" | "issue";

export interface Column {
  readonly name: string;
  readonly statusIds: readonly string[];
}

export interface BoardConfig {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly columns: readonly Column[];
  readonly filterJql: string;
}

export interface SprintInfo {
  readonly id: number;
  readonly name: string;
  readonly state: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly goal?: string;
}

export interface Issue {
  readonly key: string;
  readonly summary: string;
  readonly type: string;
  readonly status: string;
  readonly statusId: string;
  readonly statusCategory: string;
  readonly assignee: string | null;
  readonly assigneeId: string | null;
  readonly epicKey: string | null;
  readonly parentKey: string | null;
  readonly points: number | null;
  readonly priority: string | null;
  readonly updated: string;
  readonly url: string;
}

export interface IssueLink {
  readonly type: string;
  readonly direction: "outward" | "inward";
  readonly label: string;
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly blocking: boolean;
}

export interface IssueDetail extends Issue {
  readonly description: string | null;
  readonly descriptionAdf?: unknown;
  readonly links: readonly IssueLink[];
  readonly subtasks: readonly Issue[];
  readonly parent: Issue | null;
  readonly epic: Issue | null;
}

export interface EpicSummary extends Issue {
  readonly childCount: number;
  readonly doneCount: number;
  readonly status: string;
}

export interface FilterState {
  readonly assignee: AssigneeFilter;
  readonly text: string;
  readonly type: string | null;
}
