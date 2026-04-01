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

// ============================================================
// TEMPLATES FROM USER KITS: Catalyst, Plasma, Scalar, Lumen, Pocket, Aspect
// Production-quality components from real template libraries
// ============================================================

// ── CATALYST: SidebarLayout (responsive with mobile drawer) ──

CREATE (c1:LearnedComponentPattern {
  name: 'CatalystSidebarLayout',
  source: 'catalyst-ui-kit',
  category: 'layout',
  description: 'Responsive sidebar layout with fixed desktop sidebar (w-64) and mobile drawer using Headless UI Dialog. Handles open/close state, hamburger menu, and content area with max-w-6xl.',
  props: 'navbar, sidebar, children',
  usage_example: '"use client";\nimport { Dialog, DialogBackdrop, DialogPanel, CloseButton } from "@headlessui/react";\nimport { useState } from "react";\n\nfunction MobileSidebar({ open, close, children }: { open: boolean; close: () => void; children: React.ReactNode }) {\n  return (\n    <Dialog open={open} onClose={close} className="lg:hidden">\n      <DialogBackdrop transition className="fixed inset-0 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200" />\n      <DialogPanel transition className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full">\n        <div className="flex h-full flex-col rounded-lg bg-white shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">\n          <div className="-mb-3 px-4 pt-3">\n            <CloseButton className="flex h-8 w-8 items-center justify-center rounded-lg" aria-label="Close navigation">\n              <svg viewBox="0 0 20 20" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>\n            </CloseButton>\n          </div>\n          {children}\n        </div>\n      </DialogPanel>\n    </Dialog>\n  );\n}\n\nexport function SidebarLayout({ navbar, sidebar, children }: {\n  navbar: React.ReactNode; sidebar: React.ReactNode; children: React.ReactNode;\n}) {\n  const [showSidebar, setShowSidebar] = useState(false);\n  return (\n    <div className="relative isolate flex min-h-svh w-full bg-white max-lg:flex-col lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950">\n      <div className="fixed inset-y-0 left-0 w-64 max-lg:hidden">{sidebar}</div>\n      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>{sidebar}</MobileSidebar>\n      <header className="flex items-center px-4 lg:hidden">\n        <button onClick={() => setShowSidebar(true)} className="py-2.5" aria-label="Open navigation">\n          <svg viewBox="0 0 20 20" className="h-5 w-5"><path d="M2 6.75C2 6.336 2.336 6 2.75 6H17.25C17.664 6 18 6.336 18 6.75S17.664 7.5 17.25 7.5H2.75C2.336 7.5 2 7.164 2 6.75ZM2 13.25C2 12.836 2.336 12.5 2.75 12.5H17.25C17.664 12.5 18 12.836 18 13.25S17.664 14 17.25 14H2.75C2.336 14 2 13.664 2 13.25Z" /></svg>\n        </button>\n        <div className="min-w-0 flex-1">{navbar}</div>\n      </header>\n      <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pt-2 lg:pr-2 lg:pl-64">\n        <div className="grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">\n          <div className="mx-auto max-w-6xl">{children}</div>\n        </div>\n      </main>\n    </div>\n  );\n}'
});

// ── CATALYST: Context Table (bleed, dense, grid, striped) ──

