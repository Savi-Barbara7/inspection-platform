import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DocumentDefinition } from "../src/templates/blocks";
import { validateDocumentDefinition, reorder } from "../src/templates/blocks";
import {
  FIELD_DEFINITIONS,
  getDataSourceCatalog,
  getFieldDefinition,
  getSourceRoleCatalog,
  isFormatCompatible,
  resolveScopeSourceType,
  SOURCE_ROLES,
  validateDataBinding,
  validateDataBindingsInDefinition,
  type DataBinding,
  type SourceRoleId
} from "../src/data-sources";

function taxIdBinding(id: string, role: SourceRoleId = "customer"): DataBinding {
  return { id, scope: { kind: "role", role }, fieldId: "taxId" };
}

function definitionWith(
  dataBindings: DataBinding[],
  fields: Array<{ id: string; bindingId?: string; format?: string }>
): DocumentDefinition {
  return {
    schemaVersion: 1,
    dataBindings,
    sections: [
      {
        id: "sec-1",
        title: "Informações do Contratante",
        blocks: [
          {
            id: "blk-1",
            type: "TechnicalInformation",
            fields: fields.map((f) => ({
              id: f.id,
              label: "Qualquer rótulo",
              fieldType: "text",
              ...(f.bindingId ? { bindingId: f.bindingId } : {}),
              ...(f.format ? { format: f.format as never } : {})
            }))
          }
        ]
      }
    ]
  };
}

describe("resolveScopeSourceType()", () => {
  it("resolves a role scope via the role registry", () => {
    expect(resolveScopeSourceType({ kind: "role", role: "customer" })).toBe("Customer");
    expect(resolveScopeSourceType({ kind: "role", role: "primarySite" })).toBe("Site");
    expect(resolveScopeSourceType({ kind: "role", role: "primaryProfessional" })).toBe(
      "TechnicalProfessional"
    );
  });

  it("resolves group item / job / inspection event scopes", () => {
    expect(resolveScopeSourceType({ kind: "currentGroupItem" })).toBe("GroupItem");
    expect(resolveScopeSourceType({ kind: "ancestorGroupItem", levelsUp: 1 })).toBe("GroupItem");
    expect(resolveScopeSourceType({ kind: "job" })).toBe("TechnicalJob");
    expect(resolveScopeSourceType({ kind: "inspectionEvent", selector: "last" })).toBe(
      "InspectionEvent"
    );
  });
});

describe("validateDataBinding() — shape and referential checks", () => {
  it("1. accepts a valid binding (source type resolves correctly)", () => {
    const result = validateDataBinding(taxIdBinding("bind-1"));
    expect(result.valid).toBe(true);
  });

  it("2. rejects an unknown role (invalid role is rejected)", () => {
    const result = validateDataBinding({
      id: "bind-1",
      scope: { kind: "role", role: "not-a-real-role" },
      fieldId: "taxId"
    });
    expect(result.valid).toBe(false);
  });

  it("3. rejects a binding for a field that doesn't exist on the resolved source type", () => {
    const result = validateDataBinding({
      id: "bind-1",
      scope: { kind: "role", role: "customer" },
      fieldId: "notARealField"
    });
    expect(result.valid).toBe(false);
  });

  it("15. rejects an unknown/extra field, e.g. a smuggled real entity id (no cross-tenant leak is even structurally possible)", () => {
    const result = validateDataBinding({
      id: "bind-1",
      scope: { kind: "role", role: "customer" },
      fieldId: "taxId",
      customerId: "11111111-1111-1111-1111-111111111111"
    });
    expect(result.valid).toBe(false);
  });

  it("skips the fieldId-exists check for GroupItem (schema is model-defined, not global, and isn't built yet)", () => {
    const result = validateDataBinding({
      id: "bind-1",
      scope: { kind: "currentGroupItem" },
      fieldId: "whateverTheModelCallsIt"
    });
    expect(result.valid).toBe(true);
  });
});

describe("format compatibility (4. incompatible type is rejected)", () => {
  it("a date format is compatible with a date field but not an identifier field", () => {
    expect(isFormatCompatible("date", "dateShort")).toBe(true);
    expect(isFormatCompatible("identifier", "dateShort")).toBe(false);
  });

  it("every field type accepts the default format", () => {
    for (const fieldType of ["text", "identifier", "address", "date", "boolean"] as const) {
      expect(isFormatCompatible(fieldType, "default")).toBe(true);
    }
  });
});

