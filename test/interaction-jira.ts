// Replaces the entire client module at bundle time: no auth or network access.
export class JiraError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const writes: { key: string; text: string }[] = [];
export let commentFailure = false;
export let commentPending = false;
export let finishComment: (() => void) | undefined;
export const setCommentPending = (value: boolean) => {
  commentPending = value;
};
export const setCommentFailure = (value: boolean) => {
  commentFailure = value;
};
export const issueReads: string[] = [];
export const siteWrites: { site: string; key: string }[] = [];
export const transitionWrites: { key: string; id: string }[] = [];
export const backlogWrites: string[] = [];
export let baselineDelay: Promise<void> | undefined;
export const setBaselineDelay = (value?: Promise<void>) => {
  baselineDelay = value;
};
export const fixtures = {
  issues: undefined as any[] | undefined,
  epics: undefined as any[] | undefined,
  childrenFail: false,
  partial: false,
  malformed: false,
  changed: false,
};
export let failKey = "";
export const setFailKey = (key: string) => {
  failKey = key;
};
export const delayedReads = new Map<string, () => void>();
export let delayKey = "";
export const setDelayKey = (value: string) => {
  delayKey = value;
};
const issue = (key: string) => ({
  key,
  summary: `Fixture ${key}`,
  type: "Task",
  status: "Open",
  statusId: "1",
  statusCategory: "To Do",
  assignee: "Test User",
  assigneeId: "test-user",
  epicKey: null,
  parentKey: null,
  points: null,
  priority: null,
  updated: "2026-10-28",
  url: `https://example.invalid/browse/${key}`,
});
export class JiraClient {
  constructor(readonly site: string) {}
  async me() {
    await baselineDelay;
    return "test-user";
  }
  async boardConfig() {
    return {
      id: 1,
      name: "Fixture Board",
      filterJql: "",
      columns: [
        { name: "Open", statusIds: ["1"] },
        { name: "Build", statusIds: ["2"] },
      ],
    };
  }
  async search(jql: string) {
    if (jql.startsWith("parent =") && fixtures.childrenFail)
      throw new Error("children failure");
    if (!jql.includes("currentUser()") && !jql.includes("parent ="))
      await baselineDelay;
    return {
      issues: jql.includes("issuetype = Epic")
        ? (fixtures.epics ?? [])
        : (fixtures.issues ?? [issue("TEST-1"), issue("TEST-2")]),
      truncated: fixtures.partial,
    };
  }
  async activeSprint() {
    return { id: 1, name: "Fixture Sprint", endDate: "2026-11-01" };
  }
  async sprintIssues() {
    return [issue("SPRINT-1"), issue("SPRINT-2")];
  }
  async backlog() {
    return {
      issues: fixtures.issues?.map((i) => ({
        ...i,
        assigneeId: "test-user",
      })) ?? [issue("BACKLOG-1")],
      truncated: false,
    };
  }
  async boards() {
    return [{ id: 1, name: "Fixture Board", type: "scrum" }];
  }
  async transitions() {
    return [{ id: "2", name: "Resolved", to: { id: "2", name: "Build" } }];
  }
  async transition(key: string, id: string) {
    transitionWrites.push({ key, id });
    fixtures.changed = true;
  }
  async sendToBacklog(keys: readonly string[]) {
    for (const key of keys) backlogWrites.push(key);
    fixtures.changed = true;
  }
  async assign() {
    fixtures.changed = true;
  }
  async issue(key: string) {
    issueReads.push(key);
    if (key === delayKey)
      await new Promise<void>((resolve) => delayedReads.set(key, resolve));
    if (key === "FAIL-1" || key === failKey)
      throw new Error("Fixture read failure");
    return {
      key,
      fields: {
        summary: `Detail ${key}`,
        issuetype: { name: "Task" },
        status: {
          name: fixtures.changed ? "Resolved" : "Open",
          id: "1",
          statusCategory: { name: "To Do" },
        },
        description: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Long description " + "fixture\n".repeat(40),
                  marks: fixtures.malformed ? [null] : [],
                },
              ],
            },
          ],
        },
        parent: {
          key: key === "TEST-1" ? "PARENT-1" : "TEST-1",
          fields: { summary: "Parent fixture", issuetype: { name: "Task" } },
        },
        issuelinks: [
          {
            type: { name: "Blocks", outward: "blocks" },
            outwardIssue: {
              key: "RELATED-1",
              fields: { summary: "Linked fixture" },
            },
          },
        ],
        subtasks: [],
      },
    };
  }
  async addComment(key: string, text: string) {
    siteWrites.push({ site: this.site, key });
    writes.push({ key, text });
    if (commentPending)
      await new Promise<void>((resolve) => {
        finishComment = resolve;
      });
    if (commentFailure) throw new Error("uncertain fixture");
    return { id: "fixture" };
  }
}
export function toIssue(raw: any, site: string) {
  return {
    ...issue(raw.key),
    status: raw.fields?.status?.name ?? "Open",
    summary: raw.fields?.summary ?? "",
    type: raw.fields?.issuetype?.name ?? "Task",
    url: `https://${site}/browse/${raw.key}`,
  };
}
export function truncate(text: string, max: number) {
  return text.slice(0, max);
}