CREATE (c2:LearnedComponentPattern {
  name: 'CatalystTable',
  source: 'catalyst-ui-kit',
  category: 'data-display',
  description: 'Context-driven table with bleed, dense, grid, and striped modes via React context. Supports clickable rows with Link integration. Composable: Table, TableHead, TableBody, TableRow, TableHeader, TableCell.',
  props: 'bleed, dense, grid, striped, children',
  usage_example: '"use client";\nimport { createContext, useContext } from "react";\n\nconst TableContext = createContext({ bleed: false, dense: false, grid: false, striped: false });\n\nexport function Table({ bleed = false, dense = false, grid = false, striped = false, className, children, ...props }: {\n  bleed?: boolean; dense?: boolean; grid?: boolean; striped?: boolean; className?: string; children: React.ReactNode;\n}) {\n  return (\n    <TableContext.Provider value={{ bleed, dense, grid, striped }}>\n      <div className="flow-root">\n        <div className={`-mx-4 overflow-x-auto whitespace-nowrap ${className ?? ""}`}>\n          <div className={`inline-block min-w-full align-middle ${!bleed ? "sm:px-4" : ""}`}>\n            <table className="min-w-full text-left text-sm text-zinc-950 dark:text-white">{children}</table>\n          </div>\n        </div>\n      </div>\n    </TableContext.Provider>\n  );\n}\n\nexport function TableHead({ className, ...props }: React.ComponentPropsWithoutRef<"thead">) {\n  return <thead {...props} className={`text-zinc-500 dark:text-zinc-400 ${className ?? ""}`} />;\n}\n\nexport function TableBody(props: React.ComponentPropsWithoutRef<"tbody">) {\n  return <tbody {...props} />;\n}\n\nexport function TableRow({ className, children, ...props }: React.ComponentPropsWithoutRef<"tr">) {\n  const { striped } = useContext(TableContext);\n  return <tr {...props} className={`${striped ? "even:bg-zinc-950/[0.025] dark:even:bg-white/[0.025]" : ""} ${className ?? ""}`}>{children}</tr>;\n}\n\nexport function TableHeader({ className, ...props }: React.ComponentPropsWithoutRef<"th">) {\n  const { grid } = useContext(TableContext);\n  return <th {...props} className={`border-b border-zinc-950/10 px-4 py-2 font-medium dark:border-white/10 ${grid ? "border-l border-zinc-950/5 first:border-l-0 dark:border-l-white/5" : ""} ${className ?? ""}`} />;\n}\n\nexport function TableCell({ className, children, ...props }: React.ComponentPropsWithoutRef<"td">) {\n  const { dense, grid, striped } = useContext(TableContext);\n  return (\n    <td {...props} className={`relative px-4 ${dense ? "py-2.5" : "py-4"} ${!striped ? "border-b border-zinc-950/5 dark:border-white/5" : ""} ${grid ? "border-l border-zinc-950/5 first:border-l-0 dark:border-l-white/5" : ""} ${className ?? ""}`}>\n      {children}\n    </td>\n  );\n}'
});

// ── CATALYST: Checkbox (multi-color, Headless UI) ──

CREATE (c3:LearnedComponentPattern {
  name: 'CatalystCheckbox',
  source: 'catalyst-ui-kit',
  category: 'input',
  description: 'Accessible checkbox with 20+ color variants, indeterminate state support, focus ring, and disabled state. Uses Headless UI Checkbox primitive.',
  props: 'color, checked, onChange, disabled, indeterminate',
  usage_example: '"use client";\nimport { Checkbox as HeadlessCheckbox } from "@headlessui/react";\n\ntype CheckboxColor = "zinc" | "red" | "green" | "blue" | "amber" | "indigo" | "purple";\n\nconst colorMap: Record<CheckboxColor, string> = {\n  zinc: "data-checked:bg-zinc-600 data-checked:border-zinc-700",\n  red: "data-checked:bg-red-600 data-checked:border-red-700",\n  green: "data-checked:bg-green-600 data-checked:border-green-700",\n  blue: "data-checked:bg-blue-600 data-checked:border-blue-700",\n  amber: "data-checked:bg-amber-400 data-checked:border-amber-500",\n  indigo: "data-checked:bg-indigo-500 data-checked:border-indigo-600",\n  purple: "data-checked:bg-purple-500 data-checked:border-purple-600",\n};\n\nexport function Checkbox({ color = "zinc", className, ...props }: {\n  color?: CheckboxColor; className?: string;\n} & Omit<React.ComponentProps<typeof HeadlessCheckbox>, "className">) {\n  return (\n    <HeadlessCheckbox {...props} className={`group inline-flex focus:outline-none ${className ?? ""}`}>\n      <span className={`relative flex h-4.5 w-4.5 items-center justify-center rounded-[0.3125rem] border border-zinc-950/15 bg-white shadow-sm sm:h-4 sm:w-4 dark:bg-white/5 dark:border-white/15 data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500 data-disabled:opacity-50 ${colorMap[color]}`}>\n        <svg className="h-4 w-4 stroke-white opacity-0 group-data-checked:opacity-100 sm:h-3.5 sm:w-3.5" viewBox="0 0 14 14" fill="none">\n          <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />\n        </svg>\n      </span>\n    </HeadlessCheckbox>\n  );\n}\n\nexport function CheckboxField({ className, children, ...props }: React.ComponentPropsWithoutRef<"div">) {\n  return (\n    <div className={`grid grid-cols-[1.125rem_1fr] items-start gap-x-3 gap-y-1 sm:grid-cols-[1rem_1fr] ${className ?? ""}`} {...props}>\n      {children}\n    </div>\n  );\n}'
});

