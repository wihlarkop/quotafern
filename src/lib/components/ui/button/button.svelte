<script lang="ts" module>
  import { clsx, type ClassValue } from "clsx";
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { twMerge } from "tailwind-merge";
  import { type VariantProps, tv } from "tailwind-variants/lite";

  // Adapted from the official shadcn-svelte Button source: https://shadcn-svelte.com/docs/components/button
  // The local variants map to Quotafern's palette tokens and deliberately omit the upstream link rendering.
  // Variants contain custom tokens; caller utilities are merged once in buttonClass.
  export const buttonVariants = tv({
    base: "qf-button",
    variants: {
      variant: {
        default: "qf-button--primary",
        outline: "qf-button--outline",
        secondary: "qf-button--secondary",
        ghost: "qf-button--ghost",
        link: "qf-button--link",
      },
      size: {
        default: "qf-button--default-size",
        sm: "qf-button--small-size",
        icon: "qf-button--icon-size",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
  export type ButtonProps = HTMLButtonAttributes & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children?: Snippet;
    class?: ClassValue;
  };

  export function buttonClass(
    variant: ButtonVariant,
    size: ButtonSize,
    className?: ClassValue,
  ): string {
    return twMerge(clsx(buttonVariants({ variant, size }), className));
  }
</script>

<script lang="ts">
  let {
    class: className,
    variant = "default",
    size = "default",
    type = "button",
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

<button data-slot="button" class={buttonClass(variant, size, className)} {type} {...restProps}>
  {@render children?.()}
</button>
