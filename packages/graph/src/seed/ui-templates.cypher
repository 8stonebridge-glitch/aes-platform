// ============================================================
// AES UI Component Templates — Core Building Blocks
// Real TSX + Tailwind code for every AES-built app
// ============================================================

// ── LAYOUT TEMPLATES ──

CREATE (t1:LearnedComponentPattern {
  name: 'AppShell',
  source: 'aes-templates',
  category: 'layout',
  description: 'Root app shell with sidebar navigation and main content area. Fixed sidebar, scrollable main.',
  props: 'children, sidebarItems, title',
  usage_example: '"use client";\nimport Link from "next/link";\nimport { usePathname } from "next/navigation";\nimport { UserButton } from "@clerk/nextjs";\n\ntype NavItem = { href: string; label: string; icon: React.ReactNode };\n\nexport function AppShell({ children, sidebarItems, title }: {\n  children: React.ReactNode;\n  sidebarItems: NavItem[];\n  title: string;\n}) {\n  const pathname = usePathname();\n  return (\n    <div className="flex h-screen bg-gray-50">\n      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">\n        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">\n          <span className="text-base font-semibold">{title}</span>\n        </div>\n        <nav className="flex-1 overflow-y-auto px-3 py-3">\n          {sidebarItems.map((item) => {\n            const active = pathname === item.href;\n            return (\n              <Link key={item.href} href={item.href}\n                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${\n                  active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"\n                }`}>\n                {item.icon}\n                {item.label}\n              </Link>\n            );\n          })}\n        </nav>\n        <div className="border-t border-gray-200 px-5 py-3">\n          <UserButton afterSignOutUrl="/sign-in" />\n        </div>\n      </aside>\n      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>\n    </div>\n  );\n}'
});

CREATE (t2:LearnedComponentPattern {
  name: 'PageHeader',
  source: 'aes-templates',
  category: 'layout',
  description: 'Page header with title, description, and optional action button. Used at the top of every page.',
  props: 'title, description, action, actionLabel',
  usage_example: 'export function PageHeader({ title, description, action, actionLabel }: {\n  title: string;\n  description?: string;\n  action?: () => void;\n  actionLabel?: string;\n}) {\n  return (\n    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">\n      <div>\n        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>\n        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}\n      </div>\n      {action && actionLabel && (\n        <button onClick={action}\n          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">\n          {actionLabel}\n        </button>\n      )}\n    </div>\n  );\n}'
});

CREATE (t3:LearnedComponentPattern {
  name: 'PageContent',
  source: 'aes-templates',
  category: 'layout',
  description: 'Scrollable content area with consistent padding. Wraps all page content below the header.',
  props: 'children, className',
  usage_example: 'export function PageContent({ children, className }: {\n  children: React.ReactNode;\n  className?: string;\n}) {\n  return (\n    <div className={`flex-1 overflow-y-auto px-6 py-6 ${className ?? ""}`}>\n      {children}\n    </div>\n  );\n}'
});

// ── BUTTON TEMPLATES ──

CREATE (t4:LearnedComponentPattern {
  name: 'Button',
  source: 'aes-templates',
  category: 'input',
  description: 'Core button with variants: primary, secondary, destructive, ghost. Supports loading state and disabled.',
  props: 'children, variant, size, loading, disabled, onClick, className, type',
  usage_example: 'import { forwardRef } from "react";\n\ntype Variant = "primary" | "secondary" | "destructive" | "ghost";\ntype Size = "sm" | "md" | "lg";\n\nconst variantStyles: Record<Variant, string> = {\n  primary: "bg-gray-900 text-white hover:bg-gray-800",\n  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",\n  destructive: "bg-red-600 text-white hover:bg-red-700",\n  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",\n};\n\nconst sizeStyles: Record<Size, string> = {\n  sm: "px-3 py-1.5 text-xs",\n  md: "px-4 py-2 text-sm",\n  lg: "px-5 py-2.5 text-base",\n};\n\nexport const Button = forwardRef<HTMLButtonElement, {\n  children: React.ReactNode;\n  variant?: Variant;\n  size?: Size;\n  loading?: boolean;\n  disabled?: boolean;\n  onClick?: () => void;\n  className?: string;\n  type?: "button" | "submit";\n}>(({ children, variant = "primary", size = "md", loading, disabled, onClick, className, type = "button" }, ref) => (\n  <button ref={ref} type={type} onClick={onClick} disabled={disabled || loading}\n    className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className ?? ""}`}>\n    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}\n    {children}\n  </button>\n));\nButton.displayName = "Button";'
});

