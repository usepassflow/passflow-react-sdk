import { type FC, useEffect, useRef } from 'react';
import { LoginProgress } from '../login-screen/shared';
import { type AntiBotGetToken, type AntiBotVendor, mountVendorWidget, type VendorWidget } from './vendors';
import './anti-bot.css';

export const antiBotCheckingMessage = 'Checking your browser…';

export type AntiBotBuiltinCheckProps = {
  provider: 'builtin';
  /** True while core solves the built-in proof of work for a request. */
  solving: boolean;
};

export type AntiBotVendorCheckProps = {
  provider: AntiBotVendor;
  siteKey: string;
  /** Called with the widget's getToken once it is rendered, and with undefined when it goes away. */
  onReady: (getToken: AntiBotGetToken | undefined) => void;
};

export type AntiBotCheckProps = AntiBotBuiltinCheckProps | AntiBotVendorCheckProps;

const BuiltinCheck: FC<{ solving: boolean }> = ({ solving }) => {
  if (!solving) return null;
  return (
    <div className='passflow-anti-bot' data-anti-bot-provider='builtin'>
      <LoginProgress message={antiBotCheckingMessage} />
    </div>
  );
};

const VendorCheck: FC<AntiBotVendorCheckProps> = ({ provider, siteKey, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let widget: VendorWidget | undefined;

    mountVendorWidget(provider, siteKey, container).then(
      (mounted) => {
        if (cancelled) {
          mounted.remove();
          return;
        }
        widget = mounted;
        onReadyRef.current(mounted.getToken);
      },
      // A failed load or render leaves onReady uncalled; the next covered request then fails with the plain message.
      () => undefined,
    );

    return () => {
      cancelled = true;
      onReadyRef.current(undefined);
      widget?.remove();
    };
  }, [provider, siteKey]);

  return <div ref={containerRef} className='passflow-anti-bot' data-anti-bot-provider={provider} />;
};

/**
 * The human check a `human_only` app asks for. The built-in check shows a short
 * status while core solves; a vendor check owns the container its widget draws
 * into and hands its token source to the caller through `onReady`.
 */
export const AntiBotCheck: FC<AntiBotCheckProps> = (props) =>
  props.provider === 'builtin' ? (
    <BuiltinCheck solving={props.solving} />
  ) : (
    <VendorCheck provider={props.provider} siteKey={props.siteKey} onReady={props.onReady} />
  );
