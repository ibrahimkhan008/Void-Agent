import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Marketing-only subset of apps/web's lib/utils: the public components only
 * use `cn`. Keep the implementation identical to the app's so class strings
 * resolve the same on both sides of the domain split.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
