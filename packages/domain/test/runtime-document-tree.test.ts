import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentDefinition, Section } from "../src/templates/blocks";
import {
  buildDocumentTree,
  buildGroupItemMaterializationPlan,
  buildMaterializationPlan,
  findSectionById,
  reorderIds,
  resolveRepeatableSection,
  RUNTIME_NODE_STATES,
  SectionNotFoundInDefinitionError,
  SectionNotRepeatableError,
  type GroupItem,
  type RuntimeNode
} from "../src/runtime-document-tree";

function node(
  overrides: Partial<RuntimeNode> & Pick<RuntimeNode, "id" | "definitionId">
): RuntimeNode {
  return {
    organizationId: "org-1",
    technicalJobId: "job-1",
    definitionKind: "block",
    blockType: "TechnicalInformation",
    parentNodeId: null,
    groupItemId: null,
    isRepeatableContainer: false,
    position: 0,
    state: "visible",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function groupItem(
  overrides: Partial<GroupItem> & Pick<GroupItem, "id" | "definitionSectionId" | "containerNodeId">
): GroupItem {
  return {
    organizationId: "org-1",
    technicalJobId: "job-1",
    parentGroupItemId: null,
    position: 0,
    state: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function plainDefinition(): DocumentDefinition {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "sec-1",
        title: "Informações Gerais",
        blocks: [
          { id: "blk-1", type: "TechnicalInformation", fields: [] },
          { id: "blk-2", type: "TechnicalInformation", fields: [] }
        ],
        sections: [
          {
            id: "sec-1-1",
            title: "Subseção",
            blocks: [{ id: "blk-1-1", type: "TechnicalInformation", fields: [] }]
          }
        ]
      },
      {
        id: "sec-2",
        title: "Conclusão",
        blocks: [{ id: "blk-3", type: "TechnicalInformation", fields: [] }]
      }
    ]
  };
}

function definitionWithRepeatable(): DocumentDefinition {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "sec-group",
        title: "Imóveis Vistoriados",
        blocks: [],
        repeatable: {
          labelSingular: "Imóvel",
          labelPlural: "Imóveis",
          fields: [{ fieldId: "propertyName", label: "Nome do imóvel", fieldType: "text" }]
        },
        sections: [
          {
            id: "sec-group-detail",
            title: "Características Gerais",
            blocks: [{ id: "blk-group-detail", type: "TechnicalInformation", fields: [] }]
          }
        ]
      }
    ]
  };
}

function definitionWithNestedRepeatable(): DocumentDefinition {
  return {
    schemaVersion: 1,
    sections: [
      {
        id: "sec-outer-group",
        title: "Edificações",
        blocks: [],
        repeatable: {
          labelSingular: "Edificação",
          labelPlural: "Edificações",
          fields: [{ fieldId: "buildingName", label: "Nome", fieldType: "text" }]
        },
        sections: [
          {
            id: "sec-inner-group",
            title: "Ambientes",
            blocks: [],
            repeatable: {
              labelSingular: "Ambiente",
              labelPlural: "Ambientes",
              fields: [{ fieldId: "roomLabel", label: "Rótulo", fieldType: "text" }]
            }
          }
        ]
      }
    ]
  };
}

describe("buildMaterializationPlan() — whole-tree, non-repeatable hierarchy", () => {
  it("4/6. produces one plan node per section/block, preserving hierarchy and order, with definitionId tying back to the definition", () => {
    const plan = buildMaterializationPlan(plainDefinition());
    expect(plan).toHaveLength(2);

    const [sec1, sec2] = plan;
    expect(sec1!.definitionId).toBe("sec-1");
    expect(sec1!.definitionKind).toBe("section");
    expect(sec1!.isRepeatableContainer).toBe(false);
    expect(sec1!.position).toBe(0);
    // blocks first, then nested sections, both position-ordered within the same parent.
    expect(sec1!.children.map((c) => c.definitionId)).toEqual(["blk-1", "blk-2", "sec-1-1"]);
    expect(sec1!.children.map((c) => c.position)).toEqual([0, 1, 2]);
    expect(sec1!.children[2]!.children.map((c) => c.definitionId)).toEqual(["blk-1-1"]);

    expect(sec2!.definitionId).toBe("sec-2");
    expect(sec2!.position).toBe(1);
    expect(sec2!.children.map((c) => c.definitionId)).toEqual(["blk-3"]);
  });

  it("blocks carry their own blockType through to the plan node", () => {
    const plan = buildMaterializationPlan(plainDefinition());
    expect(plan[0]!.children[0]!.blockType).toBe("TechnicalInformation");
    expect(plan[0]!.children[0]!.definitionKind).toBe("block");
  });
});

