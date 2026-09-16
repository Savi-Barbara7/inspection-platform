import {
  buildDocumentTree,
  GroupItemNotFoundError,
  NotARepeatableContainerError,
  ReorderMismatchError,
  RuntimeNodeNotFoundError,
  type AddGroupItemInput,
  type BuildDocumentTreeOptions,
  type DocumentTreeNode,
  type GroupItem,
  type GroupItemState,
  type ReorderGroupItemsInput,
  type ReorderRuntimeNodesInput,
  type RuntimeDocumentTreeRepository,
  type RuntimeNode,
  type RuntimeNodeState
} from "@inspection-platform/domain/runtime-document-tree";

type RuntimeNodeRow = {
  id: string;
  organization_id: string;
  technical_job_id: string;
  definition_id: string;
  definition_kind: RuntimeNode["definitionKind"];
  block_type: string | null;
  parent_node_id: string | null;
  group_item_id: string | null;
  is_repeatable_container: boolean;
  position: number;
  state: RuntimeNodeState;
  created_at: string;
  updated_at: string;
};

type GroupItemRow = {
  id: string;
  organization_id: string;
  technical_job_id: string;
  container_node_id: string;
  definition_section_id: string;
  parent_group_item_id: string | null;
  position: number;
  state: GroupItemState;
  created_at: string;
  updated_at: string;
};