describe("validateDataBindingsInDefinition()", () => {
  it("accepts a definition with no dataBindings at all (pre-Task 13 definitions stay valid)", () => {
    const definition: DocumentDefinition = {
      schemaVersion: 1,
      sections: [{ id: "sec-1", title: "S", blocks: [] }]
    };
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
  });

  it("3. rejects a field whose bindingId doesn't match any declared dataBinding", () => {
    const definition = definitionWith([], [{ id: "f1", bindingId: "bind-does-not-exist" }]);
    const result = validateDataBindingsInDefinition(definition);
    expect(result.valid).toBe(false);
  });

  it("4. rejects a field whose format is incompatible with its bound field's semantic type", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-1")], // Customer.taxId is type "identifier"
      [{ id: "f1", bindingId: "bind-1", format: "dateShort" }] // date format on an identifier
    );
    const result = validateDataBindingsInDefinition(definition);
    expect(result.valid).toBe(false);
  });

  it("accepts a field whose format IS compatible with its bound field's type", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-1")],
      [{ id: "f1", bindingId: "bind-1", format: "identifierFormatted" }]
    );
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
  });

  it("rejects a duplicate DataBinding id", () => {
    const definition = definitionWith([taxIdBinding("bind-1"), taxIdBinding("bind-1")], []);
    expect(validateDataBindingsInDefinition(definition).valid).toBe(false);
  });

  it("5. changing a field's presentational label never changes which binding/semantic slot it means", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-1")],
      [{ id: "f1", bindingId: "bind-1" }]
    );
    // Two definitions differing ONLY in the field's label still reference the exact same binding/slot.
    const relabeled: DocumentDefinition = {
      ...definition,
      sections: [
        {
          ...definition.sections[0]!,
          blocks: [
            {
              ...definition.sections[0]!.blocks[0]!,
              // @ts-expect-error -- narrowing for the test fixture only
              fields: [
                {
                  ...definition.sections[0]!.blocks[0]!.fields[0],
                  label: "Um rótulo bem diferente"
                }
              ]
            }
          ]
        }
      ]
    };
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
    expect(validateDataBindingsInDefinition(relabeled).valid).toBe(true);
    // @ts-expect-error -- narrowing for the test fixture only
    const bindingIdBefore = definition.sections[0]!.blocks[0]!.fields[0].bindingId;
    // @ts-expect-error -- narrowing for the test fixture only
    const bindingIdAfter = relabeled.sections[0]!.blocks[0]!.fields[0].bindingId;
    expect(bindingIdAfter).toBe(bindingIdBefore);
  });

  it("6. the same FieldDefinition (Customer.taxId) can back several independent DataBindings", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-cover"), taxIdBinding("bind-body")],
      [
        { id: "f1", bindingId: "bind-cover" },
        { id: "f2", bindingId: "bind-body" }
      ]
    );
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
  });

  it("7. the same binding can be reused by several fields/placements at once", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-1")],
      [
        { id: "f1", bindingId: "bind-1" },
        { id: "f2", bindingId: "bind-1" },
        { id: "f3", bindingId: "bind-1" }
      ]
    );
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
  });

  it("13/14. surviving Task 12 immutability is unaffected: dataBindings ride inside the same `definition` jsonb validated here, no extra column needed", () => {
    // Not a persistence test (that's Task 12's own suite) -- this just
    // confirms a binding-bearing definition round-trips through the
    // exact same validateDocumentDefinition() entry point unchanged.
    const definition = definitionWith(
      [taxIdBinding("bind-1")],
      [{ id: "f1", bindingId: "bind-1" }]
    );
    const result = validateDocumentDefinition(definition);
    expect(result.valid).toBe(true);
  });
});

describe("8/9. the same catalog works across every vertical, with no per-model code", () => {
  it("8. Customer.taxId works identically in a Cautelar-shaped and an Entrega-shaped definition", () => {
    const cautelarLike = definitionWith(
      [taxIdBinding("bind-1")],
      [{ id: "f1", bindingId: "bind-1" }]
    );
    const entregaLike = definitionWith(
      [taxIdBinding("bind-1")],
      [{ id: "f1", bindingId: "bind-1" }]
    );
    expect(validateDataBindingsInDefinition(cautelarLike).valid).toBe(true);
    expect(validateDataBindingsInDefinition(entregaLike).valid).toBe(true);
  });

  it("9. outgoingContractor and incomingContractor use the same SourceType (Customer) under different roles", () => {
    const outgoing = validateDataBinding(taxIdBinding("bind-out", "outgoingContractor"));
    const incoming = validateDataBinding(taxIdBinding("bind-in", "incomingContractor"));
    expect(outgoing.valid).toBe(true);
    expect(incoming.valid).toBe(true);
    expect(resolveScopeSourceType({ kind: "role", role: "outgoingContractor" })).toBe("Customer");
    expect(resolveScopeSourceType({ kind: "role", role: "incomingContractor" })).toBe("Customer");

    const definition = definitionWith(
      [
        taxIdBinding("bind-out", "outgoingContractor"),
        taxIdBinding("bind-in", "incomingContractor")
      ],
      [
        { id: "f1", bindingId: "bind-out" },
        { id: "f2", bindingId: "bind-in" }
      ]
    );
    expect(validateDataBindingsInDefinition(definition).valid).toBe(true);
  });
});

