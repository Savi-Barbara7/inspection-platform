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

export interface GroupItem {
  id: string;
  organizationId: string;
  technicalJobId: string;
  /** The repeatable Section's own id this instance was created from. */
  definitionSectionId: string;
  /** Set when this item belongs to a RepeatableGroup nested inside another RepeatableGroup's own item. */
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
