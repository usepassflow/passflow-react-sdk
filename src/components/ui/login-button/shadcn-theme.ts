/**
 * Reads a host app's shadcn/ui colour variables for `appearance="shadcn"`.
 *
 * shadcn themes come in two formats. Older themes store a bare HSL triplet
 * (`--primary: 222.2 47.4% 11.2%`) that the app wraps as `hsl(var(--primary))`;
 * Tailwind v4 themes store a complete colour (`oklch(0.205 0 0)`, a hex, …)
 * used as `var(--primary)`. CSS cannot tell the two apart, so the value is read
 * in script and handed to the stylesheet as a `--passflow-login-button-*`
 * custom property. A missing variable sets nothing and the stylesheet's
 * `--passflow-*` fallback applies.
 */

const HSL_TRIPLET = /^[+-]?[\d.]+(deg|rad|grad|turn)?\s+[+-]?[\d.]+%\s+[+-]?[\d.]+%(\s*\/\s*[+-]?[\d.]+%?)?$/;

/** A shadcn colour variable's value as a CSS colour, or `undefined` when the variable is missing. */
export const toCssColor = (raw: string): string | undefined => {
  const value = raw.trim();
  if (!value) return undefined;
  return HSL_TRIPLET.test(value) ? `hsl(${value})` : value;
};

const COLOR_VARIABLES = {
  '--primary': '--passflow-login-button-background',
  '--primary-foreground': '--passflow-login-button-foreground',
  '--ring': '--passflow-login-button-ring',
} as const;

export type ShadcnThemeProperties = Partial<Record<(typeof COLOR_VARIABLES)[keyof typeof COLOR_VARIABLES], string>>;

/** The login button custom properties for the shadcn colour variables that reach `element`. */
export const readShadcnTheme = (element: Element): ShadcnThemeProperties => {
  const style = getComputedStyle(element);
  const properties: ShadcnThemeProperties = {};
  for (const [source, target] of Object.entries(COLOR_VARIABLES) as [
    keyof typeof COLOR_VARIABLES,
    (typeof COLOR_VARIABLES)[keyof typeof COLOR_VARIABLES],
  ][]) {
    const color = toCssColor(style.getPropertyValue(source));
    if (color) properties[target] = color;
  }
  return properties;
};