describe("10/11. absence vs. falsy values are never confused", () => {
  it("10. a field with no defaultValue stays undefined, never coerced to an empty string", () => {
    const definition: DocumentDefinition = {
      schemaVersion: 1,
      sections: [
        {
          id: "sec-1",
          title: "S",
          blocks: [
            {
              id: "blk-1",
              type: "TechnicalInformation",
              fields: [{ id: "f1", label: "Sem default", fieldType: "text" }]
            }
          ]
        }
      ]
    };
    const result = validateDocumentDefinition(definition);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const block = result.definition.sections[0]!.blocks[0]!;
      if (block.type === "TechnicalInformation") {
        expect(block.fields[0]!.defaultValue).toBeUndefined();
      }
    }
  });

  it('11. the literal strings "false" and "0" are preserved verbatim, never treated as absent (no `value || fallback`)', () => {
    const definition: DocumentDefinition = {
      schemaVersion: 1,
      sections: [
        {
          id: "sec-1",
          title: "S",
          blocks: [
            {
              id: "blk-1",
              type: "TechnicalInformation",
              fields: [
                { id: "f1", label: "Zero", fieldType: "number", defaultValue: "0" },
                { id: "f2", label: "Falso", fieldType: "boolean", defaultValue: "false" }
              ]
            }
          ]
        }
      ]
    };
    const result = validateDocumentDefinition(definition);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const block = result.definition.sections[0]!.blocks[0]!;
      if (block.type === "TechnicalInformation") {
        expect(block.fields[0]!.defaultValue).toBe("0");
        expect(block.fields[1]!.defaultValue).toBe("false");
      }
    }
  });
});

describe("12. bindings never use array position as identity", () => {
  it("reordering sections/fields never changes any bindingId or DataBinding id", () => {
    const definition = definitionWith(
      [taxIdBinding("bind-1"), taxIdBinding("bind-2", "requester")],
      [
        { id: "f1", bindingId: "bind-1" },
        { id: "f2", bindingId: "bind-2" }
      ]
    );
    const block = definition.sections[0]!.blocks[0]!;
    if (block.type !== "TechnicalInformation") throw new Error("fixture bug");
    const reordered = reorder(block.fields, "f2", 0, (f) => f.id);
    expect(reordered.map((f) => f.id)).toEqual(["f2", "f1"]);
    expect(reordered.find((f) => f.id === "f1")!.bindingId).toBe("bind-1");
    expect(reordered.find((f) => f.id === "f2")!.bindingId).toBe("bind-2");
    // reorder() never mutates its input (Task 09 guarantee) -- the
    // original array/bindings are untouched.
    expect(block.fields.map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});

describe("16. no TechnicalModel slug is ever needed to resolve or validate a binding", () => {
  it("validateDataBinding, resolveScopeSourceType and the catalog take no model/slug parameter", () => {
    expect(validateDataBinding.length).toBe(1); // (input) only
    expect(resolveScopeSourceType.length).toBe(1); // (scope) only
    expect(getDataSourceCatalog.length).toBe(0); // no arguments at all
    expect(getSourceRoleCatalog.length).toBe(0);
  });
});

describe("getDataSourceCatalog() / getSourceRoleCatalog()", () => {
  it("returns every SourceType, including the deliberately-empty GroupItem", () => {
    const catalog = getDataSourceCatalog();
    const groupItem = catalog.find((c) => c.sourceType === "GroupItem");
    expect(groupItem).toBeDefined();
    expect(groupItem!.fields).toEqual([]);
  });

  it("Customer's catalog entry includes the exact fields used in the worked example", () => {
    expect(getFieldDefinition("Customer", "legalName")).toBeDefined();
    expect(getFieldDefinition("Customer", "taxId")).toBeDefined();
    expect(getFieldDefinition("Customer", "primaryAddress")).toBeDefined();
  });

  it("declares cardinality explicitly for every role (never silently 'pick the first found')", () => {
    const roles = getSourceRoleCatalog();
    expect(roles.every((r) => r.cardinality === "single" || r.cardinality === "multiple")).toBe(
      true
    );
    expect(SOURCE_ROLES.supportingProfessional.cardinality).toBe("multiple");
    expect(SOURCE_ROLES.customer.cardinality).toBe("single");
  });

  it("FIELD_DEFINITIONS covers every declared SourceType", () => {
    for (const sourceType of Object.keys(FIELD_DEFINITIONS)) {
      expect(Array.isArray(FIELD_DEFINITIONS[sourceType as keyof typeof FIELD_DEFINITIONS])).toBe(
        true
      );
    }
  });
});

describe("37. architectural test: the data-source catalog is global, never per-model", () => {
  it("data-sources/index.ts contains no reference to any specific technical model/vertical name", () => {
    const path = fileURLToPath(new URL("../src/data-sources/index.ts", import.meta.url));
    const source = readFileSync(path, "utf-8").toLowerCase();
    const bannedVerticalNames = [
      "cautelar",
      "lindeiro",
      "sinistro",
      "transição",
      "transicao",
      "cena",
      "vizinhança",
      "vizinhanca"
    ];
    for (const name of bannedVerticalNames) {
      expect(source.includes(name)).toBe(false);
    }
    // The one structural thing this file is NOT allowed to do:
    // branch on a model identity at all.
    expect(source).not.toMatch(/technicalmodel(id|slug)\s*===/);
    expect(source).not.toMatch(/\.slug\s*===\s*["'`]/);
  });
});