// ── DATA DISPLAY TEMPLATES ──

CREATE (t5:LearnedComponentPattern {
  name: 'DataTable',
  source: 'aes-templates',
  category: 'data-display',
  description: 'Generic data table with column definitions, sorting, empty state, and row click handler.',
  props: 'columns, data, onRowClick, emptyMessage, sortable',
  usage_example: '"use client";\nimport { useState } from "react";\n\ntype Column<T> = { key: keyof T; label: string; render?: (value: T[keyof T], row: T) => React.ReactNode };\n\nexport function DataTable<T extends Record<string, unknown>>({ columns, data, onRowClick, emptyMessage }: {\n  columns: Column<T>[];\n  data: T[];\n  onRowClick?: (row: T) => void;\n  emptyMessage?: string;\n}) {\n  const [sortKey, setSortKey] = useState<keyof T | null>(null);\n  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");\n\n  const sorted = sortKey\n    ? [...data].sort((a, b) => {\n        const av = String(a[sortKey] ?? "");\n        const bv = String(b[sortKey] ?? "");\n        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);\n      })\n    : data;\n\n  const handleSort = (key: keyof T) => {\n    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");\n    else { setSortKey(key); setSortDir("asc"); }\n  };\n\n  if (data.length === 0) {\n    return (\n      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-12">\n        <p className="text-sm text-gray-500">{emptyMessage ?? "No data yet"}</p>\n      </div>\n    );\n  }\n\n  return (\n    <div className="overflow-x-auto rounded-lg border border-gray-200">\n      <table className="w-full text-left text-sm">\n        <thead className="border-b border-gray-200 bg-gray-50">\n          <tr>\n            {columns.map(col => (\n              <th key={String(col.key)} onClick={() => handleSort(col.key)}\n                className="cursor-pointer px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700">\n                {col.label} {sortKey === col.key && (sortDir === "asc" ? "↑" : "↓")}\n              </th>\n            ))}\n          </tr>\n        </thead>\n        <tbody className="divide-y divide-gray-200 bg-white">\n          {sorted.map((row, i) => (\n            <tr key={i} onClick={() => onRowClick?.(row)}\n              className={onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}>\n              {columns.map(col => (\n                <td key={String(col.key)} className="px-4 py-3 text-gray-700">\n                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}\n                </td>\n              ))}\n            </tr>\n          ))}\n        </tbody>\n      </table>\n    </div>\n  );\n}'
});

CREATE (t6:LearnedComponentPattern {
  name: 'StatCard',
  source: 'aes-templates',
  category: 'data-display',
  description: 'Dashboard metric card showing a label, value, and optional trend indicator. Used in dashboard grids.',
  props: 'label, value, trend, trendLabel, icon',
  usage_example: 'export function StatCard({ label, value, trend, trendLabel, icon }: {\n  label: string;\n  value: string | number;\n  trend?: "up" | "down" | "neutral";\n  trendLabel?: string;\n  icon?: React.ReactNode;\n}) {\n  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500";\n  return (\n    <div className="rounded-lg border border-gray-200 bg-white p-5">\n      <div className="flex items-center justify-between">\n        <span className="text-sm font-medium text-gray-500">{label}</span>\n        {icon && <span className="text-gray-400">{icon}</span>}\n      </div>\n      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>\n      {trendLabel && (\n        <p className={`mt-1 text-xs ${trendColor}`}>\n          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendLabel}\n        </p>\n      )}\n    </div>\n  );\n}'
});

CREATE (t7:LearnedComponentPattern {
  name: 'Badge',
  source: 'aes-templates',
  category: 'data-display',
  description: 'Status badge with color variants for different states. Used in tables, cards, and headers.',
  props: 'children, variant, size',
  usage_example: 'type BadgeVariant = "default" | "success" | "warning" | "error" | "info";\n\nconst badgeStyles: Record<BadgeVariant, string> = {\n  default: "bg-gray-100 text-gray-700",\n  success: "bg-green-100 text-green-700",\n  warning: "bg-amber-100 text-amber-700",\n  error: "bg-red-100 text-red-700",\n  info: "bg-blue-100 text-blue-700",\n};\n\nexport function Badge({ children, variant = "default", size = "sm" }: {\n  children: React.ReactNode;\n  variant?: BadgeVariant;\n  size?: "sm" | "md";\n}) {\n  return (\n    <span className={`inline-flex items-center rounded-full font-medium ${badgeStyles[variant]} ${\n      size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"\n    }`}>\n      {children}\n    </span>\n  );\n}'
});

