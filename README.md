# @passflow/react

This is a SDK for react application.

## Table of Contents

- [@passflow/react](#passflowreact)
  - [Table of Contents](#table-of-contents)
  - [Local Development](#local-development)
    - [Using Local Passflow JS SDK](#using-local-passflow-js-sdk)
  - [Test writing Environment Setup](#test-writing-environment-setup)
  - [UI Testing](#ui-testing)
    - [Writing your own ui tests.](#writing-your-own-ui-tests)
  - [Installation](#installation)
  - [Requirements](#requirements)
  - [Integration](#integration)
    - [Passflow Cloud](#passflow-cloud)
    - [PassflowFlow](#passflowflow)
    - [Login button](#login-button)
    - [Two-factor setup for a signed-in user](#two-factor-setup-for-a-signed-in-user)
    - [Step-up](#step-up)
    - [React Router](#react-router)
    - [Wouter](#wouter)
    - [TanStack Router](#tanstack-router)
  - [Props](#props)
    - [PassflowProvider](#passflowprovider)
  - [Form Components](#form-components)
    - [SignIn](#signin)
    - [SignUp](#signup)
    - [ForgotPassword](#forgotpassword)
    - [ForgotPasswordSuccess](#forgotpasswordsuccess)
    - [ResetPassword](#resetpassword)
    - [VerifyChallengeMagicLink](#verifychallengemagiclink)
    - [VerifyChallengeOTP](#verifychallengeotp)
    - [InvitationJoin](#invitationjoin)
  - [Hooks](#hooks)
    - [useAuth](#useauth)
    - [useUser](#useuser)
    - [usePassflow](#usepassflow)
    - [usePassflowStore](#usepassflowstore)
    - [useSignIn](#usesignin)
    - [useSignUp](#usesignup)
    - [useNavigation](#usenavigation)
    - [useProvider](#useprovider)
    - [useResetPassword](#useresetpassword)
    - [useUserPasskeys](#useuserpasskeys)
    - [useAppSettings](#useappsettings)
    - [useAuthCloudRedirect](#useauthcloudredirect)
    - [useForgotPassword](#useforgotpassword)
    - [useJoinInvite](#usejoininvite)
    - [useLogout](#uselogout)
    - [usePasswordlessComplete](#usepasswordlesscomplete)
    - [useSessionExpired](#usesessionexpired)
    - [useRefreshStatus](#userefreshstatus)

to install just type:

```
pnpm install
pnpm build
```

## Local Development

### Component development with Storybook

The visual source of truth lives in `src/components/ui` and is catalogued in Storybook.

```sh
pnpm storybook
```

Before reusing a new visual state in a flow, add it to the owning UI component and its co-located `*.stories.tsx` file. Verify the static catalog with:

```sh
pnpm build-storybook
```

Flows and form controllers should map domain state and callbacks into library components rather than creating or styling controls in place. See [`CLAUDE.md`](./CLAUDE.md) for the repository boundary.

### Using Local Passflow JS SDK

For local development and testing with a local version of the Passflow JS SDK, you need to:

1. Clone the Passflow JS SDK repository in a sibling directory to this project.
2. remove current dependecy `pnpm remove @passflow/core`
3. Link folder with:

```sh
pnpm link ../passflow-js-sdk
pnpm install
```

Now you can  run watch mode in libraray mode and change it. It will compile every changes incrementally.

```sh
pnpm watch
```

After all done, we need to unlink and return all to the original state

```sh
pnpm remove @passflow/core
pnpm unlink @passflow/core
pnpm install @passflow/core
```

## Test writing Environment Setup

For local development and UI testing, you need to set up the Passflow environment:

1. Set the `PASSFLOW_URL` environment variable to point to your Passflow instance.
1. Set the `PASSFLOW_APP_ID` environment variable
1. Run `pnpm dev` anmd all should works

Refer `.env.example` for more details.


we are using pnpm. Please ansure you have it in the system.

## UI Testing

All UI behavior and Storybook state tests use Playwright. Install Chromium once:

```sh
pnpm exec playwright install chromium
```

Run the complete UI suite headlessly:

```sh
pnpm test
```

Or launch Playwright's interactive test UI:

```sh
pnpm test:ui
```

Both scripts automatically start the demo app and Storybook. `pnpm test` uses the economical headless configuration, while `pnpm test:ui` retains traces and a final full-page screenshot for every successful test. Select a runnable leaf test in Playwright UI to inspect its action timeline, DOM snapshots, and screenshot attachment. Tests live in `playwright/tests`; component-state tests render the real Storybook stories rather than recreating components in a test-only harness. Vitest remains for non-visual hooks, controllers, and utility logic.

## Installation

```bash
pnpm add @passflow/react
```

No router is needed. `PassflowFlow` has its own small router, and works on its own or inside an app routed by React Router, TanStack Router, Wouter or anything else.

## Requirements

- React 18 or 19
- Node `^22.12.0 || ^24.0.0 || >=26.0.0`

## Integration

### Passflow Cloud

For a quick start with Passflow Cloud:

```tsx
const passflowConfig: PassflowConfig = {
  url: process.env.PASSFLOW_URL ?? 'http://localhost:5432',
  appId: process.env.PASSFLOW_APP_ID ?? 'test_app_id',
  createTenantForNewUser: true,
  scopes: ['openid', 'email', 'profile', 'offline'],
};

export const PassflowProviderWrapper: FC<PropsWithChildren> = ({
  children,
}) => {
  const navigate = useNavigate(); // from react-router

  return (
    <PassflowProvider
      url={passflowConfig.url}
      appId={passflowConfig.appId}
      createTenantForNewUser={passflowConfig.createTenantForNewUser}
      scopes={passflowConfig.scopes}
      navigate={(options) =>
        navigate(
          {
            pathname: options.to,
            search: options.search,
          },
          { replace: options.replace }
        )
      }
      router="react-router"
    >
      {children}
    </PassflowProvider>
  );
};

export const App = () => (
  <BrowserRouter>
    <PassflowProviderWrapper>
      <PassflowFlow
        federatedDisplayMode='redirect'
        successAuthRedirect='https://jwt.io'
        pathPrefix='/web'
      />
    </PassflowProviderWrapper>
  </BrowserRouter>
);
```

### Built-in OIDC RP integration

`<PassflowProvider>` is also a full OIDC relying-party SDK out of the
box. When a `parent_challenge_id` query parameter is present on the
host page's URL (typical of a Passflow OP redirect to the login UI),
the provider:

1. **Installs an interceptor** on `window.fetch` and
   `XMLHttpRequest.prototype.{open,send}` that injects
   `parent_challenge_id` on every outbound Passflow auth POST body
   and follows server-returned `{redirect_url}` JSON responses with
   `window.location.assign`. Covers `/auth/login`,
   `/auth/passwordless/*`, `/auth/passkey/*`, `/auth/2fa/*`,
   `/auth/federated/start`, and `/auth/session/exchange`.

2. **Runs an exchange-on-mount probe.** If the SDK has existing
   tokens AND the parent challenge allows it (`prompt=login` not
   set, `max_age` not exceeded), the provider POSTs
   `/auth/session/exchange` with the current access token and
   navigates the browser when the server returns a redirect URL.
   This satisfies OIDC Core §3.1.2.1 / §3.1.2.4 (`prompt=none`,
   `max_age`, `id_token_hint`) without re-prompting an
   already-authenticated user.

3. **Shows a status line during exchange.** While the exchange
   runs, the provider renders "Continuing to <app name>…" in place
   of its children, with the app name taken from the parent
   challenge, or "Continuing…" when the challenge has none.

4. **Falls through to the login form** when exchange is impossible,
   or when its `403 upgrade_required` can only be met by a fresh sign-in.
   The login form gets an explanatory banner (also themeable). A 403 the
   hosted session can meet opens the step-up dialog instead; after a
   successful step-up the hosted page tries the exchange once more, and a
   second refusal goes back to the app as `unmet_authentication_requirements`.

Consumer code remains a single line of plumbing — mount
`<PassflowProvider>`, render `<PassflowFlow>` inside, done. No
manual interceptor wiring required.

See the project's `docs/adr/0002-session-exchange-endpoint.md` for
the server contract and `docs/adr/0003-amr-acr-claims.md` for the
authentication-context claims those tokens carry.

### PassflowFlow

The whole sign-in experience on its own pages: sign-in, sign-up, one-time codes, magic links, password reset, invitations and two-factor. It needs no router and no setup:

```tsx
<PassflowProvider url="https://auth.example.com" appId="your-app-id">
  <PassflowFlow />
</PassflowProvider>
```

| Prop | Type | Description |
|------|------|-------------|
| successAuthRedirect | string | URL to redirect after successful authentication. A full URL must be in the app's redirect URLs. |
| federatedDisplayMode | "modal" \| "redirect" | Federated authentication display mode |
| pathPrefix | string | Where the flow lives, such as `/auth`. Optional: worked out from the first URL |
| routerType | "browser" \| "hash" \| "memory" | The history the flow keeps. Default `browser` |
| location, navigate | see below | Full control by the app's router. Optional, always together |

**Paths.** The flow's screens are `<prefix>/signin`, `<prefix>/signup`, `<prefix>/verify-challenge-otp`, `<prefix>/verify-challenge-magic-link`, `<prefix>/forgot-password`, `<prefix>/forgot-password/success`, `<prefix>/password/reset`, `<prefix>/invitation`, `<prefix>/two-factor-verify`, `<prefix>/two-factor-setup` and `<prefix>/two-factor-setup-magic-link/:token`. Without `pathPrefix` the flow takes the prefix from the first URL it sees: `/auth/signin` and `/auth` both give `/auth`, `/` gives none. A path under the prefix that names no screen goes to sign-in.

**Inside an app's router.** Mount the flow on a catch-all route; nothing else is needed. The flow moves the address bar and announces it with `popstate`, the event React Router, TanStack Router and Wouter listen to, so the app's router follows the flow and the flow follows the app, Back and Forward included:

```tsx
// TanStack Router
const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/$', component: () => <PassflowFlow /> });

// React Router
<Route path="/auth/*" element={<PassflowFlow />} />

// Wouter
<Route path="/auth" nest><PassflowFlow /></Route>
```

**`routerType`.** `browser` (default) uses the address bar. `hash` keeps the flow's path after `#`. `memory` leaves the URL alone, for an embedded widget or tests.

**Full control.** When the app's router does not use the address bar (it runs in hash or memory mode), hand the flow its location and a way to move it. `routerType` is then not used:

```tsx
// TanStack Router with a memory or hash history
function AuthPage() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  return (
    <PassflowFlow
      location={{ pathname: location.pathname, search: location.searchStr }}
      navigate={(to, { replace }) => {
        const href = `${to.pathname}${to.search}`;
        if (replace) router.history.replace(href);
        else router.history.push(href);
      }}
    />
  );
}
```

`TwoFactorSetupMagicLinkFlow` can also be mounted on its own page. It reads the token from the URL (the segment after `/two-factor-setup-magic-link/`), or takes it as a `token` prop.

### Login button

One button that signs in and out, inside `PassflowProvider`:

```tsx
import { LoginButton } from '@passflow/react';

<LoginButton />;
```

Signed out, it shows **Sign in** (`signInLabel`) and a click starts the hosted sign-in, `passflow.authRedirect(authRedirectOptions)`. Signed in, it shows the user's email (`signedInLabel={(user) => …}`) and a click signs out with `useAuth().logout()`, which also ends the hosted session after a hosted sign-in; `postLogoutRedirectUri` says where the browser lands. The button is disabled and `aria-busy` while the sign-out is in flight, and it switches on sign-in and sign-out events.

To use your own button, wrap it. Your element becomes the button: it keeps its props, content and look, and gets a click handler that calls its own `onClick` first, then signs in or out unless that called `event.preventDefault()`. No label is injected, so its text stays as you wrote it. For text that switches, pass a function:

```tsx
<LoginButton>
  <MyButton>Account</MyButton>
</LoginButton>

<LoginButton>{({ isSignedIn, label, user }) => <MyButton>{label}</MyButton>}</LoginButton>
```

In an app styled with shadcn/ui, `appearance="shadcn"` takes `--primary`, `--primary-foreground`, `--radius`, `--ring` and `--font-sans` from your theme, in either the HSL-triplet (`222.2 47.4% 11.2%`) or the complete-colour (`oklch(…)`, hex) format. A missing variable falls back to the Passflow style, and a missing `--font-sans` to the inherited font. The colours are read once, when the button mounts.

```tsx
<LoginButton appearance='shadcn' />
```

### Two-factor setup for a signed-in user

When the app's two-factor policy is **Optional**, sign-in does not ask the user to set up an authenticator. Let a signed-in user turn it on from your own page with one component:

```tsx
import '@passflow/react/dist/style.css';
import { TwoFactorSetupForm, useAuth } from '@passflow/react';

const Security = () => (useAuth().isSignedIn ? <TwoFactorSetupForm /> : null);
```

In the admin panel, on the app's two-factor settings, set the policy to **Optional** and turn **TOTP** on.

The form reads the user's two-factor status when it mounts. A user who has it on sees that it is on. Anyone else gets **Get Started**, then the QR code (with the key to type in by hand), then a field for the code from the authenticator app, then the recovery codes to save, and then the same "it is on" state. When the confirm answer carries no recovery codes, the codes screen is skipped.

### Step-up

When your own API answers `403 upgrade_required`, the provider can ask the signed-in user to verify again and then repeat the call. Name the API in `backend` and turn the fetch interceptor on:

```tsx
<PassflowProvider url={url} appId={appId} backend='https://api.example.com' upgrade={{ interceptFetch: true }}>
  <App />
</PassflowProvider>
```

The dialog offers the factors the server lists in `available_factors`, in its order, with the first one selected. When the step-up cannot go ahead, it ends in one of four ways:

| Outcome | What the user sees |
|---------|--------------------|
| Sign-in required (`sign_in_required: true`) | The dialog closes and the provider calls `upgrade.onSignInRequired`. The call is not repeated. |
| Unsatisfiable (no factor reaches the level) | "This account can't reach the security level this app asks for. Add a passkey on this device, or contact the app.", with **Close**. Nothing navigates. |
| Rate limited | "Too many attempts. Try again in 30 seconds.", with the wait in seconds, minutes, hours or days, rounded up ("15 minutes", "1 day"), or the server's own text when it names no wait. No new code is asked for. |
| Insufficient (verified, but the call was challenged again) | The levels reached and required, with **Sign in again**, which calls `upgrade.onSignInRequired`. |

`upgrade.onSignInRequired` is where those sign-ins go. By default it opens the app's own sign-in route when a `PassflowFlow` is mounted, and otherwise calls `passflow.authRedirect()`. Pass your own to send the user somewhere else:

```tsx
<PassflowProvider {...config} upgrade={{ interceptFetch: true, onSignInRequired: () => router.navigate('/login') }}>
```

The hosted login page never calls `onSignInRequired`. It shows the sign-in form for sign-in required and insufficient, and puts the unsatisfiable and rate-limited messages on the page in place of the form.

The sections below wire the app's router into the **standalone form components** (`SignIn`, `SignUp`, …) through `PassflowProvider`'s `navigate` and `router` props. `PassflowFlow` does not need them.

### React Router

Example of integration with React Router:
PS: The example uses the Declarative approach.

```tsx
import {
  PassflowProvider,
  SignIn,
  SignUp,
  ForgotPassword,
  ForgotPasswordSuccess,
} from "@passflow/react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router";

const passflowConfig = {
  url: import.meta.env.VITE_PASSFLOW_URL,
  appId: import.meta.env.VITE_PASSFLOW_APP_ID,
  createTenantForNewUser: true,
  scopes: ["id", "offline", "email", "profile", "openid", "management"],
};

const PassflowProviderWrapper = ({ children }) => {
  const navigate = useNavigate();

  return (
    <PassflowProvider
      url={passflowConfig.url}
      appId={passflowConfig.appId}
      createTenantForNewUser={passflowConfig.createTenantForNewUser}
      scopes={passflowConfig.scopes}
      navigate={(options) =>
        navigate(
          {
            pathname: options.to,
            search: options.search,
          },
          { replace: options.replace }
        )
      }
      router="react-router"
    >
      {children}
    </PassflowProvider>
  );
};

export const App = () => (
  <BrowserRouter>
    <PassflowProviderWrapper>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn successAuthRedirect="/" signUpPath="/signup" />} />
        <Route path="/signup" element={<SignUp successAuthRedirect="/" signInPath="/signin" />} />
        <Route 
          path="/forgot-password" 
          element={
            <ForgotPassword
              successResetRedirect="/"
              signInPath="/signin"
              forgotPasswordSuccessPath="/forgot-password/success"
            />
          } 
        />
        <Route path="/forgot-password/success" element={<ForgotPasswordSuccess />} />
        {/* Add other routes here */}
      </Routes>
    </PassflowProviderWrapper>
  </BrowserRouter>
);
```

### Wouter

Example of integration with Wouter:

```tsx
import {
  PassflowProvider,
  SignIn,
  SignUp,
  ForgotPassword,
  ForgotPasswordSuccess,
} from "@passflow/react";
import { Switch, Route, useLocation } from "wouter";

const passflowConfig = {
  url: import.meta.env.VITE_PASSFLOW_URL,
  appId: import.meta.env.VITE_PASSFLOW_APP_ID,
  createTenantForNewUser: true,
  scopes: ["id", "offline", "email", "profile", "openid", "management"],
};

const PassflowProviderWrapper = ({ children }) => {
  const [, navigate] = useLocation();

  return (
    <PassflowProvider
      url={passflowConfig.url}
      appId={passflowConfig.appId}
      createTenantForNewUser={passflowConfig.createTenantForNewUser}
      scopes={passflowConfig.scopes}
      navigate={(options) => {
        const searchParamWouter = options.search
          ? options.search.startsWith("?")
            ? options.search
            : `?${options.search}`
          : "";
        navigate(`${options.to}${searchParamWouter}`, {
          replace: options.replace,
        });
      }}
      router="wouter"
    >
      {children}
    </PassflowProvider>
  );
};

export const App = () => (
  <Switch>
    <PassflowProviderWrapper>
      <Route path="/" component={Home} />
      <Route path="/signin" component={SignInWrapper} />
      <Route path="/signup" component={SignUpWrapper} />
      <Route path="/forgot-password" component={ForgotPasswordWrapper} />
      <Route path="/forgot-password/success" component={ForgotPasswordSuccessWrapper} />
      {/* Add other routes here */}
    </PassflowProviderWrapper>
  </Switch>
);
```

### TanStack Router

Example of integration with TanStack Router:
PS: The example uses Code-Based Routing.

```tsx
// App.tsx
import { PassflowProviderWrapper, RouterProvider } from './providers';

export const App = () => (
  <PassflowProviderWrapper>
    <RouterProvider />
  </PassflowProviderWrapper>
);

// PassflowProviderWrapper.tsx
import { PassflowProvider } from '@passflow/react';

const passflowConfig = {
  url: import.meta.env.VITE_PASSFLOW_URL,
  appId: import.meta.env.VITE_PASSFLOW_APP_ID,
  createTenantForNewUser: true,
  scopes: ['id', 'offline', 'email', 'profile', 'openid', 'management'],
};

export const PassflowProviderWrapper = ({ children }) => (
  <PassflowProvider
    url={passflowConfig.url}
    appId={passflowConfig.appId}
    createTenantForNewUser={passflowConfig.createTenantForNewUser}
    scopes={passflowConfig.scopes}
    router="tanstack-router"
  >
    {children}
  </PassflowProvider>
);

// router/root.tsx
import { useNavigation } from '@passflow/react';
import { Outlet, useNavigate } from '@tanstack/react-router';

export const Root = () => {
  const navigate = useNavigate();
  const { setNavigate } = useNavigation();

  useEffect(() => {
    setNavigate((options) => navigate(options));
  }, [navigate, setNavigate]);

  return <Outlet />;
};

// router.tsx
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { queryClient } from '../query';
import { routerTree } from './routes';
import { Passflow } from '@passflow/react';

export interface RouterContext {
  queryClient: QueryClient;
  passflow?: Passflow;
}

export const router = createRouter({
  routeTree: routerTree,
  context: {
    queryClient,
    passflow: undefined,
  },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}


// routes.tsx
import { Outlet, createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';
import { RouterContext } from './router';
import { Root } from './root';
import { About, Home } from '@/pages';
import { ForgotPassword, ForgotPasswordSuccess, SignIn, SignUp } from '@passflow/react';
import { RootLayout } from '@/layouts';

const redirectToSignin = () => {
  throw redirect({
    to: '/signin',
  });
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: () => <div>404 Not Found</div>,
});

// PUBLIC ROUTES
const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'public',
  component: () => <Outlet />,
});

const signInRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/signin',
  component: () => <SignIn successAuthRedirect='/' signUpPath='/signup' />,
});

const signUpRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/signup',
  component: () => <SignUp successAuthRedirect='/' signInPath='/signin' />,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/forgot-password',
  component: () => (
    <ForgotPassword successResetRedirect='/' signInPath='/signin' forgotPasswordSuccessPath='/forgot-password/success' />
  ),
});

const forgotPasswordSuccessRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: '/forgot-password/success',
  component: () => <ForgotPasswordSuccess />,
});

{/* Add other PASSFLOW COMPONENTS routes here */}

// PROTECTED ROUTES
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: async ({ context }) => {
    const { passflow } = context;

    await passflow?.session({
      createSession: async (tokens) => {
        console.log(tokens); // if session is created, this function will be called with the tokens
      },
      expiredSession: async () => {
        console.log('expiredSession');
        redirectToSignin(); // if session is expired and refresh token is not valid, redirect to signin
      },
      doRefresh: true,
    });
  },
  component: () => <RootLayout />,
});

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: () => <Home />,
});

const aboutRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/about',
  component: () => <About />,
});

{/* Add other protected routes here */}

export const routerTree = rootRoute.addChildren([
  publicRoute.addChildren([signInRoute, signUpRoute, forgotPasswordRoute, forgotPasswordSuccessRoute]),
  protectedRoute.addChildren([dashboardRoute, aboutRoute]),
]);
```

## Props

### PassflowProvider

| Prop | Type | Description |
|------|------|-------------|
| url | string | Passflow server URL |
| appId | string | Application ID |
| createTenantForNewUser | boolean | Whether to create a tenant for new users |
| scopes | string[] | Array of required scopes |
| router | "default" \| "react-router" \| "wouter" \| "tanstack-router" | Router being used (optional) (default is native window navigation) |
| navigate | (options: NavigateOptions) => void | Navigation function (optional) (default is native window navigation) |

## Form Components

### SignIn

Component for user authentication.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successAuthRedirect | string | URL to redirect after successful sign in | Required |
| signUpPath | string | Path to sign up page (optional) | /signup |
| forgotPasswordPath | string | Path to forgot password page (optional) | /forgot-password |
| verifyMagicLinkPath | string | Path to verify magic link page (optional) | /verify-challenge-magic-link |
| verifyOTPPath | string | Path to verify OTP page (optional) | /verify-challenge-otp |
| federatedDisplayMode | "popup" \| "redirect" | Display mode for federated authentication (optional) | "popup" |

### SignUp

Component for user registration.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successAuthRedirect | string | URL to redirect after successful sign up | Required |
| signInPath | string | Path to sign in page (optional) | /signin |
| verifyMagicLinkPath | string | Path to verify magic link page (optional) | /verify-challenge-magic-link |
| verifyOTPPath | string | Path to verify OTP page (optional) | /verify-challenge-otp |
| federatedDisplayMode | "popup" \| "redirect" | Display mode for federated authentication (optional) | "popup" |

### ForgotPassword

Component for password recovery initiation.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successResetRedirect | string | URL to redirect after successful password reset | Required |
| signInPath | string | Path to sign in page (optional) | /signin |
| forgotPasswordSuccessPath | string | Path to success page after initiating password reset (optional) | /forgot-password/success |

### ForgotPasswordSuccess

Component for password recovery success. 

No props required.

### ResetPassword

Component for setting a new password.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successAuthRedirect | string | URL to redirect after successful password reset | Required |

### VerifyChallengeMagicLink

Component for verifying magic link authentication.

No props required.

### VerifyChallengeOTP

Component for OTP verification.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successAuthRedirect | string | URL to redirect after successful verification | Required |
| numInputs | number | Number of OTP input fields (optional) | 6 |
| shouldAutoFocus | boolean | Whether to autofocus the first input (optional) | true |
| signUpPath | string | Path to sign up page (optional) | /signup |

### InvitationJoin

Component for accepting invitations and joining organizations.

| Prop | Type | Description | Default |
|------|------|-------------|---------|
| successAuthRedirect | string | URL to redirect after successful join | Required |
| signInPath | string | Path to sign in page (optional) | /signin |

## Hooks

### useAuth
Hook for authentication management. Provides methods for checking authentication status, obtaining tokens, and logging out.

```typescript
const { isSignedIn, isAuthenticated, getTokens, logout, isLoading } = useAuth();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| isSignedIn | `boolean` | Whether a user is signed in. Updates after a sign-in or sign-up, after `logout()` or `useLogout().fetch()`, and when the session expires, so the component re-renders with the new value |
| isAuthenticated | `() => boolean` | Checks the session at the moment you call it |
| isSessionExpired | `boolean` | `true` after the session has ended on its own, until the next sign-in |
| getTokens | `(doRefresh: boolean) => Promise<{ tokens: Tokens \| undefined; parsedTokens: ParsedTokens \| undefined; }>` | Function to get authentication tokens |
| logout | `(options?: LogOutOptions) => Promise<void>` | Signs the user out; resolves once the sign-out finishes. See [Signing out after a hosted sign-in](#signing-out-after-a-hosted-sign-in) |
| isLoading | `boolean` | Loading state indicator |

Render on `isSignedIn`:

```tsx
const AccountMenu = () => {
  const { isSignedIn, logout } = useAuth();
  if (!isSignedIn) return <a href='/web/signin'>Sign in</a>;
  return <button onClick={() => void logout()}>Sign out</button>;
};
```

#### Signing out after a hosted sign-in

When the user signed in through the hosted login (`authRedirect()`), `logout()` also ends the hosted login's own session: once the app is signed out, the browser leaves the page for the hosted login's sign-out and comes back to `postLogoutRedirectUri`. Code after `await logout()` may then not run, so don't put anything you need after it. A sign-in made in the app itself (`PassflowFlow`) never leaves the page.

```tsx
const { logout } = useAuth();

// Must match one of the app's registered redirect URLs. Default: the address the hosted sign-in landed on.
await logout({ postLogoutRedirectUri: 'https://app.example.com/signed-out' });
```

`useLogout().fetch` takes the same options. `LogOutOptions` is exported from `@passflow/react`.

### useUser
Hook for the signed-in user's id, email and phone, read from the tokens. It re-renders on sign-in, sign-up, token refresh, sign-out and session expiry.

```typescript
const { id, email, phone } = useUser();
```

The claim is read from the id token first and from the access token when the id token lacks it. A hosted sign-in (`authRedirect()`) puts `email` in the access token and the embedded screens put it in the id token, so `email` is filled either way.

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| id | `string \| undefined` | The user id (`sub`) |
| email | `string \| undefined` | The user's email |
| phone | `string \| undefined` | The user's phone number |

Every field is `undefined` when no one is signed in.

```tsx
const AccountMenu = () => {
  const { isSignedIn, logout } = useAuth();
  const { email } = useUser();
  if (!isSignedIn) return null;
  return <button onClick={() => void logout()}>Sign out {email}</button>;
};
```

### usePassflow
Hook for accessing the Passflow SDK instance. Must be used within PassflowProvider.

```typescript
const passflow = usePassflow();
```

**Returns:**

| Type | Description |
|------|-------------|
| `Passflow` | Passflow SDK instance |

### usePassflowStore
Hook for synchronizing state with Passflow SDK. Allows subscribing to token changes.

```typescript
const tokens = usePassflowStore([PassflowEvent.SignIn, ...]);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| events | `PassflowEvent[]` (optional) | Events to subscribe to |

**Returns:**

| Type | Description |
|------|-------------|
| `Tokens \| undefined` | Current tokens state |

### useSignIn
Hook for implementing sign-in functionality. Supports password, passkey, and passwordless authentication.

```typescript
const { fetch, isLoading, isError, error } = useSignIn();

const outcome = await fetch({ email, password }, 'password');
if (outcome === 'two-factor-required') navigate('/2fa');
else if (outcome === 'signed-in') navigate('/');
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| onPasswordChangeRequired | `(notice: string) => void` (optional) | Called when the server refuses the sign-in until the user changes their password. `fetch` resolves `false` and `error` stays empty; send the user to your password reset. `notice` is the server's message for the user. Without this option, that message becomes the form `error`. |

```typescript
const { fetch } = useSignIn({
  onPasswordChangeRequired: () => navigate('/forgot-password?default_method=email_or_username&reason=password_change_required'),
});
```

The bundled `SignIn` form does this for you: it opens `ForgotPassword` with the identifier filled in and a fixed notice. `ForgotPassword` shows that notice only for `reason=password_change_required` and never displays text from the URL.

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(payload: PassflowPasskeyAuthenticateStartPayload \| PassflowSignInPayload \| PassflowPasswordlessSignInPayload, type: 'passkey' \| 'password' \| 'passwordless') => Promise<false \| SignInOutcome \| PassflowPasswordlessResponse>` | Sign in function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

`fetch` resolves one of:

| Value | Meaning |
|-------|---------|
| `'signed-in'` | A password or passkey sign-in finished; the session is ready. |
| `'two-factor-required'` | The credentials were accepted but a second factor is still owed. There is no session yet; send the user to your 2FA screen. |
| `PassflowPasswordlessResponse` | The server's answer to a passwordless request. |
| `false` | The request failed (see `error`), was superseded, entered the emailed-code step, or was handed to `onPasswordChangeRequired`. |

Both outcome strings are truthy, so `if (await fetch(...))` also passes for `'two-factor-required'`, when there is no session yet. Check for `'two-factor-required'` before treating the user as signed in. Code that compared the result with `=== true` must check the outcome instead.

### useSignUp
Hook for implementing registration functionality. Supports password, passkey, and passwordless registration.

```typescript
const { fetch, isLoading, isError, error } = useSignUp();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(payload: PassflowPasskeyRegisterStartPayload \| PassflowSignUpPayload \| PassflowPasswordlessSignInPayload, type: 'passkey' \| 'password' \| 'passwordless') => Promise<false \| SignInOutcome \| PassflowPasswordlessResponse>` | Sign up function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

`fetch` resolves the same outcomes as `useSignIn().fetch`.

### useNavigation
Hook for navigation between pages. Supports various routers (react-router, wouter, tanstack-router).

```typescript
const { navigate, setNavigate } = useNavigation();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| navigate | `NavigateFunction` | Navigation function |
| setNavigate | `(newNavigate: NavigateFunction \| null) => void` | Function to update navigation handler |

### useProvider
Hook for working with federated authentication providers (OAuth).

```typescript
const { federatedWithPopup, federatedWithRedirect } = useProvider(redirectUrl);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| redirectUrl | `string` | URL to redirect after authentication |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| federatedWithPopup | `(provider: Providers) => void` | Popup authentication function |
| federatedWithRedirect | `(provider: Providers) => void` | Redirect authentication function |

### useResetPassword
Hook for resetting user password.

```typescript
const { fetch, isLoading, isError, error } = useResetPassword();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(newPassword: string) => Promise<boolean>` | Password reset function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### useUserPasskeys
Hook for managing user passkeys (create, edit, delete).

```typescript
const { data, createUserPasskey, editUserPasskey, deleteUserPasskey } = useUserPasskeys();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| data | `PassflowUserPasskey[]` | List of user passkeys |
| createUserPasskey | `(relyingPartyId: string) => Promise<void>` | Create passkey function |
| editUserPasskey | `(newName: string, passkeyId: string) => Promise<void>` | Edit passkey function |
| deleteUserPasskey | `(passkeyId: string) => Promise<void>` | Delete passkey function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| errorMessage | `string` | Error message |

### useAppSettings
Hook for retrieving application settings and password policies.

```typescript
const { appSettings, passwordPolicy } = useAppSettings();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| appSettings | `AppSettings \| null` | Application settings |
| passwordPolicy | `PassflowPasswordPolicySettings \| null` | Password policy settings |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### useAuthCloudRedirect
Hook for redirecting to Passflow Cloud.

```typescript
const redirect = useAuthCloudRedirect(cloudPassflowUrl);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| cloudPassflowUrl | `string` | Passflow Cloud URL |

**Returns:**

| Type | Description |
|------|-------------|
| `() => void` | Redirect function |

### useForgotPassword
Hook for initiating the password recovery process.

```typescript
const { fetch, isLoading, isError, error } = useForgotPassword();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(payload: PassflowSendPasswordResetEmailPayload) => Promise<boolean>` | Password recovery function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### useJoinInvite
Hook for accepting organization invitations.

```typescript
const { fetch, isLoading, isError, error } = useJoinInvite();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(token: string) => Promise<boolean>` | Join invitation function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### useLogout
Hook for logging out of the system.

```typescript
const { fetch, isLoading, isError, error } = useLogout();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(options?: LogOutOptions) => Promise<boolean>` | Signs the user out, with the same `postLogoutRedirectUri` option as `useAuth().logout`. After a hosted sign-in the page may leave before it resolves |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### usePasswordlessComplete
Hook for completing passwordless authentication.

```typescript
const { fetch, isLoading, isError, error } = usePasswordlessComplete();
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| fetch | `(payload: PassflowPasswordlessSignInCompletePayload) => Promise<PassflowValidationResponse \| null>` | Complete passwordless auth function |
| isLoading | `boolean` | Loading state |
| isError | `boolean` | Error state |
| error | `string` | Error message |

### useSessionExpired
Hook for reacting to the end of a session, for example to redirect to your login page.

```typescript
const { isSessionExpired, expiredReason, resetSessionExpired } = useSessionExpired({
  onSessionExpired: (reason) => navigate('/signin'),
});
```

`SessionExpired` fires only when the session has really ended: the last auth strike (`'refresh_failed'`), no successor token pair in time (`'successor_timeout'`), or another user's tokens in storage (`'identity_changed'`). A transient refresh failure (network error, 5xx) keeps the session and shows up as `RefreshFailing` / `RefreshRecovered` instead; use [useRefreshStatus](#userefreshstatus) for that. The state resets on `SignIn` and `Register`.

| Parameter | Type | Description |
|-----------|------|-------------|
| onSessionExpired | `(reason: SessionExpiredReason) => void` (optional) | Called when the session ends |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| isSessionExpired | `boolean` | True once the session has ended |
| expiredReason | `SessionExpiredReason \| null` | Why it ended (`SessionExpiredReason` is exported from `@passflow/core`) |
| resetSessionExpired | `() => void` | Clears the expired state |

### useRefreshStatus
Hook for showing a "connection trouble" notice while token refresh is failing transiently. The session is kept during the episode; show the notice on `RefreshFailing` and hide it on `RefreshRecovered`.

```typescript
const { isFailing, since, nextRetryAt } = useRefreshStatus();
```

Set by `RefreshFailing`. Cleared by `RefreshRecovered`, `SessionExpired`, `SignOut`, `SignIn` and `Register`. The episode is known only from events, so a component that mounts after `RefreshFailing` starts idle: call the hook in a component that lives as long as the app, near `PassflowProvider`.

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| isFailing | `boolean` | True inside a transient-failure episode |
| since | `number \| null` | Epoch ms of the episode's first failure |
| nextRetryAt | `number \| null` | Epoch ms of the pending retry, when known |
