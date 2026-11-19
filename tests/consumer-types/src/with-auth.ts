// The instance usePassflow() returns must be the same @passflow/core the app installs, so the token-attaching
// fetch with an origin allow-list is typed. With a second, older core under @passflow/react, the
// options argument does not exist and this file fails to compile.
import { type Passflow, usePassflow, type WithAuthOptions } from '@passflow/react';

type IsAny<T> = 0 extends 1 & T ? true : false;
type ExpectFalse<T extends false> = T;

export type Canaries = [ExpectFalse<IsAny<WithAuthOptions>>, ExpectFalse<IsAny<ReturnType<typeof usePassflow>>>];

const options: WithAuthOptions = { origins: ['https://api.example.com'] };

export const useApiFetch = () => {
  const passflow: Passflow = usePassflow();
  return passflow.withAuth(fetch, options);
};

export const useApiFetchInline = () => usePassflow().withAuth(fetch, { origins: ['https://api.example.com'] });