// ── CATALYST: Switch (toggle, multi-color) ──

CREATE (c4:LearnedComponentPattern {
  name: 'CatalystSwitch',
  source: 'catalyst-ui-kit',
  category: 'input',
  description: 'Toggle switch with color variants, smooth transition, focus ring, and disabled state. Uses Headless UI Switch. Includes SwitchField layout for label + switch pairs.',
  props: 'color, checked, onChange, disabled',
  usage_example: '"use client";\nimport { Switch as HeadlessSwitch, Field } from "@headlessui/react";\n\ntype SwitchColor = "zinc" | "red" | "green" | "blue" | "amber" | "indigo";\n\nconst colorMap: Record<SwitchColor, string> = {\n  zinc: "data-checked:bg-zinc-900 dark:data-checked:bg-zinc-600",\n  red: "data-checked:bg-red-600",\n  green: "data-checked:bg-green-600",\n  blue: "data-checked:bg-blue-600",\n  amber: "data-checked:bg-amber-500",\n  indigo: "data-checked:bg-indigo-500",\n};\n\nexport function Switch({ color = "zinc", className, ...props }: {\n  color?: SwitchColor; className?: string;\n} & Omit<React.ComponentProps<typeof HeadlessSwitch>, "className">) {\n  return (\n    <HeadlessSwitch {...props} className={`group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-zinc-200 transition-colors duration-200 ease-in-out focus:outline-none data-focus:ring-2 data-focus:ring-blue-500 data-focus:ring-offset-2 data-disabled:opacity-50 data-disabled:cursor-not-allowed dark:bg-white/10 ${colorMap[color]} ${className ?? ""}`}>\n      <span className="pointer-events-none relative inline-block h-5 w-5 translate-x-0 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out group-data-checked:translate-x-5">\n        <span className="absolute inset-0 flex h-full w-full items-center justify-center transition-opacity group-data-checked:opacity-0 group-data-checked:duration-100 group-data-checked:ease-out" aria-hidden="true">\n          <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 12 12"><path d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>\n        </span>\n        <span className="absolute inset-0 flex h-full w-full items-center justify-center opacity-0 transition-opacity group-data-checked:opacity-100 group-data-checked:duration-200 group-data-checked:ease-in" aria-hidden="true">\n          <svg className="h-3 w-3 text-indigo-600" fill="currentColor" viewBox="0 0 12 12"><path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" /></svg>\n        </span>\n      </span>\n    </HeadlessSwitch>\n  );\n}\n\nexport function SwitchField({ className, children }: { className?: string; children: React.ReactNode }) {\n  return (\n    <Field className={`grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-1 ${className ?? ""}`}>\n      {children}\n    </Field>\n  );\n}'
});

// ── CATALYST: Pagination (prev/next/pages/gap) ──

CREATE (c5:LearnedComponentPattern {
  name: 'CatalystPagination',
  source: 'catalyst-ui-kit',
  category: 'navigation',
  description: 'Composable pagination with Previous, Next, page numbers, and gap indicator. Disables prev/next at boundaries. Hidden on mobile, visible on sm+.',
  props: 'children (PaginationPrevious, PaginationNext, PaginationList, PaginationPage, PaginationGap)',
  usage_example: 'import Link from "next/link";\n\nexport function Pagination({ className, children, ...props }: React.ComponentPropsWithoutRef<"nav">) {\n  return <nav aria-label="Page navigation" {...props} className={`flex gap-x-2 ${className ?? ""}`}>{children}</nav>;\n}\n\nexport function PaginationPrevious({ href, children = "Previous" }: { href?: string | null; children?: React.ReactNode }) {\n  return (\n    <span className="grow basis-0">\n      {href ? (\n        <Link href={href} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">\n          <svg className="h-4 w-4 stroke-current" viewBox="0 0 16 16" fill="none"><path d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>\n          {children}\n        </Link>\n      ) : (\n        <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 cursor-not-allowed">\n          <svg className="h-4 w-4 stroke-current" viewBox="0 0 16 16" fill="none"><path d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>\n          {children}\n        </span>\n      )}\n    </span>\n  );\n}\n\nexport function PaginationNext({ href, children = "Next" }: { href?: string | null; children?: React.ReactNode }) {\n  return (\n    <span className="flex grow basis-0 justify-end">\n      {href ? (\n        <Link href={href} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">\n          {children}\n          <svg className="h-4 w-4 stroke-current" viewBox="0 0 16 16" fill="none"><path d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>\n        </Link>\n      ) : (\n        <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 cursor-not-allowed">\n          {children}\n          <svg className="h-4 w-4 stroke-current" viewBox="0 0 16 16" fill="none"><path d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>\n        </span>\n      )}\n    </span>\n  );\n}\n\nexport function PaginationList({ className, children }: { className?: string; children: React.ReactNode }) {\n  return <span className={`hidden items-baseline gap-x-2 sm:flex ${className ?? ""}`}>{children}</span>;\n}\n\nexport function PaginationPage({ href, current = false, children }: { href: string; current?: boolean; children: React.ReactNode }) {\n  return (\n    <Link href={href} aria-current={current ? "page" : undefined}\n      className={`relative min-w-9 rounded-lg px-2 py-1.5 text-center text-sm font-semibold ${current ? "bg-zinc-950/5 text-zinc-950 dark:bg-white/10" : "text-zinc-600 hover:bg-zinc-100"}`}>\n      {children}\n    </Link>\n  );\n}\n\nexport function PaginationGap() {\n  return <span aria-hidden="true" className="w-9 text-center text-sm font-semibold text-zinc-950 select-none">&hellip;</span>;\n}'
});

