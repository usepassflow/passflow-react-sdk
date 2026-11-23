/**
 * The page's WebMCP surface: the browser API an in-browser agent uses to call tools a page registers.
 * The API is still a browser draft, so its shape is typed here rather than taken from a DOM lib.
 */

export type ModelContextToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

export type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  annotations: { readOnlyHint: boolean };
  /** The browser does not check `inputSchema`, so `args` may be anything. */
  execute: (args: unknown) => Promise<ModelContextToolResult>;
};

export type ModelContext = {
  /** Aborting `signal` removes the tool again. */
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => void;
};

type WithModelContext = { modelContext?: unknown };

const asModelContext = (candidate: unknown): ModelContext | undefined =>
  typeof candidate === 'object' && candidate !== null && typeof (candidate as Partial<ModelContext>).registerTool === 'function'
    ? (candidate as ModelContext)
    : undefined;

/**
 * `document.modelContext`, then `navigator.modelContext`. `undefined` when neither has a `registerTool` function, and
 * outside a browser.
 */
export const findModelContext = (): ModelContext | undefined => {
  const fromDocument =
    typeof document === 'undefined' ? undefined : asModelContext((document as unknown as WithModelContext).modelContext);
  if (fromDocument) return fromDocument;
  return typeof navigator === 'undefined' ? undefined : asModelContext((navigator as unknown as WithModelContext).modelContext);
};
