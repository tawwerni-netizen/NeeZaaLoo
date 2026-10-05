import React, { type ElementType, type ReactNode, type ComponentPropsWithoutRef } from "react";
import styles from "./Typography.module.css";

type AsProp<C extends ElementType> = {
  as?: C;
};

type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProp<
  C extends ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

// 1. Display Component
export interface DisplayProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}

export function Display<C extends ElementType = "h1">({
  as,
  size = "md",
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, DisplayProps>) {
  const Component = as || "h1";
  const sizeClass =
    size === "lg" ? styles.displayLg : size === "sm" ? styles.displaySm : "";
  const combined = [styles.display, sizeClass, className].filter(Boolean).join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}

// 2. Heading Component
export interface HeadingProps {
  level?: 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

export function Heading<C extends ElementType = "h2">({
  as,
  level = 2,
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, HeadingProps>) {
  const defaultTag = (`h${level}` as ElementType) || "h2";
  const Component = as || defaultTag;
  const levelClass =
    level === 1
      ? styles.headingH1
      : level === 2
      ? styles.headingH2
      : level === 3
      ? styles.headingH3
      : styles.headingH4;
  const combined = [styles.heading, levelClass, className].filter(Boolean).join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}

// 3. Body Text Component
export interface BodyProps {
  size?: "sm" | "base" | "lg";
  className?: string;
  children: ReactNode;
}

export function Body<C extends ElementType = "p">({
  as,
  size = "base",
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, BodyProps>) {
  const Component = as || "p";
  const sizeClass =
    size === "sm" ? styles.bodySm : size === "lg" ? styles.bodyLg : "";
  const combined = [styles.body, sizeClass, className].filter(Boolean).join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}

// 4. Caption Component
export interface CaptionProps {
  muted?: boolean;
  className?: string;
  children: ReactNode;
}

export function Caption<C extends ElementType = "span">({
  as,
  muted = false,
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, CaptionProps>) {
  const Component = as || "span";
  const mutedClass = muted ? styles.captionMuted : "";
  const combined = [styles.caption, mutedClass, className].filter(Boolean).join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}

// 5. Numeric / Financial Component
export interface NumProps {
  variant?: "standard" | "credit" | "debit" | "locked";
  className?: string;
  children: ReactNode;
}

export function Num<C extends ElementType = "span">({
  as,
  variant = "standard",
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, NumProps>) {
  const Component = as || "span";
  const variantClass =
    variant === "credit"
      ? styles.financialCredit
      : variant === "debit"
      ? styles.financialDebit
      : variant === "locked"
      ? styles.financialLocked
      : styles.numeric;
  const combined = [variantClass, className].filter(Boolean).join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}

// 6. Game State Typography Component
export type GameStateVariant =
  | "turn-active"
  | "opponent-thinking"
  | "check"
  | "win"
  | "draw";

export interface GameStateTextProps {
  variant: GameStateVariant;
  className?: string;
  children: ReactNode;
}

export function GameStateText<C extends ElementType = "span">({
  as,
  variant,
  className,
  children,
  ...props
}: PolymorphicComponentProp<C, GameStateTextProps>) {
  const Component = as || "span";
  const variantClass =
    variant === "turn-active"
      ? styles.gameStateTurnActive
      : variant === "opponent-thinking"
      ? styles.gameStateOpponentThinking
      : variant === "check"
      ? styles.gameStateCheck
      : variant === "win"
      ? styles.gameStateWin
      : styles.gameStateDraw;
  const combined = [styles.gameState, variantClass, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Component className={combined} {...props}>
      {children}
    </Component>
  );
}
