import type { AppSettings } from '@passflow/core';
import { useEffect, useMemo, useRef } from 'react';
import type { AuthMethods } from '@/utils';
import { type AuthAgentFlow, type AuthAgentToolActions, buildAuthAgentTools, describeAuthMethods } from '@/utils/agent-tools';
import { findModelContext } from '@/utils/model-context';
import { usePassflow } from './use-passflow';

/**
 * Registers the sign-in or sign-up form's WebMCP tools while the form is mounted, if the browser has a model-context
 * API. Nothing is registered before the app settings load or on a `human_only` app. All tools share one abort signal,
 * aborted on unmount and before a new set is registered.
 */
export const useAuthAgentTools = ({
  flow,
  appSettings,
  authMethods,
  actions,
}: {
  flow: AuthAgentFlow;
  appSettings: AppSettings | null | undefined;
  authMethods: AuthMethods;
  actions: AuthAgentToolActions;
}): void => {
  const passflow = usePassflow();
  // Read at call time, so a tool runs the latest render's handlers without registering again.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const authMethodsRef = useRef(authMethods);
  authMethodsRef.current = authMethods;

  const settingsLoaded = Boolean(appSettings);
  const botMode = appSettings?.bot_mode;
  // The tool set changes only when the enabled methods do, not when a new but equal methods object arrives.
  const toolsKey = useMemo(() => JSON.stringify(describeAuthMethods(authMethods, flow)), [authMethods, flow]);

  useEffect(() => {
    if (!settingsLoaded || botMode === 'human_only') return;
    const modelContext = findModelContext();
    if (!modelContext) return;

    const controller = new AbortController();
    const tools = buildAuthAgentTools({
      flow,
      authMethods: authMethodsRef.current,
      getStatus: () => ({
        signedIn: passflow.isAuthenticated(),
        secondFactorPending: passflow.isTwoFactorVerificationRequired(),
      }),
      actions: () => actionsRef.current,
    });
    try {
      for (const tool of tools) modelContext.registerTool(tool, { signal: controller.signal });
    } catch {
      // The page works without tools: drop the ones already registered and carry on.
      controller.abort();
    }
    return () => controller.abort();
  }, [passflow, flow, settingsLoaded, botMode, toolsKey]);
};
