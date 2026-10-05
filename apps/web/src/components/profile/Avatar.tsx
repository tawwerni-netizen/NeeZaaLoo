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
  rating?: number | null;
};

export function Avatar({ nickname, avatarUrl, size = 64, rating }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  
  let tier = '';
  if (rating != null) {
    if (rating >= 2200) tier = 'diamond';
    else if (rating >= 1800) tier = 'gold';
    else if (rating >= 1300) tier = 'silver';
  }

  const borderClass = tier ? styles[`border-${tier}`] : '';

  const content = (!avatarUrl || failed) ? (
    <div className={styles.placeholder} style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {nickname.charAt(0).toUpperCase()}
    </div>
  ) : (
    <img
      src={avatarUrl}
      alt=""
      className={styles.avatar}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );

  return (
    <div className={styles.avatarWrapper} style={{ width: size, height: size }}>
      {tier && <div className={`${styles.animatedBorder} ${borderClass}`} />}
      <div className={styles.avatarInner}>
        {content}
      </div>
    </div>
  );

}