CREATE (t8:LearnedComponentPattern {
  name: 'Avatar',
  source: 'aes-templates',
  category: 'data-display',
  description: 'User avatar with image fallback to initials. Supports multiple sizes.',
  props: 'src, name, size',
  usage_example: 'export function Avatar({ src, name, size = "md" }: {\n  src?: string | null;\n  name: string;\n  size?: "sm" | "md" | "lg";\n}) {\n  const sizeClass = size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";\n  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();\n\n  if (src) {\n    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover`} />;\n  }\n  return (\n    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600`}>\n      {initials}\n    </div>\n  );\n}'
});

// ── FORM TEMPLATES ──

CREATE (t9:LearnedComponentPattern {
  name: 'FormField',
  source: 'aes-templates',
  category: 'input',
  description: 'Form field wrapper with label, input, and error message. Works with any input type.',
  props: 'label, error, required, children, htmlFor',
  usage_example: 'export function FormField({ label, error, required, children, htmlFor }: {\n  label: string;\n  error?: string;\n  required?: boolean;\n  children: React.ReactNode;\n  htmlFor?: string;\n}) {\n  return (\n    <div className="space-y-1.5">\n      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">\n        {label}{required && <span className="ml-0.5 text-red-500">*</span>}\n      </label>\n      {children}\n      {error && <p className="text-xs text-red-600">{error}</p>}\n    </div>\n  );\n}'
});

CREATE (t10:LearnedComponentPattern {
  name: 'TextInput',
  source: 'aes-templates',
  category: 'input',
  description: 'Styled text input with placeholder, error state, and disabled state. Pairs with FormField.',
  props: 'value, onChange, placeholder, type, error, disabled, name',
  usage_example: 'import { forwardRef } from "react";\n\nexport const TextInput = forwardRef<HTMLInputElement, {\n  value?: string;\n  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;\n  placeholder?: string;\n  type?: string;\n  error?: boolean;\n  disabled?: boolean;\n  name?: string;\n  className?: string;\n}>(({ error, className, ...props }, ref) => (\n  <input ref={ref} {...props}\n    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors\n      ${error ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500" : "border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"}\n      disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400\n      ${className ?? ""}`}\n  />\n));\nTextInput.displayName = "TextInput";'
});

CREATE (t11:LearnedComponentPattern {
  name: 'Select',
  source: 'aes-templates',
  category: 'input',
  description: 'Styled select dropdown with options array. Consistent styling with TextInput.',
  props: 'value, onChange, options, placeholder, error, disabled, name',
  usage_example: 'export function Select({ value, onChange, options, placeholder, error, disabled, name }: {\n  value: string;\n  onChange: (value: string) => void;\n  options: { value: string; label: string }[];\n  placeholder?: string;\n  error?: boolean;\n  disabled?: boolean;\n  name?: string;\n}) {\n  return (\n    <select name={name} value={value} disabled={disabled}\n      onChange={(e) => onChange(e.target.value)}\n      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors\n        ${error ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-gray-900"}\n        disabled:cursor-not-allowed disabled:bg-gray-50 ${!value ? "text-gray-400" : "text-gray-900"}`}>\n      {placeholder && <option value="" disabled>{placeholder}</option>}\n      {options.map(opt => (\n        <option key={opt.value} value={opt.value}>{opt.label}</option>\n      ))}\n    </select>\n  );\n}'
});

CREATE (t12:LearnedComponentPattern {
  name: 'Textarea',
  source: 'aes-templates',
  category: 'input',
  description: 'Multi-line text input with auto-resize support. Same styling as TextInput.',
  props: 'value, onChange, placeholder, rows, error, disabled, name',
  usage_example: 'import { forwardRef } from "react";\n\nexport const Textarea = forwardRef<HTMLTextAreaElement, {\n  value?: string;\n  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;\n  placeholder?: string;\n  rows?: number;\n  error?: boolean;\n  disabled?: boolean;\n  name?: string;\n}>(({ error, rows = 3, ...props }, ref) => (\n  <textarea ref={ref} rows={rows} {...props}\n    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors resize-none\n      ${error ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-gray-900"}\n      disabled:cursor-not-allowed disabled:bg-gray-50`}\n  />\n));\nTextarea.displayName = "Textarea";'
});

// ── FEEDBACK TEMPLATES ──

