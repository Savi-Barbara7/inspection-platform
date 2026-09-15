import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentDefinition, Section } from "../src/templates/blocks";
import {
  buildGroupItemMaterializationPlan,
  buildMaterializationPlan,
  findSectionById,
  reorderIds,
  resolveRepeatableSection,
  RUNTIME_NODE_STATES,
  SectionNotFoundInDefinitionError,
  SectionNotRepeatableError
} from "../src/runtime-document-tree";

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
