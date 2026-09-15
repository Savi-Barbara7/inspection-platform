// Typed Data Sources, Roles & Bindings (Task 13). See
// docs/domain/DATA_SOURCES.md for the full concept hierarchy and worked
// example.
//
// Core principle: CRIAR UM DADO ≠ CRIAR UM BLOCO. A field like
// Customer.taxId has one semantic identity (this module's
// FieldDefinition registry); a block only ever *presents* it via a
// DataBinding + a presentation-only label/format. Nothing here knows
// about any specific TechnicalModel/OrganizationModel — the catalog is
// global and the same four constructs (SourceType, SourceRole,
// FieldDefinition, DataBinding) serve every vertical without a single
// `if (slug === ...)` branch. See test/data-sources.test.ts's
// "architectural" suite, which greps this file for exactly that.
//
// Deliberately NOT built here (Task 14+): JobRuntimeValue (the actual
// value a field holds in one real job), provenance, overrides, refresh-
// from-cadastro diffing. A DataBinding never contains a real entity id
// (no customerId, no siteId) — only a role/scope + a semantic field id.
// The association with one real entity happens later, in a TechnicalJob
// (not built yet), never inside a template's own definition.

import { z } from "zod";
import type {
  DocumentDefinition,
  RepeatableGroupFieldDefinition,
  Section
} from "../templates/blocks";