CREATE (t13:LearnedComponentPattern {
  name: 'Modal',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Centered modal dialog with backdrop, title, content, and action buttons. Handles escape key and click-outside.',
  props: 'open, onClose, title, children, actions',
  usage_example: '"use client";\nimport { useEffect, useRef } from "react";\n\nexport function Modal({ open, onClose, title, children, actions }: {\n  open: boolean;\n  onClose: () => void;\n  title: string;\n  children: React.ReactNode;\n  actions?: React.ReactNode;\n}) {\n  const overlayRef = useRef<HTMLDivElement>(null);\n\n  useEffect(() => {\n    if (!open) return;\n    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };\n    document.addEventListener("keydown", handler);\n    return () => document.removeEventListener("keydown", handler);\n  }, [open, onClose]);\n\n  if (!open) return null;\n\n  return (\n    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}\n      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">\n      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">\n        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">\n          <h2 className="text-base font-semibold text-gray-900">{title}</h2>\n          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>\n        </div>\n        <div className="px-5 py-4">{children}</div>\n        {actions && <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">{actions}</div>}\n      </div>\n    </div>\n  );\n}'
});

CREATE (t14:LearnedComponentPattern {
  name: 'ConfirmDialog',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Destructive action confirmation dialog. Red confirm button, clear warning message. Required for all delete/remove actions.',
  props: 'open, onClose, onConfirm, title, message, confirmLabel, loading',
  usage_example: '"use client";\n\nexport function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, loading }: {\n  open: boolean;\n  onClose: () => void;\n  onConfirm: () => void;\n  title: string;\n  message: string;\n  confirmLabel?: string;\n  loading?: boolean;\n}) {\n  if (!open) return null;\n  return (\n    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">\n      <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white shadow-xl">\n        <div className="px-5 py-4">\n          <h2 className="text-base font-semibold text-gray-900">{title}</h2>\n          <p className="mt-2 text-sm text-gray-600">{message}</p>\n        </div>\n        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">\n          <button onClick={onClose}\n            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">\n            Cancel\n          </button>\n          <button onClick={onConfirm} disabled={loading}\n            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">\n            {loading ? "..." : (confirmLabel ?? "Delete")}\n          </button>\n        </div>\n      </div>\n    </div>\n  );\n}'
});

CREATE (t15:LearnedComponentPattern {
  name: 'Toast',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Toast notification system with auto-dismiss. Supports success, error, warning, info variants.',
  props: 'toasts, removeToast',
  usage_example: '"use client";\nimport { createContext, useContext, useState, useCallback } from "react";\n\ntype ToastType = "success" | "error" | "warning" | "info";\ntype Toast = { id: string; type: ToastType; message: string };\n\nconst ToastContext = createContext<{ addToast: (type: ToastType, message: string) => void }>({ addToast: () => {} });\nexport const useToast = () => useContext(ToastContext);\n\nconst toastStyles: Record<ToastType, string> = {\n  success: "border-green-200 bg-green-50 text-green-800",\n  error: "border-red-200 bg-red-50 text-red-800",\n  warning: "border-amber-200 bg-amber-50 text-amber-800",\n  info: "border-blue-200 bg-blue-50 text-blue-800",\n};\n\nexport function ToastProvider({ children }: { children: React.ReactNode }) {\n  const [toasts, setToasts] = useState<Toast[]>([]);\n  const addToast = useCallback((type: ToastType, message: string) => {\n    const id = crypto.randomUUID();\n    setToasts(prev => [...prev, { id, type, message }]);\n    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);\n  }, []);\n\n  return (\n    <ToastContext.Provider value={{ addToast }}>\n      {children}\n      <div className="fixed bottom-4 right-4 z-50 space-y-2">\n        {toasts.map(toast => (\n          <div key={toast.id} className={`rounded-lg border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right ${toastStyles[toast.type]}`}>\n            {toast.message}\n          </div>\n        ))}\n      </div>\n    </ToastContext.Provider>\n  );\n}'
});

// ── STATE TEMPLATES ──

CREATE (t16:LearnedComponentPattern {
  name: 'EmptyState',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Empty state placeholder with icon, message, and optional action button. Used when a list or table has no data.',
  props: 'icon, title, description, actionLabel, onAction',
  usage_example: 'export function EmptyState({ icon, title, description, actionLabel, onAction }: {\n  icon?: React.ReactNode;\n  title: string;\n  description?: string;\n  actionLabel?: string;\n  onAction?: () => void;\n}) {\n  return (\n    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 px-6 text-center">\n      {icon && <div className="mb-3 text-gray-400">{icon}</div>}\n      <h3 className="text-sm font-medium text-gray-900">{title}</h3>\n      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}\n      {actionLabel && onAction && (\n        <button onClick={onAction}\n          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">\n          {actionLabel}\n        </button>\n      )}\n    </div>\n  );\n}'
});