// ── PLASMA: Sheet (slide-out panel, 4 directions) ──

CREATE (c6:LearnedComponentPattern {
  name: 'Sheet',
  source: 'plasma-template',
  category: 'feedback',
  description: 'Slide-out panel from any side (top, right, bottom, left) using Radix Dialog. Includes overlay, close button, header, footer, title, description. Used for filters, detail views, settings.',
  props: 'side, children, open, onOpenChange',
  usage_example: '"use client";\nimport * as SheetPrimitive from "@radix-ui/react-dialog";\n\nexport function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {\n  return <SheetPrimitive.Root {...props} />;\n}\n\nexport function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {\n  return <SheetPrimitive.Trigger {...props} />;\n}\n\nfunction SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {\n  return <SheetPrimitive.Overlay className={`fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className ?? ""}`} {...props} />;\n}\n\nexport function SheetContent({ className, children, side = "right", ...props }: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }) {\n  const sideStyles: Record<string, string> = {\n    right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",\n    left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",\n    top: "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",\n    bottom: "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",\n  };\n  return (\n    <SheetPrimitive.Portal>\n      <SheetOverlay />\n      <SheetPrimitive.Content className={`bg-white dark:bg-zinc-900 fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 ${sideStyles[side]} ${className ?? ""}`} {...props}>\n        {children}\n        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none">\n          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>\n          <span className="sr-only">Close</span>\n        </SheetPrimitive.Close>\n      </SheetPrimitive.Content>\n    </SheetPrimitive.Portal>\n  );\n}\n\nexport function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {\n  return <div className={`flex flex-col gap-1.5 p-4 ${className ?? ""}`} {...props} />;\n}\n\nexport function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {\n  return <div className={`mt-auto flex flex-col gap-2 p-4 ${className ?? ""}`} {...props} />;\n}\n\nexport function SheetTitle(props: React.ComponentProps<typeof SheetPrimitive.Title>) {\n  return <SheetPrimitive.Title className="text-foreground font-semibold" {...props} />;\n}\n\nexport function SheetDescription(props: React.ComponentProps<typeof SheetPrimitive.Description>) {\n  return <SheetPrimitive.Description className="text-muted-foreground text-sm" {...props} />;\n}'
});

// ── PLASMA: Tooltip ──

CREATE (c7:LearnedComponentPattern {
  name: 'Tooltip',
  source: 'plasma-template',
  category: 'feedback',
  description: 'Hover tooltip using Radix TooltipPrimitive. Auto-wraps with TooltipProvider. Includes arrow indicator, smooth animations, and z-50 layering.',
  props: 'children, content, side, sideOffset',
  usage_example: '"use client";\nimport * as TooltipPrimitive from "@radix-ui/react-tooltip";\n\nfunction TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {\n  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;\n}\n\nexport function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {\n  return <TooltipProvider><TooltipPrimitive.Root {...props} /></TooltipProvider>;\n}\n\nexport function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {\n  return <TooltipPrimitive.Trigger {...props} />;\n}\n\nexport function TooltipContent({ className, sideOffset = 4, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {\n  return (\n    <TooltipPrimitive.Portal>\n      <TooltipPrimitive.Content sideOffset={sideOffset}\n        className={`bg-gray-900 text-white z-50 rounded-md px-3 py-1.5 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ${className ?? ""}`} {...props}>\n        {children}\n        <TooltipPrimitive.Arrow className="fill-gray-900" />\n      </TooltipPrimitive.Content>\n    </TooltipPrimitive.Portal>\n  );\n}'
});

