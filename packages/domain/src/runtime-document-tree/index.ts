// Runtime Document Tree (Task 15).
//
// MODELO PUBLICADO != DOCUMENTO RUNTIME. An OrganizationModelVersion's
// `definition` (Task 09/13) is structure/config -- it is never mutated
// by a job and a job never re-walks it live to know what it looks like.
// The first time a TechnicalJob is created against a published version,
// its tree is MATERIALIZED ONCE into RuntimeNode rows with their own
// stable identity (a real generated id, distinct from the section/block
// id it was materialized from -- `definitionId`). Publishing a newer
// OrganizationModelVersion afterward never touches an existing job's
// tree: the job's `organizationModelVersionId` is immutable (Task 14),
// and nothing in this module ever re-resolves a job against "the
// current" version.
//
// RepeatableGroup: a `Section.repeatable` (Task 15's addition to
// packages/domain/src/templates/blocks.ts) describes what ONE instance
// looks like. Its own `blocks`/nested `sections` are NOT materialized
// when the container section itself materializes -- only a single
// container RuntimeNode is created for it. Each GroupItem (added later,
// explicitly, by the user/app) gets its own copy of that subtree,
// scoped to its own `groupItemId`. The same generic engine backs every
// vertical: nothing here ever asks "what is this group called" -- see
// test/runtime-document-tree.test.ts's architectural suite, which greps
// this file for vertical/model-specific names.
//
// Order is always an explicit `position` (never array index in a
// database, never a timestamp) -- see reorderIds() below, which is the
// single source of truth this module's own tests and the API layer's
// reorder endpoint both use to compute the next ordering.

import { reorder } from "../templates/blocks";
import type { DocumentDefinition, Section } from "../templates/blocks";

export type MaterializationNodeKind = "section" | "block";

/**
 * One node in the plan produced by buildMaterializationPlan()/
 * buildGroupItemMaterializationPlan() -- a pure, DB-free description of
 * what RuntimeNode rows an infrastructure adapter should insert, and in
 * what hierarchy/order. `definitionId` is the Section/Block id from the
 * DocumentDefinition; the actual RuntimeNode id assigned at insert time
 * is a fresh, unrelated identifier (Task 15 section 6: stable runtime
 * IDs distinct from definition IDs).
 */
export interface MaterializationPlanNode {
  definitionId: string;
  definitionKind: MaterializationNodeKind;
  blockType: string | null;
  /** True only for a section carrying `repeatable` -- its `children` is always empty; see the file header. */
  isRepeatableContainer: boolean;
  position: number;
  children: MaterializationPlanNode[];
}

function planSectionChildren(section: Section): MaterializationPlanNode[] {
  const children: MaterializationPlanNode[] = [];
  let position = 0;
  for (const block of section.blocks) {
    children.push({
      definitionId: block.id,
      definitionKind: "block",
      blockType: block.type,
      isRepeatableContainer: false,
      position: position++,
      children: []
    });
  }
  for (const nested of section.sections ?? []) {
    children.push(planSection(nested, position++));
  }
  return children;
}

function planSection(section: Section, position: number): MaterializationPlanNode {
  const isRepeatable = section.repeatable !== undefined;
  return {
    definitionId: section.id,
    definitionKind: "section",
    blockType: null,
    isRepeatableContainer: isRepeatable,
    position,
    // A repeatable section's own blocks/nested sections describe ONE
    // GroupItem instance (Task 15 section 8/28) -- never materialized
    // as children of the container itself. They materialize per-
    // GroupItem via buildGroupItemMaterializationPlan(), later, only
    // once a GroupItem is actually added.
    children: isRepeatable ? [] : planSectionChildren(section)
  };
}

/** The whole-tree plan for a job's very first materialization, at job-creation time. */
export function buildMaterializationPlan(
  definition: DocumentDefinition
): MaterializationPlanNode[] {
  return definition.sections.map((section, index) => planSection(section, index));
}

/**
 * The plan for exactly ONE GroupItem's own subtree, called once per
 * add-group-item operation -- never at whole-tree materialization time.
 * `repeatableSection` must be the Section this GroupItem belongs to
 * (the one carrying `repeatable`); its own `blocks`/nested `sections`
 * are what materializes, scoped to the new GroupItem's id.
 */
export function buildGroupItemMaterializationPlan(
  repeatableSection: Section
): MaterializationPlanNode[] {
  return planSectionChildren(repeatableSection);
}

