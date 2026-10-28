<script lang="ts">
  import MoreHorizontal from "@lucide/svelte/icons/ellipsis";
  import { DropdownMenu } from "bits-ui";

  import type { DirectTarget } from "./direct";
  import type { ManagementTarget } from "./local";
  import type { AccountAction } from "./presentation";
  let {
    id,
    label,
    actions,
    onaction,
  }: {
    id: string;
    label: string;
    actions: AccountAction[];
    onaction: (target: ManagementTarget | DirectTarget, opener: string) => void;
  } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger {id} class="local-action-trigger" aria-label={label}>
    <MoreHorizontal size={17} aria-hidden="true" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="local-action-menu" sideOffset={4} align="end">
      {#each actions as action (action.label)}
        <DropdownMenu.Item
          class="local-action-item"
          disabled={action.disabled}
          onSelect={() => onaction(action.target, id)}>{action.label}</DropdownMenu.Item
        >
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