// ── PLASMA: Form (React Hook Form integration) ──

CREATE (c8:LearnedComponentPattern {
  name: 'FormSystem',
  source: 'plasma-template',
  category: 'input',
  description: 'React Hook Form integration with FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage. Context-based field state for automatic error display and accessibility.',
  props: 'form (useForm return), onSubmit',
  usage_example: '"use client";\nimport { createContext, useContext, useId } from "react";\nimport { Controller, FormProvider, useFormContext, useFormState, type ControllerProps, type FieldPath, type FieldValues } from "react-hook-form";\nimport { Slot } from "@radix-ui/react-slot";\n\nexport const Form = FormProvider;\n\ntype FormFieldContextValue = { name: string };\nconst FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);\n\nexport function FormField<T extends FieldValues, N extends FieldPath<T>>(props: ControllerProps<T, N>) {\n  return <FormFieldContext.Provider value={{ name: props.name }}><Controller {...props} /></FormFieldContext.Provider>;\n}\n\ntype FormItemContextValue = { id: string };\nconst FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);\n\nfunction useFormField() {\n  const { name } = useContext(FormFieldContext);\n  const { id } = useContext(FormItemContext);\n  const { getFieldState } = useFormContext();\n  const formState = useFormState({ name });\n  return { id, name, formItemId: `${id}-form-item`, formDescriptionId: `${id}-form-item-description`, formMessageId: `${id}-form-item-message`, ...getFieldState(name, formState) };\n}\n\nexport function FormItem({ className, ...props }: React.ComponentProps<\"div\">) {\n  const id = useId();\n  return <FormItemContext.Provider value={{ id }}><div className={`grid gap-2 ${className ?? \"\"}`} {...props} /></FormItemContext.Provider>;\n}\n\nexport function FormLabel({ className, ...props }: React.ComponentProps<\"label\">) {\n  const { error, formItemId } = useFormField();\n  return <label htmlFor={formItemId} className={`text-sm font-medium ${error ? \"text-red-600\" : \"text-gray-700\"} ${className ?? \"\"}`} {...props} />;\n}\n\nexport function FormControl(props: React.ComponentProps<typeof Slot>) {\n  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();\n  return <Slot id={formItemId} aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`} aria-invalid={!!error} {...props} />;\n}\n\nexport function FormDescription({ className, ...props }: React.ComponentProps<\"p\">) {\n  const { formDescriptionId } = useFormField();\n  return <p id={formDescriptionId} className={`text-sm text-gray-500 ${className ?? \"\"}`} {...props} />;\n}\n\nexport function FormMessage({ className, ...props }: React.ComponentProps<\"p\">) {\n  const { error, formMessageId } = useFormField();\n  const body = error ? String(error.message ?? \"\") : props.children;\n  if (!body) return null;\n  return <p id={formMessageId} className={`text-xs text-red-600 ${className ?? \"\"}`} {...props}>{body}</p>;\n}'
});

// ── CATALYST: Dropdown Menu (actions, sections, shortcuts) ──

CREATE (c9:LearnedComponentPattern {
  name: 'DropdownMenu',
  source: 'catalyst-ui-kit',
  category: 'navigation',
  description: 'Dropdown action menu with items, sections, headers, dividers, labels, descriptions, and keyboard shortcuts. Uses Headless UI Menu. Supports link items and button items.',
  props: 'children (DropdownButton, DropdownMenu, DropdownItem, DropdownSection, DropdownDivider)',
  usage_example: '"use client";\nimport { Menu, MenuButton, MenuItems, MenuItem } from "@headlessui/react";\n\nexport function Dropdown(props: React.ComponentProps<typeof Menu>) {\n  return <Menu {...props} />;\n}\n\nexport function DropdownButton({ children, ...props }: React.ComponentProps<typeof MenuButton>) {\n  return <MenuButton className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" {...props}>{children}</MenuButton>;\n}\n\nexport function DropdownMenuItems({ className, ...props }: React.ComponentProps<typeof MenuItems>) {\n  return (\n    <MenuItems transition anchor="bottom" className={`z-50 w-max rounded-xl bg-white/75 p-1 backdrop-blur-xl shadow-lg ring-1 ring-zinc-950/10 transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 dark:bg-zinc-800/75 dark:ring-white/10 ${className ?? ""}`} {...props} />\n  );\n}\n\nexport function DropdownItem({ className, children, ...props }: { className?: string; children: React.ReactNode } & React.ComponentPropsWithoutRef<"button">) {\n  return (\n    <MenuItem>\n      <button className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-950 data-focus:bg-blue-500 data-focus:text-white dark:text-white ${className ?? ""}`} {...props}>\n        {children}\n      </button>\n    </MenuItem>\n  );\n}\n\nexport function DropdownDivider() {\n  return <div className="my-1 h-px bg-zinc-200 dark:bg-white/10" />;\n}\n\nexport function DropdownLabel({ children }: { children: React.ReactNode }) {\n  return <div className="px-3 py-1 text-xs font-medium text-zinc-500">{children}</div>;\n}'
});

