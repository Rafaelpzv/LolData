"use client";

import * as React from "react";
import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { riseVariants, staggerVariants } from "@/lib/motion";

// A variant's own transition overrides the `transition` prop, so the delay has to live inside it.
const withDelay = (delay: number): Variants => {
  const visible = riseVariants.visible as { transition?: object };
  return { ...riseVariants, visible: { ...visible, transition: { ...visible.transition, delay } } };
};

type Tag = "div" | "section" | "ul" | "ol" | "li" | "article" | "header" | "tbody";

interface RevealProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  as?: Tag;
  /** Animate on mount instead of when scrolled into view. */
  immediate?: boolean;
  delay?: number;
}

/** Fades and rises its content in once, when it enters the viewport. */
export function Reveal({ as = "div", immediate, delay = 0, children, ...props }: RevealProps) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      initial="hidden"
      {...(immediate ? { animate: "visible" } : { whileInView: "visible", viewport: { once: true, amount: 0.15 } })}
      variants={delay ? withDelay(delay) : riseVariants}
      {...props}
    >
      {children}
    </Comp>
  );
}

interface StaggerProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  as?: Tag;
  /** Seconds between children. */
  stagger?: number;
  delay?: number;
  immediate?: boolean;
}

/** Container whose StaggerItem children cascade in. */
export function Stagger({ as = "div", stagger = 0.04, delay = 0, immediate, children, ...props }: StaggerProps) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      initial="hidden"
      {...(immediate ? { animate: "visible" } : { whileInView: "visible", viewport: { once: true, amount: 0.05 } })}
      variants={staggerVariants(stagger, delay)}
      {...props}
    >
      {children}
    </Comp>
  );
}

interface StaggerItemProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  as?: Tag | "tr";
}

export function StaggerItem({ as = "div", children, ...props }: StaggerItemProps) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp variants={riseVariants} {...props}>
      {children}
    </Comp>
  );
}
