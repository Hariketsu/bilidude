import { ChevronsUpDown } from 'lucide-react';

/** A titled card of rows, like iOS grouped settings. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-4 text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">{children}</div>
      {footer && <p className="px-4 text-xs leading-relaxed text-fg-muted">{footer}</p>}
    </section>
  );
}

/**
 * Label on the left, control on the right. A `<label>`, so clicking the text focuses
 * the control; `group` rows hold several buttons and must not forward clicks to the first.
 */
export function Row({ label, group, children }: { label: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="flex min-h-12 items-center gap-4 px-4 py-2 text-sm">
      <span className="shrink-0 text-fg">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
    </Tag>
  );
}

/** Explanatory or warning text inside a card. */
export function Hint({ children, warning }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <div className={`px-4 py-2.5 text-xs leading-relaxed ${warning ? 'text-red-500' : 'text-fg-muted'}`}>{children}</div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T | '';
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  /** Shown while nothing is chosen. */
  placeholder?: string;
}) {
  return (
    <Row label={label}>
      <span className="relative flex min-w-0 items-center text-fg-muted hover:text-fg">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-5 text-right outline-none [text-align-last:right]"
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-0 size-3.5" />
      </span>
    </Row>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <Row label={label}>
      <input
        aria-label={label}
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-right text-fg outline-none placeholder:text-fg-muted/60"
      />
    </Row>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Row label={label}>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-raised'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </Row>
  );
}