// ── SCALAR: Alert (default + destructive) ──

CREATE (c10:LearnedComponentPattern {
  name: 'Alert',
  source: 'scalar-template',
  category: 'feedback',
  description: 'Alert banner with default and destructive variants. Grid layout supports optional icon. Includes AlertTitle and AlertDescription sub-components.',
  props: 'variant, children',
  usage_example: 'const alertVariants = {\n  default: "bg-card text-card-foreground",\n  destructive: "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",\n};\n\nexport function Alert({ variant = "default", className, ...props }: {\n  variant?: "default" | "destructive"; className?: string;\n} & React.ComponentPropsWithoutRef<"div">) {\n  return (\n    <div role="alert" className={`relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:translate-y-0.5 [&>svg]:text-current ${alertVariants[variant]} ${className ?? ""}`} {...props} />\n  );\n}\n\nexport function AlertTitle({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {\n  return <div className={`col-start-2 font-medium leading-none ${className ?? ""}`} {...props} />;\n}\n\nexport function AlertDescription({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {\n  return <div data-slot="alert-description" className={`col-start-2 text-sm [&_p]:leading-relaxed ${className ?? ""}`} {...props} />;\n}'
});

// ── PLASMA: Skeleton (animated loading) ──

CREATE (c11:LearnedComponentPattern {
  name: 'Skeleton',
  source: 'plasma-template',
  category: 'feedback',
  description: 'Simple animated loading skeleton. Apply to any shape via className. Uses pulse animation with subtle background.',
  props: 'className',
  usage_example: 'export function Skeleton({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {\n  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800 ${className ?? ""}`} {...props} />;\n}\n\n// Usage examples:\n// <Skeleton className="h-4 w-48" />         — text line\n// <Skeleton className="h-10 w-10 rounded-full" />  — avatar\n// <Skeleton className="h-32 w-full" />       — card\n// <Skeleton className="h-8 w-24" />          — button'
});

// ── PLASMA: Tabs (Radix, composable) ──

CREATE (c12:LearnedComponentPattern {
  name: 'RadixTabs',
  source: 'plasma-template',
  category: 'navigation',
  description: 'Composable tabs using Radix TabsPrimitive. Includes TabsList (container), TabsTrigger (individual tab), and TabsContent (panel). Inline styling with ring focus and data-state active indicator.',
  props: 'defaultValue, children',
  usage_example: '"use client";\nimport * as TabsPrimitive from "@radix-ui/react-tabs";\n\nexport function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) {\n  return <TabsPrimitive.Root {...props} />;\n}\n\nexport function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {\n  return (\n    <TabsPrimitive.List className={`inline-flex h-9 items-center justify-center rounded-lg bg-zinc-100 p-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 ${className ?? ""}`} {...props} />\n  );\n}\n\nexport function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {\n  return (\n    <TabsPrimitive.Trigger className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-zinc-950 data-[state=active]:shadow dark:ring-offset-zinc-950 dark:data-[state=active]:bg-zinc-950 dark:data-[state=active]:text-zinc-50 ${className ?? ""}`} {...props} />\n  );\n}\n\nexport function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {\n  return (\n    <TabsPrimitive.Content className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:ring-offset-zinc-950 ${className ?? ""}`} {...props} />\n  );\n}'
});

// ============================================================
// CROSS-RELATIONSHIPS
// These edges make the graph traversable so AES can pull
// complete dependency chains, not just individual components.
// ============================================================