CREATE (t17:LearnedComponentPattern {
  name: 'LoadingSkeleton',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Animated loading skeleton for content placeholders. Supports line, card, and table variants.',
  props: 'variant, lines, className',
  usage_example: 'export function LoadingSkeleton({ variant = "lines", lines = 3, className }: {\n  variant?: "lines" | "card" | "table";\n  lines?: number;\n  className?: string;\n}) {\n  if (variant === "card") {\n    return (\n      <div className={`animate-pulse rounded-lg border border-gray-200 bg-white p-5 ${className ?? ""}`}>\n        <div className="h-4 w-1/3 rounded bg-gray-200" />\n        <div className="mt-3 h-8 w-1/2 rounded bg-gray-200" />\n        <div className="mt-2 h-3 w-1/4 rounded bg-gray-100" />\n      </div>\n    );\n  }\n  if (variant === "table") {\n    return (\n      <div className={`animate-pulse space-y-3 ${className ?? ""}`}>\n        <div className="h-10 rounded bg-gray-100" />\n        {Array.from({ length: lines }).map((_, i) => (\n          <div key={i} className="h-12 rounded bg-gray-50" />\n        ))}\n      </div>\n    );\n  }\n  return (\n    <div className={`animate-pulse space-y-2 ${className ?? ""}`}>\n      {Array.from({ length: lines }).map((_, i) => (\n        <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${70 + Math.random() * 30}%` }} />\n      ))}\n    </div>\n  );\n}'
});

CREATE (t18:LearnedComponentPattern {
  name: 'ErrorBoundaryFallback',
  source: 'aes-templates',
  category: 'feedback',
  description: 'Error display with retry button. Used as fallback for error boundaries and failed data fetches.',
  props: 'error, onRetry, title',
  usage_example: 'export function ErrorBoundaryFallback({ error, onRetry, title }: {\n  error?: string;\n  onRetry?: () => void;\n  title?: string;\n}) {\n  return (\n    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 px-6 text-center">\n      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">\n        <span className="text-red-600 text-lg">!</span>\n      </div>\n      <h3 className="text-sm font-medium text-red-900">{title ?? "Something went wrong"}</h3>\n      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}\n      {onRetry && (\n        <button onClick={onRetry}\n          className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">\n          Try again\n        </button>\n      )}\n    </div>\n  );\n}'
});

// ── NAVIGATION TEMPLATES ──

CREATE (t19:LearnedComponentPattern {
  name: 'Breadcrumb',
  source: 'aes-templates',
  category: 'navigation',
  description: 'Breadcrumb navigation with links and current page indicator.',
  props: 'items',
  usage_example: 'import Link from "next/link";\n\nexport function Breadcrumb({ items }: {\n  items: { label: string; href?: string }[];\n}) {\n  return (\n    <nav className="flex items-center gap-1.5 text-sm">\n      {items.map((item, i) => (\n        <span key={i} className="flex items-center gap-1.5">\n          {i > 0 && <span className="text-gray-300">/</span>}\n          {item.href ? (\n            <Link href={item.href} className="text-gray-500 hover:text-gray-900">{item.label}</Link>\n          ) : (\n            <span className="font-medium text-gray-900">{item.label}</span>\n          )}\n        </span>\n      ))}\n    </nav>\n  );\n}'
});

CREATE (t20:LearnedComponentPattern {
  name: 'Tabs',
  source: 'aes-templates',
  category: 'navigation',
  description: 'Horizontal tab bar with underline active indicator. Controls content visibility.',
  props: 'tabs, activeTab, onChange',
  usage_example: '"use client";\n\nexport function Tabs<T extends string>({ tabs, activeTab, onChange }: {\n  tabs: { id: T; label: string; count?: number }[];\n  activeTab: T;\n  onChange: (tab: T) => void;\n}) {\n  return (\n    <div className="flex gap-0 border-b border-gray-200">\n      {tabs.map(tab => (\n        <button key={tab.id} onClick={() => onChange(tab.id)}\n          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${\n            activeTab === tab.id\n              ? "text-gray-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gray-900"\n              : "text-gray-500 hover:text-gray-700"\n          }`}>\n          {tab.label}\n          {tab.count != null && (\n            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{tab.count}</span>\n          )}\n        </button>\n      ))}\n    </div>\n  );\n}'
});

