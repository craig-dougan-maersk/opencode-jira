/**
 * Example legacy Jira field IDs. IDs differ between sites: configure these
 * for your board before use. Modern epic membership prefers `parent`.
 */
export const FIELD = {
  sprint: "customfield_10001",
  epicLink: "customfield_10002",
  epicStatus: "customfield_10003",
  epicName: "customfield_10004",
  storyPoints: "customfield_10006",
  rank: "customfield_10000",
  parent: "parent",
} as const;

/** Link types that express a dependency worth surfacing in the tree. */
export const DEPENDENCY_LINK_TYPES = new Set([
  "Blocks",
  "Dependency",
  "Deployment Dependency",
  "Problem/Incident",
  "Release",
  "Work item split",
  "Parent-Child",
]);

/** Fields requested for every list/search call. Kept small for response size. */
export const SEARCH_FIELDS: readonly string[] = [
  "summary",
  "status",
  "assignee",
  "issuetype",
  "priority",
  "updated",
  "resolution",
  FIELD.parent,
  FIELD.epicLink,
  FIELD.storyPoints,
];
