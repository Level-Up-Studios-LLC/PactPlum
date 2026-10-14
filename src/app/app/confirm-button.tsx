"use client";

/** A submit button that asks for confirmation before its form submits. */
export function ConfirmButton({ message, label, className }: { message: string; label: string; className: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