function toRuntimeNode(row: RuntimeNodeRow): RuntimeNode {
  return {
    id: row.id,
    organizationId: row.organization_id,
    technicalJobId: row.technical_job_id,
    definitionId: row.definition_id,
    definitionKind: row.definition_kind,
    blockType: row.block_type,
    parentNodeId: row.parent_node_id,
    groupItemId: row.group_item_id,
    isRepeatableContainer: row.is_repeatable_container,
    position: row.position,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toGroupItem(row: GroupItemRow): GroupItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    technicalJobId: row.technical_job_id,
    containerNodeId: row.container_node_id,
    definitionSectionId: row.definition_section_id,
    parentGroupItemId: row.parent_group_item_id,
    position: row.position,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Talks to Postgres exclusively through PostgREST, forwarding the
 * caller's own bearer token — never service_role. Structural mutations
 * (add/duplicate a GroupItem, reorder) always go through the Task 15
 * SECURITY DEFINER RPCs, which are the only code paths that ever
 * validate hierarchy/ownership against the job's real, frozen
 * definition — this adapter only maps their errors and reads the
 * resulting rows back for the pure buildDocumentTree() assembly.
 */
export function createSupabaseRuntimeDocumentTreeRepository(
  supabaseUrl: string,
  publishableKey: string
): RuntimeDocumentTreeRepository {
  function headers(authToken: string, extra?: Record<string, string>) {
    return {
      apikey: publishableKey,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  function rpcErrorCode(body: unknown): string | null {
    return typeof body === "object" && body !== null
      ? ((body as { code?: string }).code ?? null)
      : null;
  }

  async function fetchNodes(
    authToken: string,
    organizationId: string,
    technicalJobId: string
  ): Promise<RuntimeNode[]> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/runtime_nodes?organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}&select=*`,
      { headers: headers(authToken) }
    );
    if (!response.ok) {
      throw new Error(`list runtime nodes failed with status ${response.status}`);
    }
    return ((await response.json()) as RuntimeNodeRow[]).map(toRuntimeNode);
  }

  async function fetchGroupItems(
    authToken: string,
    organizationId: string,
    technicalJobId: string
  ): Promise<GroupItem[]> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/group_items?organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}&select=*`,
      { headers: headers(authToken) }
    );
    if (!response.ok) {
      throw new Error(`list group items failed with status ${response.status}`);
    }
    return ((await response.json()) as GroupItemRow[]).map(toGroupItem);
  }

  return {
    async getTree(
      authToken,
      organizationId,
      technicalJobId,
      options?: BuildDocumentTreeOptions
    ): Promise<DocumentTreeNode[]> {
      const [nodes, groupItems] = await Promise.all([
        fetchNodes(authToken, organizationId, technicalJobId),
        fetchGroupItems(authToken, organizationId, technicalJobId)
      ]);
      return buildDocumentTree(nodes, groupItems, options);
    },

    async addGroupItem(
      authToken,
      organizationId,
      technicalJobId,
      input: AddGroupItemInput
    ): Promise<GroupItem> {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/add_group_item`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_job_id: technicalJobId,
          p_container_node_id: input.containerNodeId
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code = rpcErrorCode(body);
        if (code === "P0002") throw new RuntimeNodeNotFoundError(input.containerNodeId);
        if (code === "55000") throw new NotARepeatableContainerError(input.containerNodeId);
        throw new Error(`add group item failed with status ${response.status}`);
      }
      return toGroupItem((await response.json()) as GroupItemRow);
    },

    async duplicateGroupItem(
      authToken,
      organizationId,
      technicalJobId,
      groupItemId
    ): Promise<GroupItem> {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/duplicate_group_item`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_job_id: technicalJobId,
          p_group_item_id: groupItemId
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (rpcErrorCode(body) === "P0002") throw new GroupItemNotFoundError(groupItemId);
        throw new Error(`duplicate group item failed with status ${response.status}`);
      }
      return toGroupItem((await response.json()) as GroupItemRow);
    },

    async updateGroupItemState(
      authToken,
      organizationId,
      technicalJobId,
      groupItemId,
      state
    ): Promise<GroupItem | null> {
      // Restoring to "active" always goes through restore_group_item():
      // it must recompute a fresh, non-colliding position (Task 15.5A)
      // rather than reclaiming whatever position this row still holds
      // from before it was archived, which a plain PATCH would do and
      // which can collide with a position a newer sibling has since
      // taken. Archiving stays a plain PATCH -- it never needs to
      // preserve position uniqueness (the item simply leaves the active
      // set).
      if (state === "active") {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/restore_group_item`, {
          method: "POST",
          headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
          body: JSON.stringify({
            p_organization_id: organizationId,
            p_technical_job_id: technicalJobId,
            p_group_item_id: groupItemId
          })
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          if (rpcErrorCode(body) === "P0002") return null;
          throw new Error(`restore group item failed with status ${response.status}`);
        }
        return toGroupItem((await response.json()) as GroupItemRow);
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/group_items?id=eq.${groupItemId}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ state })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`update group item state failed with status ${response.status}`);
      }
      return toGroupItem((await response.json()) as GroupItemRow);
    },

    async reorderGroupItems(
      authToken,
      organizationId,
      technicalJobId,
      input: ReorderGroupItemsInput
    ): Promise<void> {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reorder_group_items`, {
        method: "POST",
        headers: headers(authToken),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_job_id: technicalJobId,
          p_container_node_id: input.containerNodeId,
          p_ordered_group_item_ids: input.orderedGroupItemIds
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (rpcErrorCode(body) === "22023") throw new ReorderMismatchError();
        if (rpcErrorCode(body) === "P0002") throw new RuntimeNodeNotFoundError(input.containerNodeId);
        throw new Error(`reorder group items failed with status ${response.status}`);
      }
    },

    async restoreGroupItem(
      authToken,
      organizationId,
      technicalJobId,
      groupItemId
    ): Promise<GroupItem | null> {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/restore_group_item`, {
        method: "POST",
        headers: headers(authToken, { Accept: "application/vnd.pgrst.object+json" }),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_job_id: technicalJobId,
          p_group_item_id: groupItemId
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (rpcErrorCode(body) === "P0002") return null;
        throw new Error(`restore group item failed with status ${response.status}`);
      }
      return toGroupItem((await response.json()) as GroupItemRow);
    },

    async reorderNodes(
      authToken,
      organizationId,
      technicalJobId,
      input: ReorderRuntimeNodesInput
    ): Promise<void> {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reorder_runtime_nodes`, {
        method: "POST",
        headers: headers(authToken),
        body: JSON.stringify({
          p_organization_id: organizationId,
          p_technical_job_id: technicalJobId,
          p_parent_node_id: input.parentNodeId,
          p_group_item_id: input.groupItemId,
          p_ordered_node_ids: input.orderedNodeIds
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        if (rpcErrorCode(body) === "22023") throw new ReorderMismatchError();
        throw new Error(`reorder runtime nodes failed with status ${response.status}`);
      }
    },

    async updateNodeState(
      authToken,
      organizationId,
      technicalJobId,
      nodeId,
      state
    ): Promise<RuntimeNode | null> {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/runtime_nodes?id=eq.${nodeId}&organization_id=eq.${organizationId}&technical_job_id=eq.${technicalJobId}`,
        {
          method: "PATCH",
          headers: headers(authToken, {
            Prefer: "return=representation",
            Accept: "application/vnd.pgrst.object+json"
          }),
          body: JSON.stringify({ state })
        }
      );
      if (response.status === 406 || response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`update runtime node state failed with status ${response.status}`);
      }
      return toRuntimeNode((await response.json()) as RuntimeNodeRow);
    }
  };
}
