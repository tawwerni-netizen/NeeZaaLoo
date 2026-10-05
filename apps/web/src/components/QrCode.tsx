"use client";

/**
 * A deposit QR, rendered here rather than fetched from anyone.
 *
 * Every deposit QR on this platform used to be an <img> pointed at a
 * third-party generator with the player's own deposit address in the query
 * string. That is two problems in one: every address a player is ever given
 * leaks to an outside service, and -- far worse on a payments screen -- the
 * picture a player actually scans comes from a host we do not control. A
 * QR is precisely the thing people scan without reading the characters
 * underneath, so whoever serves that image effectively chooses where the
 * money goes.
 *
 * So the code is drawn locally, in the browser, from the same address
 * string shown as text right next to it. No network call, nothing to
 * intercept, and the picture and the text can never disagree.
 */

import React, { useMemo } from "react";
import qrcode from "qrcode-generator";

type QrCodeProps = {
  value: string;
  size?: number | undefined;
  className?: string | undefined;
  /** Quiet-zone width in modules. The spec asks for 4; never go below it. */
  margin?: number | undefined;
  title?: string | undefined;
};

export function QrCode({ value, size = 160, className, margin = 4, title }: QrCodeProps) {
  const path = useMemo(() => {
    if (!value) return null;
    // Type 0 = pick the smallest version that fits; "M" = 15% error
    // correction, the usual choice for an address someone scans off a screen.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          parts.push(`M${col + margin} ${row + margin}h1v1h-1z`);
        }
      }
    }
    return { d: parts.join(""), extent: count + margin * 2 };
  }, [value, margin]);

  if (!path) return null;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${path.extent} ${path.extent}`}
      role="img"
      aria-label={title ?? "رمز الاستجابة السريعة لعنوان الإيداع"}
      shapeRendering="crispEdges"
    >
      <rect width={path.extent} height={path.extent} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}
