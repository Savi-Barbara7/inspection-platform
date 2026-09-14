import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  CURRENT_DEFINITION_SCHEMA_VERSION,
  canonicalize,
  generateBlockId,
  generateSectionId,
  MAX_SECTION_DEPTH,
  reorder,
  serializeDefinitionCanonical,
  validateDocumentDefinition,
  type DocumentDefinition
} from "../src/templates/blocks";

function minimalDefinition(overrides?: Partial<DocumentDefinition>): DocumentDefinition {
  return {
    schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
    sections: [
      {
        id: "sec-1",
        title: "Capa",
        blocks: [{ id: "blk-1", type: "Cover", title: "Laudo Técnico" }]
      }
    ],
    ...overrides
  };
}

describe("validateDocumentDefinition()", () => {
  it("accepts a minimal valid definition", () => {
    const result = validateDocumentDefinition(minimalDefinition());
    expect(result.valid).toBe(true);
  });

  it("rejects a completely invalid input deterministically", () => {
    const result = validateDocumentDefinition({ not: "a definition" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown block type (no escape hatch for a made-up/custom block)", () => {
    const result = validateDocumentDefinition(
      minimalDefinition({
        sections: [
          {
            id: "sec-1",
            title: "S",
            blocks: [
              {
                id: "blk-1",
                type: "CustomVerticalBlock",
                html: "<script>alert(1)</script>"
              } as never
            ]
          }
        ]
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unknown/extra field on an otherwise-valid block (no HTML/script escape hatch)", () => {
    const result = validateDocumentDefinition(
      minimalDefinition({
        sections: [
          {
            id: "sec-1",
            title: "S",
            blocks: [{ id: "blk-1", type: "Text", content: "ok", html: "<b>x</b>" } as never]
          }
        ]
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a wrong schemaVersion", () => {
    const result = validateDocumentDefinition(minimalDefinition({ schemaVersion: 2 as never }));
    expect(result.valid).toBe(false);
  });

  it("rejects a duplicate id between two sections", () => {
    const result = validateDocumentDefinition({
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections: [
        { id: "sec-1", title: "A", blocks: [] },
        { id: "sec-1", title: "B", blocks: [] }
      ]
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]?.message).toContain("duplicate");
    }
  });

  it("rejects a duplicate id between a section and an unrelated block", () => {
    const result = validateDocumentDefinition({
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections: [{ id: "shared-id", title: "A", blocks: [{ id: "shared-id", type: "PageBreak" }] }]
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a duplicate id across nested subsections", () => {
    const result = validateDocumentDefinition({
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections: [
        {
          id: "sec-1",
          title: "A",
          blocks: [],
          sections: [{ id: "sec-2", title: "A.1", blocks: [{ id: "blk-x", type: "PageBreak" }] }]
        },
        { id: "sec-3", title: "B", blocks: [{ id: "blk-x", type: "PageBreak" }] }
      ]
    });
    expect(result.valid).toBe(false);
  });

  it("accepts nested subsections up to MAX_SECTION_DEPTH", () => {
    let sections = [{ id: "sec-leaf", title: "Leaf", blocks: [] as never[] }];
    for (let i = 0; i < MAX_SECTION_DEPTH - 1; i++) {
      sections = [{ id: `sec-wrap-${i}`, title: `Wrap ${i}`, blocks: [], sections } as never];
    }
    const result = validateDocumentDefinition({
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections
    });
    expect(result.valid).toBe(true);
  });

  it("rejects nesting one level deeper than MAX_SECTION_DEPTH", () => {
    let sections = [{ id: "sec-leaf", title: "Leaf", blocks: [] as never[] }];
    for (let i = 0; i < MAX_SECTION_DEPTH; i++) {
      sections = [{ id: `sec-wrap-${i}`, title: `Wrap ${i}`, blocks: [], sections } as never];
    }
    const result = validateDocumentDefinition({
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections
    });
    expect(result.valid).toBe(false);
  });

  it("validates every one of the 13 controlled block types individually", () => {
    const sampleByType: Record<string, unknown> = {
      Cover: { title: "Capa" },
      TableOfContents: {},
      Text: { content: "texto" },
      TechnicalInformation: {
        fields: [
          { id: "f1", label: "Data", fieldType: "date", required: true, defaultValue: "2026-09-14" }
        ]
      },
      Table: { columns: ["A", "B"], sampleRows: [["1", "2"]] },
      ImportedTable: { columns: ["A"], sampleRows: [["1"]], sourceFileName: "planilha.xlsx" },
      PhotoSection: { layout: "grid" },
      DocumentAttachment: { required: true },
      Findings: { severityLevels: ["baixa", "média", "alta"] },
      SignatureSection: { signerRoles: ["technical_responsible"] },
      Header: { text: "Cabeçalho" },
      Footer: { text: "Rodapé" },
      PageBreak: {}
    };

    expect(Object.keys(sampleByType).sort()).toEqual([...BLOCK_TYPES].sort());

    for (const type of BLOCK_TYPES) {
      const result = validateDocumentDefinition({
        schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
        sections: [
          {
            id: `sec-${type}`,
            title: type,
            blocks: [{ id: `blk-${type}`, type, ...(sampleByType[type] as object) }]
          }
        ]
      });
      expect(result.valid, `${type} should validate`).toBe(true);
    }
  });

  it("validates a realistic full document matching a real Phase 1 model's block list (Inspeção Predial)", () => {
    // Cover, TOC, TechnicalInformation, Table, PhotoSection, Findings,
    // Text, SignatureSection -- from docs/product/technical-models/PHASE1_CATALOG.md TPL-02.
    const definition: DocumentDefinition = {
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION,
      sections: [
        {
          id: generateSectionId(),
          title: "Capa",
          blocks: [
            { id: generateBlockId(), type: "Cover", title: "Inspeção Predial", showDate: true }
          ]
        },
        {
          id: generateSectionId(),
          title: "Sumário",
          blocks: [{ id: generateBlockId(), type: "TableOfContents" }]
        },
        {
          id: generateSectionId(),
          title: "Dados Técnicos",
          blocks: [
            {
              id: generateBlockId(),
              type: "TechnicalInformation",
              fields: [
                { id: generateBlockId(), label: "Endereço", fieldType: "text" },
                { id: generateBlockId(), label: "Data da vistoria", fieldType: "date" }
              ]
            },
            { id: generateBlockId(), type: "Table", columns: ["Sistema", "Condição"] }
          ]
        },
        {
          id: generateSectionId(),
          title: "Registro Fotográfico",
          blocks: [
            { id: generateBlockId(), type: "PhotoSection", layout: "grid", captionsRequired: true }
          ]
        },
        {
          id: generateSectionId(),
          title: "Constatações",
          blocks: [
            {
              id: generateBlockId(),
              type: "Findings",
              severityLevels: ["baixa", "média", "alta", "crítica"]
            },
            { id: generateBlockId(), type: "Text", title: "Recomendações Gerais", content: "..." }
          ]
        },
        {
          id: generateSectionId(),
          title: "Encerramento",
          blocks: [
            {
              id: generateBlockId(),
              type: "SignatureSection",
              signerRoles: ["technical_responsible"]
            }
          ]
        }
      ]
    };

    const result = validateDocumentDefinition(definition);
    expect(result.valid).toBe(true);
  });
});

describe("generateSectionId() / generateBlockId()", () => {
  it("produce distinguishable, unique, stable-looking ids", () => {
    const a = generateSectionId();
    const b = generateSectionId();
    expect(a).not.toBe(b);
    expect(a.startsWith("sec-")).toBe(true);
    expect(generateBlockId().startsWith("blk-")).toBe(true);
  });
});

describe("reorder()", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const getId = (item: { id: string }) => item.id;

  it("moves an item to a new index without mutating the input array", () => {
    const result = reorder(items, "c", 0, getId);
    expect(result.map(getId)).toEqual(["c", "a", "b"]);
    expect(items.map(getId)).toEqual(["a", "b", "c"]);
  });

  it("never changes any item's id, only position", () => {
    const result = reorder(items, "a", 2, getId);
    expect(result.map(getId).sort()).toEqual(["a", "b", "c"]);
  });

  it("clamps an out-of-range index to the nearest valid position", () => {
    const result = reorder(items, "a", 999, getId);
    expect(result.map(getId)).toEqual(["b", "c", "a"]);
  });

  it("returns the list unchanged (a copy) when the id doesn't exist", () => {
    const result = reorder(items, "does-not-exist", 0, getId);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });
});

describe("canonicalize() / serializeDefinitionCanonical()", () => {
  it("produces the same output regardless of object key insertion order", () => {
    const a = { type: "Cover", id: "blk-1", title: "X" };
    const b = { id: "blk-1", title: "X", type: "Cover" };
    expect(JSON.stringify(canonicalize(a))).toBe(JSON.stringify(canonicalize(b)));
  });

  it("preserves array order (order is semantically significant, unlike object key order)", () => {
    const canonicalized = canonicalize({ items: [3, 1, 2] }) as { items: number[] };
    expect(canonicalized.items).toEqual([3, 1, 2]);
  });

  it("serializes a definition identically across two structurally-identical-but-differently-built copies", () => {
    const def1 = minimalDefinition();
    const def2: DocumentDefinition = {
      sections: def1.sections,
      schemaVersion: CURRENT_DEFINITION_SCHEMA_VERSION
    };
    expect(serializeDefinitionCanonical(def1)).toBe(serializeDefinitionCanonical(def2));
  });

  it("produces different output when content actually differs", () => {
    const def1 = minimalDefinition();
    const def2 = minimalDefinition({
      sections: [
        { id: "sec-1", title: "Capa", blocks: [{ id: "blk-1", type: "Cover", title: "Different" }] }
      ]
    });
    expect(serializeDefinitionCanonical(def1)).not.toBe(serializeDefinitionCanonical(def2));
  });
});
