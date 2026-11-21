// A server component that renders the flow straight from the package.
import { PassflowFlow } from '@passflow/react';

export default function FlowPage() {
  return <PassflowFlow pathPrefix="" successAuthRedirect="/dashboard" />;
}
