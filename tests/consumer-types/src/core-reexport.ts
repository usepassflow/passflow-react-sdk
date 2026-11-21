// @passflow/react re-exports @passflow/core (`export * from '@passflow/core'`). Since core 0.20.1 ships
// node16-safe declarations, this is checked in every leg like the package's own types.
import {
  Passflow,
  type PassflowConfig,
  type PassflowRevokeOtherSessionsResponse,
  type PassflowSessionDevice,
  type PassflowUserSession,
  type PassflowUserSessionList,
  useSessions,
} from '@passflow/react';

type IsAny<T> = 0 extends 1 & T ? true : false;
type ExpectFalse<T extends false> = T;

export type Canaries = [
  ExpectFalse<IsAny<PassflowConfig>>,
  ExpectFalse<IsAny<typeof Passflow>>,
  ExpectFalse<IsAny<PassflowUserSession>>,
  ExpectFalse<IsAny<PassflowSessionDevice>>,
  ExpectFalse<IsAny<PassflowUserSessionList>>,
  ExpectFalse<IsAny<PassflowRevokeOtherSessionsResponse>>,
  ExpectFalse<IsAny<ReturnType<typeof useSessions>>>,
];

export const config: PassflowConfig = { url: 'https://auth.example.com', appId: 'app', scopes: ['openid'] };

// @ts-expect-error scopes is a string array
export const badConfig: PassflowConfig = { scopes: 'openid' };

export const createClient = (): Passflow => new Passflow(config);

export const sessionLabel = (session: PassflowUserSession): string =>
  `${session.device?.name ?? 'Unknown device'}${session.current ? ' (this device)' : ''}`;

// @ts-expect-error revoked is a number
export const badRevokeOthers: PassflowRevokeOtherSessionsResponse = { revoked: '2' };

export const useSessionCount = (): number => useSessions().data.length;