CREATE (t21:LearnedComponentPattern {
  name: 'SearchInput',
  source: 'aes-templates',
  category: 'input',
  description: 'Search input with icon and clear button. Debounced onChange for performance.',
  props: 'value, onChange, placeholder, className',
  usage_example: '"use client";\nimport { useState, useEffect, useRef } from "react";\n\nexport function SearchInput({ value, onChange, placeholder, className }: {\n  value: string;\n  onChange: (value: string) => void;\n  placeholder?: string;\n  className?: string;\n}) {\n  const [local, setLocal] = useState(value);\n  const timer = useRef<ReturnType<typeof setTimeout>>();\n\n  useEffect(() => { setLocal(value); }, [value]);\n\n  const handleChange = (v: string) => {\n    setLocal(v);\n    clearTimeout(timer.current);\n    timer.current = setTimeout(() => onChange(v), 300);\n  };\n\n  return (\n    <div className={`relative ${className ?? ""}`}>\n      <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">\n        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />\n      </svg>\n      <input type="text" value={local} onChange={e => handleChange(e.target.value)}\n        placeholder={placeholder ?? "Search..."}\n        className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-8 text-sm outline-none focus:border-gray-900" />\n      {local && (\n        <button onClick={() => { setLocal(""); onChange(""); }}\n          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>\n      )}\n    </div>\n  );\n}'
});

// ── DASHBOARD PAGE TEMPLATE ──

CREATE (t22:LearnedComponentPattern {
  name: 'DashboardGrid',
  source: 'aes-templates',
  category: 'layout',
  description: 'Dashboard page layout with stat cards grid at top and content sections below.',
  props: 'stats, children',
  usage_example: 'export function DashboardGrid({ stats, children }: {\n  stats: { label: string; value: string | number; trend?: "up" | "down" | "neutral"; trendLabel?: string }[];\n  children: React.ReactNode;\n}) {\n  return (\n    <div className="space-y-6">\n      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">\n        {stats.map((stat, i) => (\n          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">\n            <p className="text-sm font-medium text-gray-500">{stat.label}</p>\n            <p className="mt-2 text-2xl font-semibold text-gray-900">{stat.value}</p>\n            {stat.trendLabel && (\n              <p className={`mt-1 text-xs ${stat.trend === "up" ? "text-green-600" : stat.trend === "down" ? "text-red-600" : "text-gray-500"}`}>\n                {stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : "→"} {stat.trendLabel}\n              </p>\n            )}\n          </div>\n        ))}\n      </div>\n      {children}\n    </div>\n  );\n}'
});

// ── LIST-DETAIL TEMPLATE ──

CREATE (t23:LearnedComponentPattern {
  name: 'ListDetailLayout',
  source: 'aes-templates',
  category: 'layout',
  description: 'Split view with a scrollable list on the left and detail pane on the right. Used for tasks, messages, tickets.',
  props: 'items, selectedId, onSelect, renderItem, renderDetail, emptyDetail',
  usage_example: '"use client";\n\nexport function ListDetailLayout<T extends { id: string }>({ items, selectedId, onSelect, renderItem, renderDetail, emptyDetail }: {\n  items: T[];\n  selectedId: string | null;\n  onSelect: (id: string) => void;\n  renderItem: (item: T, selected: boolean) => React.ReactNode;\n  renderDetail: (item: T) => React.ReactNode;\n  emptyDetail?: React.ReactNode;\n}) {\n  const selected = items.find(i => i.id === selectedId);\n  return (\n    <div className="flex flex-1 overflow-hidden">\n      <div className="w-80 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">\n        {items.map(item => (\n          <div key={item.id} onClick={() => onSelect(item.id)}\n            className={`cursor-pointer border-b border-gray-100 px-4 py-3 transition-colors ${\n              item.id === selectedId ? "bg-gray-50" : "hover:bg-gray-50"\n            }`}>\n            {renderItem(item, item.id === selectedId)}\n          </div>\n        ))}\n      </div>\n      <div className="flex-1 overflow-y-auto">\n        {selected ? renderDetail(selected) : (emptyDetail ?? (\n          <div className="flex h-full items-center justify-center text-sm text-gray-400">Select an item</div>\n        ))}\n      </div>\n    </div>\n  );\n}'
});
