import { startHostedSignIn } from '@/utils/hosted-sign-in';
import { usePassflow } from './use-passflow';

type UseAuthCloudRedirectProps = (cloudPassflowUrl: string) => () => void;

export const useAuthCloudRedirect: UseAuthCloudRedirectProps = (cloudPassflowUrl: string) => {
  const passflow = usePassflow();

  // A failed redirect is reported by core's `Error` event (operation `auth-redirect`); the page stays where it is.
  const redirect = () => {
    startHostedSignIn(passflow, { url: cloudPassflowUrl }).catch(() => {});
  };

  return redirect;
};