export const SOURCE_TYPES = [
  "Organization",
  "Customer",
  "Site",
  "Project",
  "TechnicalProfessional",
  "TechnicalJob",
  "InspectionEvent",
  "GroupItem",
  "CustomData"
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const FIELD_TYPES = [
  "text",
  "multiline_text",
  "number",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "identifier",
  "address",
  "email",
  "phone",
  "enum",
  "reference"
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * WHAT a field means — never WHERE its value comes from (DataBinding)
 * or HOW it's presented (a placement's label/format). Identity is
 * `(sourceType, fieldId)`, never the `label`: two fields both labeled
 * "Endereço" can be entirely different slots (Customer.primaryAddress
 * vs. Site.address), and two different labels ("CNPJ", "Documento
 * fiscal") can point at the same slot depending on configuration.
 */
export interface FieldDefinition {
  sourceType: SourceType;
  fieldId: string;
  fieldType: FieldType;
  /** A default documental label — presentation, not identity. A FieldPlacement's own label always wins when set. */
  label: string;
  required?: boolean;
  /** Only meaningful when fieldType is "enum". */
  enumValues?: readonly string[];
}

function fields(
  sourceType: SourceType,
  defs: Omit<FieldDefinition, "sourceType">[]
): FieldDefinition[] {
  return defs.map((d) => ({ sourceType, ...d }));
}

/**
 * The global field catalog — one entry per (SourceType, fieldId). Data,
 * not code: the exact same registry backs every vertical. GroupItem is
 * deliberately empty here — a RepeatableGroup's own schema is defined
 * by the model itself (not built yet), so GroupItem-scoped bindings
 * skip the "fieldId is known" check (see validateDataBinding below).
 */
export const FIELD_DEFINITIONS: Readonly<Record<SourceType, readonly FieldDefinition[]>> = {
  Organization: fields("Organization", [
    { fieldId: "legalName", fieldType: "text", label: "Razão social", required: true },
    { fieldId: "displayName", fieldType: "text", label: "Nome fantasia" },
    { fieldId: "taxId", fieldType: "identifier", label: "CNPJ" },
    { fieldId: "address", fieldType: "address", label: "Endereço" },
    { fieldId: "phone", fieldType: "phone", label: "Telefone" },
    { fieldId: "email", fieldType: "email", label: "E-mail" }
  ]),
  Customer: fields("Customer", [
    {
      fieldId: "personType",
      fieldType: "enum",
      label: "Tipo de pessoa",
      enumValues: ["individual", "organization"]
    },
    { fieldId: "legalName", fieldType: "text", label: "Razão social", required: true },
    { fieldId: "displayName", fieldType: "text", label: "Nome" },
    { fieldId: "tradeName", fieldType: "text", label: "Nome fantasia" },
    { fieldId: "taxId", fieldType: "identifier", label: "Documento (CPF/CNPJ)" },
    { fieldId: "primaryAddress", fieldType: "address", label: "Endereço" },
    { fieldId: "phone", fieldType: "phone", label: "Telefone" },
    { fieldId: "email", fieldType: "email", label: "E-mail" }
  ]),
  Site: fields("Site", [
    { fieldId: "name", fieldType: "text", label: "Nome do local", required: true },
    { fieldId: "address", fieldType: "address", label: "Endereço" },
    { fieldId: "code", fieldType: "identifier", label: "Código/matrícula" },
    { fieldId: "description", fieldType: "multiline_text", label: "Descrição" }
  ]),
  Project: fields("Project", [
    { fieldId: "name", fieldType: "text", label: "Nome do projeto", required: true },
    { fieldId: "code", fieldType: "identifier", label: "Código/referência" },
    { fieldId: "description", fieldType: "multiline_text", label: "Descrição" }
  ]),
  TechnicalProfessional: fields("TechnicalProfessional", [
    { fieldId: "name", fieldType: "text", label: "Nome", required: true },
    { fieldId: "title", fieldType: "text", label: "Título profissional" },
    { fieldId: "registrationNumber", fieldType: "identifier", label: "Registro profissional" },
    { fieldId: "jurisdiction", fieldType: "text", label: "Jurisdição do registro" },
    { fieldId: "email", fieldType: "email", label: "E-mail" },
    { fieldId: "phone", fieldType: "phone", label: "Telefone" }
  ]),
  TechnicalJob: fields("TechnicalJob", [
    { fieldId: "name", fieldType: "text", label: "Nome do trabalho" },
    { fieldId: "code", fieldType: "identifier", label: "Código do trabalho" },
    { fieldId: "scope", fieldType: "multiline_text", label: "Escopo" },
    { fieldId: "referenceDate", fieldType: "date", label: "Data de referência" }
  ]),
  InspectionEvent: fields("InspectionEvent", [
    { fieldId: "date", fieldType: "date", label: "Data da vistoria", required: true },
    { fieldId: "startTime", fieldType: "datetime", label: "Início" },
    { fieldId: "endTime", fieldType: "datetime", label: "Término" },
    { fieldId: "notes", fieldType: "multiline_text", label: "Observações" }
  ]),
  // Schema defined by the model (RepeatableGroup, not built yet) --
  // never a fixed global list. See validateDataBinding.
  GroupItem: [],
  CustomData: fields("CustomData", [
    { fieldId: "contractNumber", fieldType: "identifier", label: "Número do contrato" },
    {
      fieldId: "constructionPermitNumber",
      fieldType: "identifier",
      label: "Número do alvará de construção"
    },
    { fieldId: "internalReference", fieldType: "identifier", label: "Referência interna" }
  ])
};

export function getFieldDefinition(
  sourceType: SourceType,
  fieldId: string
): FieldDefinition | undefined {
  return FIELD_DEFINITIONS[sourceType].find((f) => f.fieldId === fieldId);
}

/**
 * A role a source entity plays in a job — NOT the same thing as its
 * SourceType. Two roles can resolve to the same underlying entity
 * (e.g. `customer` and `requester` might be the same Customer row in a
 * given job), and the same SourceType can back several distinct roles
 * (`outgoingContractor`/`incomingContractor` are both Customer). Flat,
 * non-verticalized registry: no role here is specific to a document
 * type, and adding a template-specific role is a data change here, not
 * a code branch anywhere else.
 */
export type SourceRoleId =
  | "customer"
  | "requester"
  | "owner"
  | "contractor"
  | "insurer"
  | "previousContractor"
  | "outgoingContractor"
  | "incomingContractor"
  | "primarySite"
  | "project"
  | "primaryProfessional"
  | "supportingProfessional";

export const SOURCE_ROLE_IDS: readonly SourceRoleId[] = [
  "customer",
  "requester",
  "owner",
  "contractor",
  "insurer",
  "previousContractor",
  "outgoingContractor",
  "incomingContractor",
  "primarySite",
  "project",
  "primaryProfessional",
  "supportingProfessional"
];

export type RoleCardinality = "single" | "multiple";

export interface SourceRoleDefinition {
  roleId: SourceRoleId;
  sourceType: SourceType;
  cardinality: RoleCardinality;
}

/**
 * A role's cardinality is declared, never inferred. A "single" role
 * resolving to zero or many candidates at runtime (Task 15+) is an
 * explicit absent/ambiguous state to surface — never silently "pick the
 * first one found".
 */
export const SOURCE_ROLES: Readonly<Record<SourceRoleId, SourceRoleDefinition>> = {
  customer: { roleId: "customer", sourceType: "Customer", cardinality: "single" },
  requester: { roleId: "requester", sourceType: "Customer", cardinality: "single" },
  owner: { roleId: "owner", sourceType: "Customer", cardinality: "single" },
  contractor: { roleId: "contractor", sourceType: "Customer", cardinality: "single" },
  insurer: { roleId: "insurer", sourceType: "Customer", cardinality: "single" },
  previousContractor: {
    roleId: "previousContractor",
    sourceType: "Customer",
    cardinality: "single"
  },
  outgoingContractor: {
    roleId: "outgoingContractor",
    sourceType: "Customer",
    cardinality: "single"
  },
  incomingContractor: {
    roleId: "incomingContractor",
    sourceType: "Customer",
    cardinality: "single"
  },
  primarySite: { roleId: "primarySite", sourceType: "Site", cardinality: "single" },
  project: { roleId: "project", sourceType: "Project", cardinality: "single" },
  primaryProfessional: {
    roleId: "primaryProfessional",
    sourceType: "TechnicalProfessional",
    cardinality: "single"
  },
  supportingProfessional: {
    roleId: "supportingProfessional",
    sourceType: "TechnicalProfessional",
    cardinality: "multiple"
  }
};

const roleScopeSchema = z
  .object({
    kind: z.literal("role"),
    role: z.enum(SOURCE_ROLE_IDS as [SourceRoleId, ...SourceRoleId[]])
  })
  .strict();
const currentGroupItemScopeSchema = z.object({ kind: z.literal("currentGroupItem") }).strict();
const ancestorGroupItemScopeSchema = z
  .object({ kind: z.literal("ancestorGroupItem"), levelsUp: z.number().int().min(1).max(10) })
  .strict();
const jobScopeSchema = z.object({ kind: z.literal("job") }).strict();
const inspectionEventScopeSchema = z
  .object({ kind: z.literal("inspectionEvent"), selector: z.enum(["first", "last"]) })
  .strict();

/**
 * WHERE (structurally) a binding looks for its entity — a role, the
 * group item currently being rendered, an ancestor group item N levels
 * up, the job itself, or a selected inspection event. Never an array
 * index (`groups[0]`) and never a real entity id: bindings must survive
 * reordering and must never leak a specific tenant's row into a
 * template (see docs/domain/DATA_SOURCES.md "Isolamento").
 */
export const bindingScopeSchema = z.discriminatedUnion("kind", [
  roleScopeSchema,
  currentGroupItemScopeSchema,
  ancestorGroupItemScopeSchema,
  jobScopeSchema,
  inspectionEventScopeSchema
]);

export type BindingScope = z.infer<typeof bindingScopeSchema>;

export function resolveScopeSourceType(scope: BindingScope): SourceType {
  switch (scope.kind) {
    case "role":
      return SOURCE_ROLES[scope.role].sourceType;
    case "currentGroupItem":
    case "ancestorGroupItem":
      return "GroupItem";
    case "job":
      return "TechnicalJob";
    case "inspectionEvent":
      return "InspectionEvent";
  }
}

export const dataBindingSchema = z
  .object({
    id: z.string().min(1).max(100),
    scope: bindingScopeSchema,
    fieldId: z.string().min(1).max(100)
  })
  .strict();

/**
 * References a semantic slot by role/scope + fieldId — never a real
 * entity. A template's DataBinding for `{kind:"role", role:"customer"}`
 * + `fieldId:"taxId"` looks identical whether it ends up resolving, in
 * some future job, to Org A's customer or Org B's — the binding itself
 * carries no tenant-specific id at all (enforced structurally: this
 * schema is `.strict()` and simply has no field that could hold one).
 */
export type DataBinding = z.infer<typeof dataBindingSchema>;

export const FIELD_FORMATS = [
  "default",
  "dateShort",
  "dateLong",
  "identifierFormatted",
  "addressSingleLine",
  "addressMultiLine",
  "numberFormatted",
  "currency"
] as const;

export type FieldFormat = (typeof FIELD_FORMATS)[number];

/**
 * Which presentation formats make sense for a given semantic field
 * type — a typed, closed list (never an arbitrary expression/eval; see
 * AGENTS.md "nenhum bloco executa código arbitrário do tenant"). A
 * field type not listed here only accepts "default".
 */
const COMPATIBLE_FORMATS: Readonly<Partial<Record<FieldType, readonly FieldFormat[]>>> = {
  number: ["default", "numberFormatted", "currency"],
  decimal: ["default", "numberFormatted", "currency"],
  date: ["default", "dateShort", "dateLong"],
  datetime: ["default", "dateShort", "dateLong"],
  identifier: ["default", "identifierFormatted"],
  address: ["default", "addressSingleLine", "addressMultiLine"]
};

export function isFormatCompatible(fieldType: FieldType, format: FieldFormat): boolean {
  const allowed = COMPATIBLE_FORMATS[fieldType] ?? ["default"];
  return (allowed as readonly FieldFormat[]).includes(format);
}

export type DataBindingValidationResult =
  | { valid: true; binding: DataBinding }
  | { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * The single entry point for validating one untrusted DataBinding.
 * Checks shape first (Zod `.strict()`, so an attempted extra field —
 * e.g. a smuggled `customerId` — is rejected outright), then that
 * `fieldId` actually exists on the scope's resolved SourceType's
 * registry. Skipped for GroupItem, whose schema is defined by the
 * model itself (not global) and isn't built yet.
 */
export function validateDataBinding(input: unknown): DataBindingValidationResult {
  const parsed = dataBindingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  const sourceType = resolveScopeSourceType(parsed.data.scope);
  if (sourceType !== "GroupItem" && !getFieldDefinition(sourceType, parsed.data.fieldId)) {
    return {
      valid: false,
      errors: [
        {
          path: "fieldId",
          message: `"${parsed.data.fieldId}" is not a known field on ${sourceType}`
        }
      ]
    };
  }

  return { valid: true, binding: parsed.data };
}

export type DataBindingsValidationResult =
  { valid: true } | { valid: false; errors: Array<{ path: string; message: string }> };

/**
 * Cross-referential validation across a whole DocumentDefinition:
 * every declared DataBinding is individually valid and has a unique
 * id; every TechnicalInformation field's `bindingId` (when present)
 * names a binding that actually exists; and a field's `format` (when
 * present) is compatible with its bound field's semantic type. Deemed
 * separate from Task 09's validateDocumentDefinition() on purpose --
 * that function stays about structural validity (shape/ids/depth) of
 * the document tree; this one is about the semantic validity of the
 * bindings inside it. Callers that care about both call both.
 */
export function validateDataBindingsInDefinition(
  definition: DocumentDefinition
): DataBindingsValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const bindingsById = new Map<string, DataBinding>();
  const seenBindingIds = new Set<string>();

  const declaredBindings = definition.dataBindings ?? [];
  declaredBindings.forEach((raw, index) => {
    const result = validateDataBinding(raw);
    if (!result.valid) {
      for (const e of result.errors) {
        errors.push({ path: `dataBindings.${index}.${e.path}`, message: e.message });
      }
      return;
    }
    if (seenBindingIds.has(result.binding.id)) {
      errors.push({
        path: `dataBindings.${index}.id`,
        message: `duplicate DataBinding id "${result.binding.id}"`
      });
      return;
    }
    seenBindingIds.add(result.binding.id);
    bindingsById.set(result.binding.id, result.binding);
  });

  // Task 15 closes the Task 13 debt: a currentGroupItem/ancestorGroupItem
  // binding is validated against the schema of the *enclosing repeatable
  // group it's actually used in* -- never a global GroupItem registry
  // (there isn't one, and there never will be: a repeatable group's own
  // field names are template data, not engine vocabulary) and never a
  // lookup keyed by model slug. groupSchemaStack carries one entry per
  // enclosing repeatable section, innermost last, so nested groups
  // resolve `currentGroupItem` (levelsUp 0) and `ancestorGroupItem`
  // (levelsUp N) unambiguously.
  function findGroupItemFieldDefinition(
    binding: DataBinding,
    groupSchemaStack: readonly RepeatableGroupFieldDefinition[][]
  ): { fieldDef?: RepeatableGroupFieldDefinition; error?: string } {
    const levelsUp = binding.scope.kind === "ancestorGroupItem" ? binding.scope.levelsUp : 0;
    const index = groupSchemaStack.length - 1 - levelsUp;
    if (index < 0) {
      return {
        error: `no enclosing repeatable group ${levelsUp} level(s) up from where this binding is used`
      };
    }
    const schema = groupSchemaStack[index]!;
    const fieldDef = schema.find((f) => f.fieldId === binding.fieldId);
    if (!fieldDef) {
      return {
        error: `"${binding.fieldId}" is not a declared field on the enclosing repeatable group`
      };
    }
    return { fieldDef };
  }

  function visitSections(
    sections: Section[],
    path: string,
    groupSchemaStack: readonly RepeatableGroupFieldDefinition[][]
  ): void {
    sections.forEach((section, sectionIndex) => {
      // This section's own fields (if it's a repeatable group) apply to
      // both its own direct blocks and everything nested under it --
      // pushed onto the stack before either is visited.
      const stackHere = section.repeatable
        ? [...groupSchemaStack, section.repeatable.fields]
        : groupSchemaStack;

      section.blocks.forEach((block, blockIndex) => {
        if (block.type !== "TechnicalInformation") return;
        block.fields.forEach((field, fieldIndex) => {
          if (field.bindingId === undefined) return;
          const fieldPath = `${path}.${sectionIndex}.blocks.${blockIndex}.fields.${fieldIndex}`;
          const binding = bindingsById.get(field.bindingId);
          if (!binding) {
            errors.push({
              path: `${fieldPath}.bindingId`,
              message: `"${field.bindingId}" does not match any entry in dataBindings`
            });
            return;
          }

          const sourceType = resolveScopeSourceType(binding.scope);
          let fieldDef: { fieldType: FieldType } | undefined;
          if (sourceType === "GroupItem") {
            const result = findGroupItemFieldDefinition(binding, stackHere);
            if (result.error) {
              errors.push({ path: `${fieldPath}.bindingId`, message: result.error });
            } else {
              fieldDef = result.fieldDef;
            }
          } else {
            fieldDef = getFieldDefinition(sourceType, binding.fieldId);
          }

          if (
            field.format !== undefined &&
            fieldDef &&
            !isFormatCompatible(fieldDef.fieldType, field.format)
          ) {
            errors.push({
              path: `${fieldPath}.format`,
              message: `format "${field.format}" is not compatible with field type "${fieldDef.fieldType}"`
            });
          }
        });
      });
      if (section.sections)
        visitSections(section.sections, `${path}.${sectionIndex}.sections`, stackHere);
    });
  }
  visitSections(definition.sections, "sections", []);

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export interface DataSourceCatalogEntry {
  sourceType: SourceType;
  fields: readonly FieldDefinition[];
}

export type SourceRoleCatalogEntry = SourceRoleDefinition;

/**
 * A deterministic, global listing meant to back a future "+ Adicionar
 * campo → Usar dado existente" picker — never filtered by organization
 * or by which TechnicalModel is open (no slug/id parameter exists on
 * this function at all). What an organization is actually allowed to
 * place is an authorization concern for whichever future UI calls this,
 * not something this catalog encodes.
 */
export function getDataSourceCatalog(): DataSourceCatalogEntry[] {
  return SOURCE_TYPES.map((sourceType) => ({ sourceType, fields: FIELD_DEFINITIONS[sourceType] }));
}

export function getSourceRoleCatalog(): SourceRoleCatalogEntry[] {
  return SOURCE_ROLE_IDS.map((roleId) => SOURCE_ROLES[roleId]);
}