// ── DEPENDS_ON ──
// "I need this other component to function"

// AppShell needs navigation items rendered with buttons/links
CREATE (t1)-[:DEPENDS_ON {reason: 'sidebar nav items'}]->(t4);

// DataTable depends on Badge for status cells and Button for row actions
CREATE (t5)-[:DEPENDS_ON {reason: 'status cells'}]->(t7);
CREATE (t5)-[:DEPENDS_ON {reason: 'row actions'}]->(t4);

// ConfirmDialog is built on Modal + needs action buttons
CREATE (t14)-[:DEPENDS_ON {reason: 'dialog container'}]->(t13);
CREATE (t14)-[:DEPENDS_ON {reason: 'confirm/cancel actions'}]->(t4);

// Modal needs Button for close/action
CREATE (t13)-[:DEPENDS_ON {reason: 'close and action buttons'}]->(t4);

// FormField wraps input primitives
CREATE (t9)-[:DEPENDS_ON {reason: 'text input primitive'}]->(t10);
CREATE (t9)-[:DEPENDS_ON {reason: 'select primitive'}]->(t11);
CREATE (t9)-[:DEPENDS_ON {reason: 'textarea primitive'}]->(t12);

// FormSystem (react-hook-form) wraps FormField
CREATE (c8)-[:DEPENDS_ON {reason: 'field wrapper'}]->(t9);
CREATE (c8)-[:DEPENDS_ON {reason: 'text input'}]->(t10);
CREATE (c8)-[:DEPENDS_ON {reason: 'select input'}]->(t11);

// SearchInput is a specialized TextInput
CREATE (t19)-[:DEPENDS_ON {reason: 'base input behavior'}]->(t10);

// CatalystSidebarLayout uses Button for mobile menu toggle
CREATE (c1)-[:DEPENDS_ON {reason: 'mobile menu trigger'}]->(t4);

// CatalystTable depends on Badge for status and Button for actions
CREATE (c2)-[:DEPENDS_ON {reason: 'status badges'}]->(t7);
CREATE (c2)-[:DEPENDS_ON {reason: 'row actions'}]->(t4);

// CatalystPagination depends on Button for page controls
CREATE (c5)-[:DEPENDS_ON {reason: 'page navigation buttons'}]->(t4);

// DropdownMenu uses Button as trigger
CREATE (c9)-[:DEPENDS_ON {reason: 'menu trigger'}]->(t4);

// Sheet (slide-out panel) needs Button for close
CREATE (c6)-[:DEPENDS_ON {reason: 'close button'}]->(t4);

// DashboardGrid typically contains StatCards
CREATE (t20)-[:DEPENDS_ON {reason: 'stat display'}]->(t6);

// ── COMPOSES ──
// "I commonly appear inside this container"

// PageHeader + PageContent compose inside AppShell
CREATE (t1)-[:COMPOSES {reason: 'page structure'}]->(t2);
CREATE (t1)-[:COMPOSES {reason: 'page structure'}]->(t3);

// AppShell composes Breadcrumb for navigation context
CREATE (t1)-[:COMPOSES {reason: 'navigation hierarchy'}]->(t17);

// ListDetailLayout composes inside PageContent
CREATE (t3)-[:COMPOSES {reason: 'list-detail pattern'}]->(t21);

// DataTable composes inside PageContent
CREATE (t3)-[:COMPOSES {reason: 'data display'}]->(t5);

// DashboardGrid composes inside PageContent
CREATE (t3)-[:COMPOSES {reason: 'dashboard layout'}]->(t20);

// Tabs/RadixTabs compose inside PageContent
CREATE (t3)-[:COMPOSES {reason: 'tabbed content'}]->(t18);
CREATE (t3)-[:COMPOSES {reason: 'tabbed content'}]->(c12);

// CatalystSidebarLayout composes the same page structure
CREATE (c1)-[:COMPOSES {reason: 'page header'}]->(t2);
CREATE (c1)-[:COMPOSES {reason: 'page content'}]->(t3);

// Modal composes FormField for form dialogs
CREATE (t13)-[:COMPOSES {reason: 'form inside dialog'}]->(t9);

// Sheet composes FormSystem for slide-out forms
CREATE (c6)-[:COMPOSES {reason: 'form inside panel'}]->(c8);

// ── PLACEHOLDER_FOR ──
// "I'm the loading state for this component"

