import type { LoginAccessScope } from '@/components/ui';
import type { ConsentResource, ConsentScopeMetadata } from '@/hooks/use-consent';

/**
 * Readers for the lists a server response carries about what an approval
 * grants. The body is not checked before these, so each one skips what it
 * cannot show and returns undefined when nothing is left.
 */

export const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The items the screen can show, or undefined when there are none. */
export const usable = <T>(list: unknown, read: (item: Partial<T>) => T | undefined): T[] | undefined => {
  if (!Array.isArray(list)) return undefined;
  const items = list.flatMap((item) => read(item ?? {}) ?? []);
  return items.length ? items : undefined;
};

export const readResource = ({ uri, name }: Partial<ConsentResource>): Pick<ConsentResource, 'uri' | 'name'> | undefined =>
  isText(uri) ? { uri, name: isText(name) ? name : undefined } : undefined;

/** Each scope named as the consent screen names it: the server's label, or the scope itself. */
export const readAccessScopes = (scopes: unknown, metadata: unknown): LoginAccessScope[] | undefined => {
  if (!Array.isArray(scopes)) return undefined;
  const known = Array.isArray(metadata) ? (metadata as Partial<ConsentScopeMetadata>[]) : [];
  const items = scopes.filter(isText).map((scope) => {
    const meta = known.find((entry) => entry?.scope === scope);
    return {
      scope,
      label: isText(meta?.label) ? meta.label : scope,
      description: isText(meta?.description) ? meta.description : undefined,
    };
  });
  return items.length ? items : undefined;
};
