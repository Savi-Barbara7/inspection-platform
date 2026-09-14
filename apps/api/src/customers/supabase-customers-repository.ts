import type {
  Customer,
  CustomersRepository,
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput
} from "@inspection-platform/domain/customers";
import { buildIlikeOrFilter } from "../lib/postgrest-filters";

type CustomerRow = {
  id: string;
  organization_id: string;
  display_name: string;
  legal_name: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    legalName: row.legal_name,
    documentNumber: row.document_number,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the caller's
 * own bearer token on every request — never service_role. RLS (see the
 * Task 07 migration) enforces tenant isolation; organizationId here only
 * scopes the query, it is never trusted as proof of authorization.
 */
export function createSupabaseCustomersRepository(
  supabaseUrl: string,
  publishableKey: string
): CustomersRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async create(authToken, organizationId, input: CreateCustomerInput) {
      const response = await fetch(`${supabaseUrl}/rest/v1/customers`, {
        method: "POST",
        headers: headers(authToken, {
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json"
        }),
        body: JSON.stringify({
          organization_id: organizationId,
          display_name: input.displayName,
          legal_name: input.legalName ?? null,
          document_number: input.documentNumber ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null
        })
      });

      if (!response.ok) {
        throw new Error(`create customer failed with status ${response.status}`);
      }

      return toCustomer((await response.json()) as CustomerRow);
    },

    async list(authToken, organizationId, query?: ListCustomersQuery) {
      const params = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        select: "*",
        order: "created_at.desc"
      });

      const status = query?.status ?? "active";
      if (status === "active") params.set("archived_at", "is.null");
      else if (status === "archived") params.set("archived_at", "not.is.null");

      if (query?.search) {
        const orFilter = buildIlikeOrFilter(
          ["display_name", "legal_name", "document_number"],
          query.search
        );
        if (orFilter) params.set("or", orFilter);
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/customers?${params.toString()}`, {
        headers: headers(authToken)
      });

      if (!response.ok) {
        throw new Error(`list customers failed with status ${response.status}`);
      }

      return ((await response.json()) as CustomerRow[]).map(toCustomer);
    },

    async getById(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${id}&organization_id=eq.${organizationId}&select=*`,
        { headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }) }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`get customer failed with status ${response.status}`);
      }

      return toCustomer((await response.json()) as CustomerRow);
    },

    async update(authToken, organizationId, id, patch: UpdateCustomerInput) {
      const body: Record<string, unknown> = {};
      if (patch.displayName !== undefined) body.display_name = patch.displayName;
      if (patch.legalName !== undefined) body.legal_name = patch.legalName;
      if (patch.documentNumber !== undefined) body.document_number = patch.documentNumber;
      if (patch.email !== undefined) body.email = patch.email;
      if (patch.phone !== undefined) body.phone = patch.phone;
      if (patch.notes !== undefined) body.notes = patch.notes;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify(body)
        }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`update customer failed with status ${response.status}`);
      }

      return toCustomer((await response.json()) as CustomerRow);
    },

    async archive(authToken, organizationId, id) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/customers?id=eq.${id}&organization_id=eq.${organizationId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ archived_at: new Date().toISOString() })
        }
      );

      if (response.status === 406 || response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`archive customer failed with status ${response.status}`);
      }

      return toCustomer((await response.json()) as CustomerRow);
    }
  };
}