/** Depth-first search for a Section by id anywhere in the tree (including nested repeatable groups). */
export function findSectionById(sections: readonly Section[], id: string): Section | undefined {
  for (const section of sections) {
    if (section.id === id) return section;
    if (section.sections) {
      const found = findSectionById(section.sections, id);
      if (found) return found;
    }
  }
  return undefined;
}

export class SectionNotFoundInDefinitionError extends Error {
  constructor(public readonly sectionId: string) {
    super(
      `section "${sectionId}" was not found in the job's own OrganizationModelVersion definition`
    );
    this.name = "SectionNotFoundInDefinitionError";
  }
}

export class SectionNotRepeatableError extends Error {
  constructor(public readonly sectionId: string) {
    super(`section "${sectionId}" is not a repeatable group -- cannot add a GroupItem to it`);
    this.name = "SectionNotRepeatableError";
  }
}

/**
 * Resolves the repeatable Section a GroupItem is being added under,
 * throwing the same two, explicit errors an API route should map to a
 * clean 422/404 -- never a silent fallback.
 */
export function resolveRepeatableSection(
  definition: DocumentDefinition,
  sectionId: string
): Section {
  const section = findSectionById(definition.sections, sectionId);
  if (!section) throw new SectionNotFoundInDefinitionError(sectionId);
  if (!section.repeatable) throw new SectionNotRepeatableError(sectionId);
  return section;
}

export type RuntimeNodeDefinitionKind = MaterializationNodeKind;

/** visible: shown normally. hidden: explicitly hidden by the user/app, still fully persisted. conditional_inactive: a materialized condition currently evaluates false -- never dropped from the tree ("nada importante aparece somente no PDF"). No state here is ever a physical delete. */
export type RuntimeNodeState = "visible" | "hidden" | "conditional_inactive";

export const RUNTIME_NODE_STATES: readonly RuntimeNodeState[] = [
  "visible",
  "hidden",
  "conditional_inactive"
];

export interface RuntimeNode {
  id: string;
  organizationId: string;
  technicalJobId: string;
  definitionId: string;
  definitionKind: RuntimeNodeDefinitionKind;
  blockType: string | null;
  parentNodeId: string | null;
  /** Set only for a node materialized inside a GroupItem's own subtree (never for the repeatable container node itself). */
  groupItemId: string | null;
  isRepeatableContainer: boolean;
  position: number;
  state: RuntimeNodeState;
  createdAt: string;
  updatedAt: string;
}

/** active: part of the job's live structure. archived: soft-hidden, recoverable, never physically deleted -- see Task 15 section 20. */
export type GroupItemState = "active" | "archived";

export const GROUP_ITEM_STATES: readonly GroupItemState[] = ["active", "archived"];

export interface GroupItem {
  id: string;
  organizationId: string;
  technicalJobId: string;
  /**
   * The exact RuntimeNode (a repeatable container) this item structurally
   * belongs to — Task 15.5A's fix for the identity bug documented in
   * `docs/product/ROADMAP_TASKS_V2.md` (Task 15.5A): a nested
   * RepeatableGroup materializes ONE fresh container node per enclosing
   * GroupItem, so more than one container can share the same
   * `definitionSectionId` at once. `containerNodeId` is the single
   * authoritative reference — never re-derived by searching for "a" node
   * matching `definitionSectionId` (that search is exactly what was
   * ambiguous). Always set by the server (`add_group_item()`/
   * `duplicate_group_item()`), never accepted as client input.
   */
  containerNodeId: string;
  /** The repeatable Section's own id this instance was created from — display/query convenience, never used alone to resolve which container a GroupItem belongs to (use `containerNodeId`). */
  definitionSectionId: string;
  /**
   * Set when this item belongs to a RepeatableGroup nested inside
   * another RepeatableGroup's own item. Always DERIVED from
   * `containerNodeId`'s own `RuntimeNode.groupItemId` server-side —
   * never accepted as independent client input, so it can never
   * disagree with the container it's actually materialized under
   * (Task 15.5A closes exactly this "container ↔ parent" gap).
   */
  parentGroupItemId: string | null;
  position: number;
  state: GroupItemState;
  createdAt: string;
  updatedAt: string;
}

/**
 * Computes the array position each id should end up at after moving
 * `id` to `newIndex` among `orderedIds` -- the same, single reordering
 * primitive already proven for template sections/blocks (Task 09's
 * `reorder()`), reused as-is here so runtime-tree order follows the
 * exact same rule: ids never change, only their position.
 */
export function reorderIds(orderedIds: readonly string[], id: string, newIndex: number): string[] {
  return reorder(orderedIds, id, newIndex, (x) => x);
}

