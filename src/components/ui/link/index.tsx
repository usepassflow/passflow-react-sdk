/* eslint-disable react/jsx-props-no-spreading */
import type { FC, MouseEvent, PropsWithChildren } from 'react';
import { useNavigation } from '@/hooks';
import { cn } from '@/utils';
import '@/styles/index.css';

type LinkProps = PropsWithChildren<{
  to: string;
  search?: string;
  replace?: boolean;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** The link looks disabled, has no address and does nothing when pressed. */
  disabled?: boolean;
}>;

export const Link: FC<LinkProps> = ({
  to,
  search,
  replace = false,
  children,
  className,
  onClick,
  disabled = false,
  ...props
}) => {
  const { navigate } = useNavigation();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (onClick) {
      onClick(e);
    }

    navigate({ to, search, replace });
  };

  const getHref = (): string => {
    const searchParam = search ? (search.startsWith('?') ? search : `?${search}`) : '';
    return `${to}${searchParam}`;
  };

  if (disabled) {
    return (
      <a role='link' aria-disabled='true' className={cn(className, 'passflow-link--disabled')} {...props}>
        {children}
      </a>
    );
  }

  return (
    <a href={getHref()} onClick={handleClick} className={className} {...props}>
      {children}
    </a>
  );
};
