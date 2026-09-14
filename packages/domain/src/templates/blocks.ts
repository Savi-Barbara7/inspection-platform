// Controlled Document Block Engine (Task 09). See ADR-0017 and
// docs/domain/TEMPLATES.md "Controlled Block DSL".
//
// This is a GENERIC engine only — no block type, field, or validation
// rule here may be specific to any one technical model ("Cautelar",
// "Inspeção Predial", NR-13, ...). All 14 Phase 1 models (and every
// future one) share exactly these 13 block types; the difference between
// models is which blocks/sections they use and how they're configured,
// never code. Runtime *data* that belongs to other domains not yet built
// (evidence files, finding entries, signature captures, ...) is
// deliberately out of scope here — each block only carries its own
// display/config contract, never a foreign domain's records.
//
// No block type has a field that could hold executable content (no raw
// HTML, no script, no template-injection string) — see AGENTS.md
// "nenhum bloco executa código arbitrário do tenant". Every block schema
// is a Zod `.strict()` object, so an unknown/extra field (e.g. an
// attempted `html`/`__proto__` escape hatch) is rejected deterministically
// rather than silently ignored or passed through.

import { z } from "zod";

export const BLOCK_TYPES = [
  "Cover",
  "TableOfContents",
  "Text",
  "TechnicalInformation",
  "Table",
  "ImportedTable",
  "PhotoSection",
  "DocumentAttachment",
  "Findings",
  "SignatureSection",
  "Header",
  "Footer",
  "PageBreak"
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** The DSL's own schema version — a breaking change to block shapes bumps this, old stored definitions keep validating against their own version. */
export const CURRENT_DEFINITION_SCHEMA_VERSION = 1 as const;

const idSchema = z.string().min(1).max(100);

const coverBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Cover"),
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().trim().min(1).max(200).optional(),
    showLogo: z.boolean().optional(),
    showDate: z.boolean().optional()
  })
  .strict();

const tableOfContentsBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("TableOfContents"),
    title: z.string().trim().min(1).max(200).optional()
  })
  .strict();

const textBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Text"),
    title: z.string().trim().min(1).max(200).optional(),
    // Plain text only (line breaks allowed within the string) — never
    // HTML/markup. A future renderer decides presentation; this block
    // never carries markup of its own.
    content: z.string().max(20000)
  })
  .strict();

const technicalInformationFieldSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1).max(200),
    fieldType: z.enum(["text", "number", "date", "boolean"]),
    value: z.string().max(2000).optional()
  })
  .strict();

const technicalInformationBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("TechnicalInformation"),
    title: z.string().trim().min(1).max(200).optional(),
    fields: z.array(technicalInformationFieldSchema).max(200)
  })
  .strict();

const tableBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Table"),
    title: z.string().trim().min(1).max(200).optional(),
    columns: z.array(z.string().max(200)).max(50),
    rows: z.array(z.array(z.string().max(2000)).max(50)).max(1000)
  })
  .strict();

const importedTableBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("ImportedTable"),
    title: z.string().trim().min(1).max(200).optional(),
    sourceFileName: z.string().max(300).optional(),
    columns: z.array(z.string().max(200)).max(200),
    rows: z.array(z.array(z.string().max(2000)).max(200)).max(5000)
  })
  .strict();

const photoSectionBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("PhotoSection"),
    title: z.string().trim().min(1).max(200).optional(),
    layout: z.enum(["grid", "list"]).optional(),
    captionsRequired: z.boolean().optional()
  })
  .strict();

const documentAttachmentBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("DocumentAttachment"),
    title: z.string().trim().min(1).max(200).optional(),
    allowedFileTypes: z.array(z.string().max(50)).max(50).optional(),
    required: z.boolean().optional()
  })
  .strict();

const findingsBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Findings"),
    title: z.string().trim().min(1).max(200).optional(),
    severityLevels: z.array(z.string().max(50)).max(20).optional()
  })
  .strict();

const signatureSectionBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("SignatureSection"),
    title: z.string().trim().min(1).max(200).optional(),
    signerRoles: z.array(z.string().max(100)).max(20).optional()
  })
  .strict();

const headerBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Header"),
    text: z.string().max(300).optional(),
    showPageNumber: z.boolean().optional()
  })
  .strict();

const footerBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("Footer"),
    text: z.string().max(300).optional(),
    showPageNumber: z.boolean().optional()
  })
  .strict();

const pageBreakBlockSchema = z
  .object({
    id: idSchema,
    type: z.literal("PageBreak")
  })
  .strict();

export const blockSchema = z.discriminatedUnion("type", [
  coverBlockSchema,
  tableOfContentsBlockSchema,
  textBlockSchema,
  technicalInformationBlockSchema,
  tableBlockSchema,
  importedTableBlockSchema,
  photoSectionBlockSchema,
  documentAttachmentBlockSchema,
  findingsBlockSchema,
  signatureSectionBlockSchema,
  headerBlockSchema,
  footerBlockSchema,
  pageBreakBlockSchema
]);

