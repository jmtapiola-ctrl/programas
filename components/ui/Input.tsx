import * as React from "react"
import { cn } from "@/lib/utils"

/* ─── Raw shadcn Input ─── */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/20",
        className
      )}
      {...props}
    />
  )
}

/* ─── Labeled Input ─── */
function LabeledInput({
  label,
  className,
  ...props
}: React.ComponentProps<"input"> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <Input className={className} {...props} />
    </div>
  )
}

/* ─── Labeled Textarea ─── */
function Textarea({
  label,
  className,
  rows = 3,
  ...props
}: React.ComponentProps<"textarea"> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={cn(
          "w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/20 resize-none",
          className
        )}
        {...props}
      />
    </div>
  )
}

/* ─── Labeled Select ─── */
function Select({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select
        className={cn(
          "h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// Export LabeledInput as Input so pages using <Input label="..."> work
export { LabeledInput as Input, Textarea, Select }
// Also export the raw input for shadcn usage
export { Input as RawInput }
