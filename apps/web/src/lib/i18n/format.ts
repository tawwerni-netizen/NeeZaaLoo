/**
 * Typed re-export of `@nizalo/i18n`'s formatting helpers (see
 * packages/i18n/src/format.mjs) -- thin wrappers over the native `Intl`
 * APIs, never a hand-rolled date/number pattern. Every date, number,
 * currency or percentage shown to a player goes through one of these.
 */
import * as untyped from "../../../../../packages/i18n/src/format.mjs";
import type { SupportedLocale } from "./locale";

type FormatFn = (value: number, locale: SupportedLocale, options?: Intl.NumberFormatOptions) => string;
type DateFn = (date: Date | string | number, locale: SupportedLocale, options?: Intl.DateTimeFormatOptions) => string;
type CurrencyFn = (amount: number, locale: SupportedLocale, currency?: string) => string;
type RelativeFn = (value: number, unit: Intl.RelativeTimeFormatUnit, locale: SupportedLocale) => string;

export const formatNumber = untyped.formatNumber as FormatFn;
export const formatPercent = untyped.formatPercent as FormatFn;
export const formatDate = untyped.formatDate as DateFn;
export const formatCurrency = untyped.formatCurrency as CurrencyFn;
export const formatRelativeTime = untyped.formatRelativeTime as RelativeFn;
