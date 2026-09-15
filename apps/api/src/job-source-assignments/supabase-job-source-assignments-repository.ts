import type {
  JobSourceAssignment,
  JobSourceAssignmentsRepository
} from "@inspection-platform/domain/job-source-assignments";
import type { SourceRoleId, SourceType } from "@inspection-platform/domain/data-sources";

type JobSourceAssignmentRow = {
  id: string;
  organization_id: string;
  technical_job_id: string;
  role: string;
  source_type: string;
  source_entity_id: string;
  created_at: string;
  updated_at: string;
};

function toJobSourceAssignment(row: JobSourceAssignmentRow): JobSourceAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    technicalJobId: row.technical_job_id,
    role: row.role as SourceRoleId,
    sourceType: row.source_type as SourceType,
    sourceEntityId: row.source_entity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Talks to Postgres exclusively through PostgREST, forwarding the caller's own bearer token — never service_role. */
export function createSupabaseJobSourceAssignmentsRepository(
  supabaseUrl: string,
  publishableKey: string
): JobSourceAssignmentsRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  return {
    async listByJob(authToken, organizationId, technicalJobId) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/job_source_assignments?organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}&select=*&order=created_at.asc`,
        { headers: headers(authToken) }
      );
      if (!response.ok) {
        throw new Error(`list job source assignments failed with status ${response.status}`);
      }
      return ((await response.json()) as JobSourceAssignmentRow[]).map(toJobSourceAssignment);
    }
  };
}