describe("8. RepeatableGroup materializes as ONE container node — its own subtree defers to buildGroupItemMaterializationPlan()", () => {
  it("a repeatable section's whole-tree plan node has no children (never pre-materialized)", () => {
    const plan = buildMaterializationPlan(definitionWithRepeatable());
    expect(plan).toHaveLength(1);
    expect(plan[0]!.definitionId).toBe("sec-group");
    expect(plan[0]!.isRepeatableContainer).toBe(true);
    expect(plan[0]!.children).toEqual([]);
  });

  it("buildGroupItemMaterializationPlan() materializes exactly that group's own blocks/nested sections for one instance", () => {
    const definition = definitionWithRepeatable();
    const section = findSectionById(definition.sections, "sec-group")!;
    const itemPlan = buildGroupItemMaterializationPlan(section);
    expect(itemPlan.map((n) => n.definitionId)).toEqual(["sec-group-detail"]);
    expect(itemPlan[0]!.children.map((n) => n.definitionId)).toEqual(["blk-group-detail"]);
  });

  it("9. nested RepeatableGroups are supported up to the same MAX_SECTION_DEPTH as everything else — no separate nesting limit exists here", () => {
    const definition = definitionWithNestedRepeatable();
    const outerPlan = buildMaterializationPlan(definition);
    expect(outerPlan[0]!.isRepeatableContainer).toBe(true);
    expect(outerPlan[0]!.children).toEqual([]);

    const outerSection = findSectionById(definition.sections, "sec-outer-group")!;
    const outerItemPlan = buildGroupItemMaterializationPlan(outerSection);
    // The outer group's own instance subtree contains the inner group as
    // ANOTHER container-only node -- same generic recursion, no special
    // casing for "this is a nested group".
    expect(outerItemPlan.map((n) => n.definitionId)).toEqual(["sec-inner-group"]);
    expect(outerItemPlan[0]!.isRepeatableContainer).toBe(true);
    expect(outerItemPlan[0]!.children).toEqual([]);
  });
});

describe("resolveRepeatableSection()", () => {
  it("returns the section when it exists and is repeatable", () => {
    const definition = definitionWithRepeatable();
    const section = resolveRepeatableSection(definition, "sec-group");
    expect(section.id).toBe("sec-group");
  });

  it("throws SectionNotFoundInDefinitionError for an unknown section id", () => {
    const definition = definitionWithRepeatable();
    expect(() => resolveRepeatableSection(definition, "sec-does-not-exist")).toThrow(
      SectionNotFoundInDefinitionError
    );
  });

  it("throws SectionNotRepeatableError for a real, non-repeatable section", () => {
    const definition = plainDefinition();
    expect(() => resolveRepeatableSection(definition, "sec-1")).toThrow(SectionNotRepeatableError);
  });
});

describe("7. reorder stability: ids never change, only position", () => {
  it("A,B,C -> move C between A and B -> A,C,B", () => {
    const reordered = reorderIds(["A", "B", "C"], "C", 1);
    expect(reordered).toEqual(["A", "C", "B"]);
  });

  it("an unknown id leaves the order unchanged", () => {
    expect(reorderIds(["A", "B", "C"], "does-not-exist", 0)).toEqual(["A", "B", "C"]);
  });
});

describe("runtime node states are explicit — hidden/conditional_inactive are first-class, never a silent drop", () => {
  it("includes visible, hidden, and conditional_inactive", () => {
    expect(RUNTIME_NODE_STATES).toEqual(["visible", "hidden", "conditional_inactive"]);
  });
});

