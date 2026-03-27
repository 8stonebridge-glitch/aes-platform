import * as React from "react";

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  type?: "text" | "email" | "password" | "number" | "search" | "url" | "tel";
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  id?: string;
  name?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
}

export function Input({
  label,
  placeholder,
  value,
  defaultValue,
  type = "text",
  disabled = false,
  required = false,
  error,
  hint,
  id,
  name,
  onChange,
  onBlur,
  className = "",
}: InputProps) {
  const inputId = id ?? `aes-input-${name ?? "field"}`;
  return (
    <div className={`aes-input-wrapper ${error ? "aes-input-error" : ""} ${className}`.trim()}>
      {label ? (
        <label htmlFor={inputId} className="aes-input-label">
          {label}
          {required ? <span className="aes-input-required" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      <input
        id={inputId}
        name={name}
        type={type}
        className="aes-input"
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        onChange={onChange}
        onBlur={onBlur}
      />
      {error ? <p id={`${inputId}-error`} className="aes-input-error-text" role="alert">{error}</p> : null}
      {hint && !error ? <p id={`${inputId}-hint`} className="aes-input-hint">{hint}</p> : null}
    </div>
  );
}
