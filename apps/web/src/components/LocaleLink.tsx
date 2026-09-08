"use client";

/**
 * `next/link`, prefixed with the current locale automatically. Every
 * internal navigation in the app should go through this instead of a bare
 * `<Link href="/play">` -- that one omission is exactly how a page quietly
 * drops out of its own locale, and there is no lint rule that catches it,
 * so the fix is to make the correct thing the only thing this component
 * lets you write.
 */
import Link from "next/link";
import type { ComponentProps } from "react";
import { useI18n } from "@/lib/i18n/context";

type LocaleLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function LocaleLink({ href, ...rest }: LocaleLinkProps) {
  const { locale } = useI18n();
  const localizedHref = href.startsWith("/") ? `/${locale}${href}` : href;
  return <Link href={localizedHref} {...rest} />;
}