describe("buildDocumentTree() — pure assembly from flat RuntimeNode/GroupItem rows", () => {
  it("assembles a plain (non-repeatable) hierarchy in position order", () => {
    const nodes: RuntimeNode[] = [
      node({
        id: "n-sec-1",
        definitionId: "sec-1",
        definitionKind: "section",
        blockType: null,
        position: 0
      }),
      node({ id: "n-blk-1", definitionId: "blk-1", parentNodeId: "n-sec-1", position: 0 }),
      node({ id: "n-blk-2", definitionId: "blk-2", parentNodeId: "n-sec-1", position: 1 }),
      node({
        id: "n-sec-2",
        definitionId: "sec-2",
        definitionKind: "section",
        blockType: null,
        position: 1
      })
    ];
    const tree = buildDocumentTree(nodes, []);
    expect(tree.map((n) => n.definitionId)).toEqual(["sec-1", "sec-2"]);
    expect(tree[0]!.children.map((n) => n.definitionId)).toEqual(["blk-1", "blk-2"]);
    expect(tree[1]!.children).toEqual([]);
  });

  it("22/23. a RepeatableGroup container carries its own GroupItems, each with an independent subtree even though every item shares the same definitionId children", () => {
    const nodes: RuntimeNode[] = [
      node({
        id: "n-group",
        definitionId: "sec-group",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        position: 0
      }),
      node({
        id: "n-a-detail",
        definitionId: "sec-detail",
        definitionKind: "section",
        blockType: null,
        parentNodeId: "n-group",
        groupItemId: "gi-a",
        position: 0
      }),
      node({
        id: "n-a-field",
        definitionId: "blk-field",
        parentNodeId: "n-a-detail",
        groupItemId: "gi-a",
        position: 0
      }),
      node({
        id: "n-b-detail",
        definitionId: "sec-detail",
        definitionKind: "section",
        blockType: null,
        parentNodeId: "n-group",
        groupItemId: "gi-b",
        position: 0
      }),
      node({
        id: "n-b-field",
        definitionId: "blk-field",
        parentNodeId: "n-b-detail",
        groupItemId: "gi-b",
        position: 0
      })
    ];
    const groupItems: GroupItem[] = [
      groupItem({ id: "gi-a", definitionSectionId: "sec-group", containerNodeId: "n-group", position: 0 }),
      groupItem({ id: "gi-b", definitionSectionId: "sec-group", containerNodeId: "n-group", position: 1 })
    ];
    const tree = buildDocumentTree(nodes, groupItems);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.isRepeatableContainer).toBe(true);
    expect(tree[0]!.children).toEqual([]);
    expect(tree[0]!.groupItems).toHaveLength(2);
    expect(tree[0]!.groupItems!.map((gi) => gi.id)).toEqual(["gi-a", "gi-b"]);
    // Same definitionId ("sec-detail"/"blk-field") on both sides, but the
    // actual runtime node ids returned are distinct per GroupItem.
    expect(tree[0]!.groupItems![0]!.children[0]!.id).toBe("n-a-detail");
    expect(tree[0]!.groupItems![1]!.children[0]!.id).toBe("n-b-detail");
    expect(tree[0]!.groupItems![0]!.children[0]!.children[0]!.id).toBe("n-a-field");
    expect(tree[0]!.groupItems![1]!.children[0]!.children[0]!.id).toBe("n-b-field");
  });

  it("nested RepeatableGroups resolve each level's items against the correct enclosing context", () => {
    const nodes: RuntimeNode[] = [
      node({
        id: "n-outer",
        definitionId: "sec-outer",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        position: 0
      }),
      node({
        id: "n-inner-container",
        definitionId: "sec-inner",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        parentNodeId: "n-outer",
        groupItemId: "gi-outer-1",
        position: 0
      }),
      node({
        id: "n-inner-detail",
        definitionId: "sec-inner-detail",
        definitionKind: "section",
        blockType: null,
        parentNodeId: "n-inner-container",
        groupItemId: "gi-inner-1",
        position: 0
      })
    ];
    const groupItems: GroupItem[] = [
      groupItem({
        id: "gi-outer-1",
        definitionSectionId: "sec-outer",
        containerNodeId: "n-outer",
        position: 0
      }),
      groupItem({
        id: "gi-inner-1",
        definitionSectionId: "sec-inner",
        containerNodeId: "n-inner-container",
        parentGroupItemId: "gi-outer-1",
        position: 0
      })
    ];
    const tree = buildDocumentTree(nodes, groupItems);
    const outerItem = tree[0]!.groupItems![0]!;
    expect(outerItem.id).toBe("gi-outer-1");
    const innerContainer = outerItem.children[0]!;
    expect(innerContainer.isRepeatableContainer).toBe(true);
    expect(innerContainer.groupItems).toHaveLength(1);
    expect(innerContainer.groupItems![0]!.id).toBe("gi-inner-1");
    expect(innerContainer.groupItems![0]!.children[0]!.id).toBe("n-inner-detail");
  });

  it("Task 15.5A regression: TWO external GroupItems, each with its OWN nested container sharing the same definitionSectionId — zero collision between their inner items", () => {
    // This is the exact scenario the pre-15.5A bug got wrong: outer group
    // "sec-outer" has two instances (gi-outer-1, gi-outer-2), each
    // materializing its OWN "sec-inner" container node. Before
    // `containerNodeId` existed, `groupItemToTreeNode()` located "the"
    // inner container by searching `nodes` for a node matching
    // `definitionSectionId === "sec-inner"` and returned whichever one
    // `.find()` reached first for BOTH outer items — silently merging or
    // misattributing inner items across outer instances.
    const nodes: RuntimeNode[] = [
      node({
        id: "n-outer-1",
        definitionId: "sec-outer",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        position: 0
      }),
      node({
        id: "n-inner-container-1",
        definitionId: "sec-inner",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        parentNodeId: "n-outer-1",
        groupItemId: "gi-outer-1",
        position: 0
      }),
      node({
        id: "n-inner-detail-1",
        definitionId: "sec-inner-detail",
        definitionKind: "section",
        blockType: null,
        parentNodeId: "n-inner-container-1",
        groupItemId: "gi-inner-1",
        position: 0
      }),
      node({
        id: "n-inner-container-2",
        definitionId: "sec-inner",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        parentNodeId: "n-outer-1",
        groupItemId: "gi-outer-2",
        position: 0
      }),
      node({
        id: "n-inner-detail-2",
        definitionId: "sec-inner-detail",
        definitionKind: "section",
        blockType: null,
        parentNodeId: "n-inner-container-2",
        groupItemId: "gi-inner-2",
        position: 0
      })
    ];
    const groupItems: GroupItem[] = [
      groupItem({
        id: "gi-outer-1",
        definitionSectionId: "sec-outer",
        containerNodeId: "n-outer-1",
        position: 0
      }),
      groupItem({
        id: "gi-outer-2",
        definitionSectionId: "sec-outer",
        containerNodeId: "n-outer-1",
        position: 1
      }),
      groupItem({
        id: "gi-inner-1",
        definitionSectionId: "sec-inner",
        containerNodeId: "n-inner-container-1",
        parentGroupItemId: "gi-outer-1",
        position: 0
      }),
      groupItem({
        id: "gi-inner-2",
        definitionSectionId: "sec-inner",
        containerNodeId: "n-inner-container-2",
        parentGroupItemId: "gi-outer-2",
        position: 0
      })
    ];

    const tree = buildDocumentTree(nodes, groupItems);
    const outer1 = tree[0]!.groupItems!.find((gi) => gi.id === "gi-outer-1")!;
    const outer2 = tree[0]!.groupItems!.find((gi) => gi.id === "gi-outer-2")!;

    const innerContainer1 = outer1.children[0]!;
    const innerContainer2 = outer2.children[0]!;
    expect(innerContainer1.id).toBe("n-inner-container-1");
    expect(innerContainer2.id).toBe("n-inner-container-2");

    // Each outer item's own inner container carries ONLY its own inner
    // item — never the other outer item's.
    expect(innerContainer1.groupItems!.map((gi) => gi.id)).toEqual(["gi-inner-1"]);
    expect(innerContainer2.groupItems!.map((gi) => gi.id)).toEqual(["gi-inner-2"]);
    expect(innerContainer1.groupItems![0]!.children[0]!.id).toBe("n-inner-detail-1");
    expect(innerContainer2.groupItems![0]!.children[0]!.id).toBe("n-inner-detail-2");
  });

  it("19. an archived GroupItem is excluded from the default tree but included with includeArchived:true — never physically dropped from the data", () => {
    const nodes: RuntimeNode[] = [
      node({
        id: "n-group",
        definitionId: "sec-group",
        definitionKind: "section",
        blockType: null,
        isRepeatableContainer: true,
        position: 0
      })
    ];
    const groupItems: GroupItem[] = [
      groupItem({
        id: "gi-a",
        definitionSectionId: "sec-group",
        containerNodeId: "n-group",
        position: 0,
        state: "active"
      }),
      groupItem({
        id: "gi-b",
        definitionSectionId: "sec-group",
        containerNodeId: "n-group",
        position: 1,
        state: "archived"
      })
    ];
    const defaultTree = buildDocumentTree(nodes, groupItems);
    expect(defaultTree[0]!.groupItems!.map((gi) => gi.id)).toEqual(["gi-a"]);

    const fullTree = buildDocumentTree(nodes, groupItems, { includeArchived: true });
    expect(fullTree[0]!.groupItems!.map((gi) => gi.id)).toEqual(["gi-a", "gi-b"]);
  });

  it("16. a conditional_inactive/hidden node still appears in the tree, never silently dropped", () => {
    const nodes: RuntimeNode[] = [
      node({
        id: "n-sec",
        definitionId: "sec-1",
        definitionKind: "section",
        blockType: null,
        state: "conditional_inactive",
        position: 0
      })
    ];
    const tree = buildDocumentTree(nodes, []);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.state).toBe("conditional_inactive");
  });
});

