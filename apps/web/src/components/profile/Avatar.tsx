/**
 * A player's avatar, with a graceful default: no uploaded avatar (or a
 * broken/unreachable one) shows the nickname's first letter on a plain
 * background instead of a broken-image icon or an empty box. Nothing
 * here knows or cares whether the URL came from local disk, an object
 * store, or a CDN (see packages/profile/src/avatar-storage.mjs).
 */
"use client";

import { useState } from "react";
import styles from "./Avatar.module.css";

type AvatarProps = {
  nickname: string;
  avatarUrl: string | null;
  size?: number;
};

export function Avatar({ nickname, avatarUrl, size = 64 }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  if (!avatarUrl || failed) {
    return (
      <div className={styles.placeholder} style={{ ...dimension, fontSize: size * 0.4 }} aria-hidden="true">
        {nickname.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- avatars are
    // arbitrary external/local URLs, not a build-time-known asset set.
    <img
      src={avatarUrl}
      alt=""
      className={styles.avatar}
      style={dimension}
      onError={() => setFailed(true)}
    />
  );
}