export type Block = z.infer<typeof blockSchema>;
export type CoverBlock = z.infer<typeof coverBlockSchema>;
export type TableOfContentsBlock = z.infer<typeof tableOfContentsBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type TechnicalInformationBlock = z.infer<typeof technicalInformationBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type ImportedTableBlock = z.infer<typeof importedTableBlockSchema>;
export type PhotoSectionBlock = z.infer<typeof photoSectionBlockSchema>;
export type DocumentAttachmentBlock = z.infer<typeof documentAttachmentBlockSchema>;
export type FindingsBlock = z.infer<typeof findingsBlockSchema>;
export type SignatureSectionBlock = z.infer<typeof signatureSectionBlockSchema>;
export type HeaderBlock = z.infer<typeof headerBlockSchema>;
export type FooterBlock = z.infer<typeof footerBlockSchema>;
export type PageBreakBlock = z.infer<typeof pageBreakBlockSchema>;

/** Sections nest up to this many levels deep (a top-level section counts as depth 1) — "controlled" nesting, not arbitrary recursion. */
export const MAX_SECTION_DEPTH = 3;

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
  sections?: Section[] | undefined;
}

const sectionSchema: z.ZodType<Section> = z.lazy(() =>
  z
    .object({
      id: idSchema,
      title: z.string().trim().min(1).max(200),
      blocks: z.array(blockSchema).max(200),
      sections: z.array(sectionSchema).max(50).optional()
    })
    .strict()
);

export interface DocumentDefinition {
  schemaVersion: typeof CURRENT_DEFINITION_SCHEMA_VERSION;
  sections: Section[];
}

const documentDefinitionShapeSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_DEFINITION_SCHEMA_VERSION),
    sections: z.array(sectionSchema).max(100)
  })
  .strict();

export class DuplicateBlockIdError extends Error {
  constructor(public readonly id: string) {
    super(
      `duplicate section/block id "${id}" -- every id must be unique across the whole definition`
    );
    this.name = "DuplicateBlockIdError";
  }
}

export class SectionDepthExceededError extends Error {
  constructor(public readonly maxDepth: number) {
    super(`section nesting exceeds the maximum controlled depth of ${maxDepth}`);
    this.name = "SectionDepthExceededError";
  }
}

function walkSections(sections: Section[], depth: number, seenIds: Set<string>): void {
  if (depth > MAX_SECTION_DEPTH) {
    throw new SectionDepthExceededError(MAX_SECTION_DEPTH);
  }
  for (const section of sections) {
    if (seenIds.has(section.id)) throw new DuplicateBlockIdError(section.id);
    seenIds.add(section.id);
    for (const block of section.blocks) {
      if (seenIds.has(block.id)) throw new DuplicateBlockIdError(block.id);
      seenIds.add(block.id);
    }
    if (section.sections) {
      walkSections(section.sections, depth + 1, seenIds);
    }
  }
}

export type ValidationResult =
  | { valid: true; definition: DocumentDefinition }
  | { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * The single entry point for validating an untrusted definition (e.g. a
 * JSON blob about to be stored on a TechnicalModelVersion/
 * OrganizationModelVersion). Deterministic: the same input always
 * produces the same result, and an invalid input is always rejected --
 * never partially accepted, never coerced.
 *
 * Checks, in order: block/section shapes (Zod, `.strict()`, so unknown
 * fields are rejected outright), then id uniqueness across the entire
 * tree (a duplicate id anywhere -- even between a section and an
 * unrelated block -- is invalid), then nesting depth.
 */
export function validateDocumentDefinition(input: unknown): ValidationResult {
  const parsed = documentDefinitionShapeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  try {
    walkSections(parsed.data.sections, 1, new Set());
  } catch (err) {
    if (err instanceof DuplicateBlockIdError || err instanceof SectionDepthExceededError) {
      return { valid: false, errors: [{ path: "", message: err.message }] };
    }
    throw err;
  }

  return { valid: true, definition: parsed.data };
}

function generateId(prefix: "sec" | "blk"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function generateSectionId(): string {
  return generateId("sec");
}

export function generateBlockId(): string {
  return generateId("blk");
}

/**
 * Moves the item identified by `id` to `newIndex` within `items`,
 * returning a new array (never mutates the input). IDs never change —
 * reordering is purely a matter of array position, which is the single
 * source of truth for order in this engine (no separate/parallel `order`
 * integer to drift out of sync). Out-of-range indices clamp to the
 * nearest valid position; an unknown id returns the input unchanged.
 */
export function reorder<T>(
  items: readonly T[],
  id: string,
  newIndex: number,
  getId: (item: T) => string
): T[] {
  const currentIndex = items.findIndex((item) => getId(item) === id);
  if (currentIndex === -1) return [...items];

  const clampedIndex = Math.max(0, Math.min(newIndex, items.length - 1));
  const next = [...items];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(clampedIndex, 0, moved as T);
  return next;
}

/**
 * Recursively rebuilds an already-validated value with object keys in
 * sorted order (arrays keep their original, order-significant sequence
 * unchanged) so that two logically-identical definitions always produce
 * byte-identical serialized output, regardless of how each was
 * constructed/which key order the code that built it happened to use.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

/** Canonical, stable JSON serialization of a validated DocumentDefinition — see `canonicalize`. */
export function serializeDefinitionCanonical(definition: DocumentDefinition): string {
  return JSON.stringify(canonicalize(definition));
}
