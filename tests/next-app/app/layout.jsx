// A server component: it imports the provider straight from the package, with no 'use client' wrapper.
import { PassflowProvider } from '@passflow/react';
import '@passflow/react/dist/style.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PassflowProvider url="https://auth.example.test" appId="app_test">
          {children}
        </PassflowProvider>
      </body>
    </html>
  );
}