/**
 * The Document Tree read shape (Task 15 section 45): id/definitionId/
 * type/state/children, assembled from relational persistence
 * (RuntimeNode/GroupItem rows), never stored as one JSON blob.
 * Deliberately carries no `title`/label -- those live only in the
 * job's own frozen OrganizationModelVersion.definition, which a client
 * fetches once and caches (it is immutable for the life of the job);
 * duplicating presentational text onto every node on every read would
 * cost far more than the one-time definition fetch, and is exactly the
 * kind of unnecessary-blob-loading Task 15 section 46 warns against.
 */
export interface DocumentTreeNode {
  id: string;
  definitionId: string;
  definitionKind: RuntimeNodeDefinitionKind;
  blockType: string | null;
  state: RuntimeNodeState;
  isRepeatableContainer: boolean;
  position: number;
  children: DocumentTreeNode[];
  /** Present only when isRepeatableContainer is true. */
  groupItems?: DocumentTreeGroupItem[];
}

export interface DocumentTreeGroupItem {
  id: string;
  position: number;
  state: GroupItemState;
  parentGroupItemId: string | null;
  children: DocumentTreeNode[];
}

export interface BuildDocumentTreeOptions {
  /** Default false: an archived GroupItem (and its own subtree) is left out of the live structure, never physically dropped from storage. */
  includeArchived?: boolean;
}

function nodeToTreeNode(
  node: RuntimeNode,
  nodes: readonly RuntimeNode[],
  groupItems: readonly GroupItem[],
  enclosingGroupItemId: string | null,
  includeArchived: boolean
): DocumentTreeNode {
  const base: DocumentTreeNode = {
    id: node.id,
    definitionId: node.definitionId,
    definitionKind: node.definitionKind,
    blockType: node.blockType,
    state: node.state,
    isRepeatableContainer: node.isRepeatableContainer,
    position: node.position,
    children: []
  };

  if (node.isRepeatableContainer) {
    // Task 15.5A fix: scope by `containerNodeId === node.id` — the exact,
    // unambiguous runtime container — never by `definitionSectionId`
    // (which a nested RepeatableGroup can share across several distinct
    // container instances, one per enclosing GroupItem) nor by
    // `enclosingGroupItemId` alone.
    base.groupItems = groupItems
      .filter((gi) => gi.containerNodeId === node.id && (includeArchived || gi.state !== "archived"))
      .sort((a, b) => a.position - b.position)
      .map((gi) => groupItemToTreeNode(gi, nodes, groupItems, includeArchived));
    return base;
  }

  base.children = nodes
    .filter((n) => n.parentNodeId === node.id && n.groupItemId === enclosingGroupItemId)
    .sort((a, b) => a.position - b.position)
    .map((n) => nodeToTreeNode(n, nodes, groupItems, enclosingGroupItemId, includeArchived));
  return base;
}

function groupItemToTreeNode(
  groupItem: GroupItem,
  nodes: readonly RuntimeNode[],
  groupItems: readonly GroupItem[],
  includeArchived: boolean
): DocumentTreeGroupItem {
  // Task 15.5A fix: `groupItem.containerNodeId` is the exact runtime node
  // this item's own subtree is materialized under — no more searching
  // `nodes` for "a" node matching `definitionSectionId`, which used to
  // silently pick whichever container `.find()` happened to reach first
  // whenever a nested RepeatableGroup produced more than one container
  // sharing that same `definitionSectionId` (one per enclosing GroupItem).
  const children = nodes
    .filter((n) => n.parentNodeId === groupItem.containerNodeId && n.groupItemId === groupItem.id)
    .sort((a, b) => a.position - b.position)
    .map((n) => nodeToTreeNode(n, nodes, groupItems, groupItem.id, includeArchived));
  return {
    id: groupItem.id,
    position: groupItem.position,
    state: groupItem.state,
    parentGroupItemId: groupItem.parentGroupItemId,
    children
  };
}

/**
 * Assembles the full Document Tree from flat RuntimeNode/GroupItem
 * arrays (as read from Postgres) -- pure and DB-free, so the hierarchy/
 * ordering/nested-group-context logic is unit-testable without ever
 * touching a real database. `enclosingGroupItemId` threads through the
 * recursion so a nested RepeatableGroup's own items resolve against
 * the correct (possibly nested) context, never a global lookup.
 */
export function buildDocumentTree(
  nodes: readonly RuntimeNode[],
  groupItems: readonly GroupItem[],
  options: BuildDocumentTreeOptions = {}
): DocumentTreeNode[] {
  const includeArchived = options.includeArchived ?? false;
  return nodes
    .filter((n) => n.parentNodeId === null && n.groupItemId === null)
    .sort((a, b) => a.position - b.position)
    .map((n) => nodeToTreeNode(n, nodes, groupItems, null, includeArchived));
}

