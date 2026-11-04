"use client"

import * as React from "react"
import { cn } from "cn"
import { Check } from "lucide-react"
import { DropdownMenu as Primitive } from "radix-ui"

const itemVariants = {
  default:
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4",
  destructive:
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 text-destructive data-[highlighted]:text-destructive",
  inset:
    "relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  bare: "",
}

const insetClassName = itemVariants.inset

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof Primitive.RadioGroup>) {
  return (
    <Primitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
  )
}

function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="dropdown-menu-content"
        className={cn(
          "z-50 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md",
          className
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof Primitive.Item> & {
  variant?: "default" | "destructive" | "inset" | "bare"
}) {
  return (
    <Primitive.Item
      data-slot="dropdown-menu-item"
      className={cn(itemVariants[variant], className)}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(insetClassName, className)}
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-2.5 inline-flex">
        <Check className="size-4" aria-hidden="true" />
      </Primitive.ItemIndicator>
      {children}
    </Primitive.RadioItem>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(insetClassName, className)}
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-2.5 inline-flex">
        <Check className="size-4" aria-hidden="true" />
      </Primitive.ItemIndicator>
      {children}
    </Primitive.CheckboxItem>
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      data-slot="dropdown-menu-label"
      className={className}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