CREATE (t15)-[:PLACEHOLDER_FOR {reason: 'table loading state'}]->(t5);
CREATE (t15)-[:PLACEHOLDER_FOR {reason: 'stat loading state'}]->(t6);
CREATE (t15)-[:PLACEHOLDER_FOR {reason: 'list loading state'}]->(t21);
CREATE (c11)-[:PLACEHOLDER_FOR {reason: 'table loading state'}]->(t5);
CREATE (c11)-[:PLACEHOLDER_FOR {reason: 'card loading state'}]->(t6);
CREATE (c11)-[:PLACEHOLDER_FOR {reason: 'form loading state'}]->(c8);
CREATE (c11)-[:PLACEHOLDER_FOR {reason: 'catalyst table loading'}]->(c2);

// ── VARIANT_OF ──
// "I'm an alternative implementation of the same concept"

// Sheet is a panel variant of Modal
CREATE (c6)-[:VARIANT_OF {reason: 'slide-out vs overlay dialog'}]->(t13);

// CatalystSidebarLayout is a variant of AppShell
CREATE (c1)-[:VARIANT_OF {reason: 'headless-ui vs plain sidebar'}]->(t1);

// CatalystTable is a variant of DataTable
CREATE (c2)-[:VARIANT_OF {reason: 'context-driven vs prop-driven table'}]->(t5);

// RadixTabs is a variant of Tabs
CREATE (c12)-[:VARIANT_OF {reason: 'radix vs plain tabs'}]->(t18);

// Skeleton is a variant of LoadingSkeleton
CREATE (c11)-[:VARIANT_OF {reason: 'pulse vs shimmer skeleton'}]->(t15);

// CatalystCheckbox and CatalystSwitch are toggle variants
CREATE (c4)-[:VARIANT_OF {reason: 'switch vs checkbox toggle'}]->(c3);

// ── ERROR_STATE_FOR ──
// "I'm what renders when this component fails"

CREATE (t16)-[:ERROR_STATE_FOR {reason: 'fallback on crash'}]->(t5);
CREATE (t16)-[:ERROR_STATE_FOR {reason: 'fallback on crash'}]->(t20);
CREATE (t16)-[:ERROR_STATE_FOR {reason: 'fallback on crash'}]->(t21);

// ── EMPTY_STATE_FOR ──
// "I render when this component has no data"

CREATE (t15)-[:EMPTY_STATE_FOR {reason: 'no rows placeholder'}]->(t5);
CREATE (t15)-[:EMPTY_STATE_FOR {reason: 'no rows placeholder'}]->(c2);
CREATE (t15)-[:EMPTY_STATE_FOR {reason: 'no items placeholder'}]->(t21);

// ── NOTIFIES_WITH ──
// "I use this component to communicate outcomes"

CREATE (t14)-[:NOTIFIES_WITH {reason: 'success/failure toast after confirm'}]->(t15);
CREATE (c8)-[:NOTIFIES_WITH {reason: 'form submission feedback'}]->(t15);
CREATE (t13)-[:NOTIFIES_WITH {reason: 'dialog action feedback'}]->(t15);

// ── PAIRS_WITH ──
// "We commonly appear together on the same page"

// Search + Table
CREATE (t19)-[:PAIRS_WITH {reason: 'filter table rows'}]->(t5);
CREATE (t19)-[:PAIRS_WITH {reason: 'filter catalyst table'}]->(c2);

// Pagination + Table
CREATE (c5)-[:PAIRS_WITH {reason: 'paginate table rows'}]->(t5);
CREATE (c5)-[:PAIRS_WITH {reason: 'paginate catalyst table'}]->(c2);

// Tooltip + Button (action hints)
CREATE (c7)-[:PAIRS_WITH {reason: 'action button hints'}]->(t4);

// Tooltip + Avatar (user info on hover)
CREATE (c7)-[:PAIRS_WITH {reason: 'user info on hover'}]->(t8);

// Breadcrumb + PageHeader (navigation context)
CREATE (t17)-[:PAIRS_WITH {reason: 'breadcrumb above header'}]->(t2);

// Alert + FormSystem (form-level error display)
CREATE (c10)-[:PAIRS_WITH {reason: 'form-level error/success'}]->(c8);

// DropdownMenu + DataTable (row actions menu)
CREATE (c9)-[:PAIRS_WITH {reason: 'row action menu'}]->(t5);
CREATE (c9)-[:PAIRS_WITH {reason: 'row action menu'}]->(c2);