describe("52. architectural test: the runtime document tree engine is global, never per-model", () => {
  it("runtime-document-tree/index.ts contains no reference to any specific technical model/vertical name", () => {
    const path = fileURLToPath(new URL("../src/runtime-document-tree/index.ts", import.meta.url));
    const source = readFileSync(path, "utf-8").toLowerCase();
    const bannedVerticalNames = [
      "cautelar",
      "lindeiro",
      "sinistro",
      "transição",
      "transicao",
      "entrega",
      "cena",
      "vizinhança",
      "vizinhanca",
      "pavimento",
      "ambiente"
    ];
    for (const name of bannedVerticalNames) {
      expect(source.includes(name)).toBe(false);
    }
    expect(source).not.toMatch(/technicalmodel(id|slug)\s*===/);
    expect(source).not.toMatch(/\.slug\s*===\s*["'`]/);
  });

  it("job-source-assignments/index.ts contains no reference to any specific technical model/vertical name", () => {
    const path = fileURLToPath(new URL("../src/job-source-assignments/index.ts", import.meta.url));
    const source = readFileSync(path, "utf-8").toLowerCase();
    const bannedVerticalNames = [
      "cautelar",
      "lindeiro",
      "sinistro",
      "transição",
      "transicao",
      "entrega"
    ];
    for (const name of bannedVerticalNames) {
      expect(source.includes(name)).toBe(false);
    }
  });
});

describe("Section type accepts the same generic `repeatable` shape regardless of what a template calls it", () => {
  it("Imóvel/Ambiente and a wholly different naming produce structurally identical plans", () => {
    const namedOneWay: Section = {
      id: "sec-a",
      title: "Anything",
      blocks: [],
      repeatable: { labelSingular: "X", labelPlural: "Xs", fields: [] }
    };
    const namedAnotherWay: Section = {
      id: "sec-a",
      title: "Anything Else",
      blocks: [],
      repeatable: { labelSingular: "Pavement", labelPlural: "Pavements", fields: [] }
    };
    const planA = buildMaterializationPlan({ schemaVersion: 1, sections: [namedOneWay] });
    const planB = buildMaterializationPlan({ schemaVersion: 1, sections: [namedAnotherWay] });
    expect(planA[0]!.isRepeatableContainer).toBe(true);
    expect(planB[0]!.isRepeatableContainer).toBe(true);
    expect(planA[0]!.children).toEqual(planB[0]!.children);
  });
});

describe("Task 15.5A section 13: performance envelope — a guard, not an optimization", () => {
  it("buildDocumentTree() stays well within a sane time budget for ~500 RuntimeNodes and hundreds of nested GroupItems", () => {
    // A top-level non-repeatable section holding a flat block, plus a
    // top-level repeatable "Edificação" section whose OWN nested
    // repeatable "Ambiente" section is the exact shape this task fixed
    // (Task 15.5A section 2): each outer GroupItem materializes its own
    // inner container node, so many outer items means many inner
    // containers all sharing one definitionSectionId. This exercises
    // nodeToTreeNode()/groupItemToTreeNode() at realistic scale without
    // asserting any specific algorithmic complexity -- only that
    // assembly time stays sane, guarding against an obviously
    // quadratic-or-worse regression, not chasing microseconds.
    const nodes: RuntimeNode[] = [
      node({ id: "n-flat", definitionId: "sec-flat", parentNodeId: null, position: 0 }),
      node({
        id: "n-outer-container",
        definitionId: "sec-outer",
        definitionKind: "section",
        blockType: null,
        parentNodeId: null,
        isRepeatableContainer: true,
        position: 1
      })
    ];
    const groupItems: GroupItem[] = [];

    const OUTER_COUNT = 150;
    const INNER_PER_OUTER = 3;
    for (let i = 0; i < OUTER_COUNT; i++) {
      const outerId = `gi-outer-${i}`;
      const innerContainerId = `n-inner-container-${i}`;
      groupItems.push(
        groupItem({
          id: outerId,
          definitionSectionId: "sec-outer",
          containerNodeId: "n-outer-container",
          position: i
        })
      );
      nodes.push(
        node({
          id: innerContainerId,
          definitionId: "sec-inner",
          definitionKind: "section",
          blockType: null,
          parentNodeId: "n-outer-container",
          groupItemId: outerId,
          isRepeatableContainer: true,
          position: 0
        })
      );
      for (let j = 0; j < INNER_PER_OUTER; j++) {
        const innerId = `gi-inner-${i}-${j}`;
        groupItems.push(
          groupItem({
            id: innerId,
            definitionSectionId: "sec-inner",
            containerNodeId: innerContainerId,
            parentGroupItemId: outerId,
            position: j
          })
        );
        nodes.push(
          node({
            id: `n-inner-detail-${i}-${j}`,
            definitionId: "blk-inner-detail",
            parentNodeId: innerContainerId,
            groupItemId: innerId,
            position: 0
          })
        );
      }
    }

    // 2 base nodes + 150 * (1 inner container + 3 detail nodes) = 602
    // RuntimeNodes; 150 outer + 150*3 inner = 600 GroupItems.
    expect(nodes.length).toBeGreaterThanOrEqual(500);
    expect(groupItems.length).toBeGreaterThanOrEqual(400);

    const start = performance.now();
    const tree = buildDocumentTree(nodes, groupItems);
    const elapsedMs = performance.now() - start;

    // Generous budget for CI-noise tolerance -- this is a guard against
    // an obviously bad architecture (e.g. accidental O(n^3) or repeated
    // full-array rescans per recursion level), not a tight perf
    // assertion. A healthy O(n^2)-ish assembly over ~1000 combined rows
    // finishes in low single-digit milliseconds locally.
    expect(elapsedMs).toBeLessThan(1000);

    // Correctness at scale, not just speed: every outer item's own
    // inner container holds exactly its own inner items -- zero
    // cross-contamination even at 150 sibling containers sharing one
    // definitionSectionId.
    const outerSection = tree.find((n) => n.definitionId === "sec-outer")!;
    expect(outerSection.groupItems).toHaveLength(OUTER_COUNT);
    for (const outerTreeItem of outerSection.groupItems!) {
      const innerContainer = outerTreeItem.children[0]!;
      expect(innerContainer.groupItems).toHaveLength(INNER_PER_OUTER);
    }
  });
});