/** Thrown when a runtime node id doesn't exist in this job/organization. */
export class RuntimeNodeNotFoundError extends Error {
  constructor(public readonly nodeId: string) {
    super(`runtime node "${nodeId}" was not found in this job`);
    this.name = "RuntimeNodeNotFoundError";
  }
}

/** Thrown when add_group_item() targets a node that isn't a RepeatableGroup container. */
export class NotARepeatableContainerError extends Error {
  constructor(public readonly nodeId: string) {
    super(`runtime node "${nodeId}" is not a repeatable group container`);
    this.name = "NotARepeatableContainerError";
  }
}

/** Thrown when a group item id doesn't exist in this job/organization. */
export class GroupItemNotFoundError extends Error {
  constructor(public readonly groupItemId: string) {
    super(`group item "${groupItemId}" was not found in this job`);
    this.name = "GroupItemNotFoundError";
  }
}

/** Thrown when reorder_runtime_nodes()'s ordered id list doesn't exactly match the current children of the given parent/group-item scope. */
export class ReorderMismatchError extends Error {
  constructor() {
    super("the ordered id list does not match the current children of this parent");
    this.name = "ReorderMismatchError";
  }
}

export interface AddGroupItemInput {
  /**
   * The repeatable-container RuntimeNode to add an item under. That's
   * the only input needed — Task 15.5A removed the separate
   * `parentGroupItemId` parameter this used to accept: the parent is
   * always the container's own (server-known) `groupItemId`, derived
   * automatically, never supplied independently. Supplying it
   * separately was exactly how a caller could smuggle a container from
   * one parent's subtree together with a `parentGroupItemId` pointing
   * at an unrelated sibling parent; removing the parameter removes the
   * bug class structurally instead of just validating against it.
   */
  containerNodeId: string;
}

export interface ReorderRuntimeNodesInput {
  parentNodeId: string | null;
  groupItemId: string | null;
  orderedNodeIds: string[];
}

/**
 * `containerNodeId` alone fully scopes the sibling set to reorder: a
 * nested RepeatableGroup's container is always specific to exactly one
 * enclosing GroupItem instance (never shared), so there is no need for
 * a separate "which parent" parameter the way `AddGroupItemInput` used
 * to (mis)require one either.
 */
export interface ReorderGroupItemsInput {
  containerNodeId: string;
  orderedGroupItemIds: string[];
}

/**
 * Port implemented by an infrastructure adapter (Supabase/Postgres in
 * apps/api). Every call is scoped to the acting user's own credential —
 * never service_role — and an explicit organizationId/technicalJobId.
 * Structural validation (does this node really belong to this job, is
 * it really a repeatable container, does the ordered id list really
 * match) always happens in the SECURITY DEFINER RPCs themselves, never
 * only in this adapter.
 */
export interface RuntimeDocumentTreeRepository {
  getTree(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    options?: BuildDocumentTreeOptions
  ): Promise<DocumentTreeNode[]>;
  addGroupItem(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    input: AddGroupItemInput
  ): Promise<GroupItem>;
  duplicateGroupItem(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    groupItemId: string
  ): Promise<GroupItem>;
  updateGroupItemState(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    groupItemId: string,
    state: GroupItemState
  ): Promise<GroupItem | null>;
  reorderNodes(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    input: ReorderRuntimeNodesInput
  ): Promise<void>;
  updateNodeState(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    nodeId: string,
    state: RuntimeNodeState
  ): Promise<RuntimeNode | null>;
  /**
   * Reassigns position for every active GroupItem under one container —
   * ids never change (Task 15.5A, mirrors `reorderNodes()` for
   * `RuntimeNode`s). Throws `ReorderMismatchError` when the ordered id
   * list doesn't exactly match the container's current active children.
   */
  reorderGroupItems(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    input: ReorderGroupItemsInput
  ): Promise<void>;
  /**
   * Restores an archived GroupItem with a freshly computed, always-valid
   * position at the end of its container's active list (Task 15.5A) —
   * never tries to reclaim its old slot, which could otherwise collide
   * with a position a newer item took while this one was archived.
   * Restoring an already-active item is a no-op that returns it
   * unchanged.
   */
  restoreGroupItem(
    authToken: string,
    organizationId: string,
    technicalJobId: string,
    groupItemId: string
  ): Promise<GroupItem | null>;
}
