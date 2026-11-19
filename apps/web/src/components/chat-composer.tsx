"use client";

/**
 * ChatComposer — a 1:1 rebuild of the affectUI "classic" chat composer design,
 * reverse-engineered from the live public preview (2026-11-19) with original
 * code. All extracted values are applied literally: container-query sizing
 * (max 680px), tray/card layering, the approval hand→shield morph, the
 * shimmering request label, corner-morphing menus with the gliding hover fill,
 * the dictation recording flow, and the full keyboard/a11y contract from the
 * component's public documentation.
 *
 * Colors: Inter stack; light theme by default, dark when `.dark` is an
 * ancestor (or via the `theme` prop).
 */

import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Folder,
  Mic,
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ChatComposerModel {
  id: string;
  name: string;
  description?: string;
}

export interface ChatComposerApp {
  id: string;
  name: string;
  /** Optional brand mark rendered inside the apps menu and the foot row. */
  logo?: React.ReactNode;
}

export interface ChatComposerProps {
  placeholder?: string;
  models?: ChatComposerModel[];
  /** Duration of the "Request approval" loading state (ms). */
  loadMs?: number;
  /** Demo transcript revealed word by word while recording. */
  dictation?: string;
  onSend?: (message: string, details: { model: ChatComposerModel }) => void;
  onModelChange?: (model: ChatComposerModel) => void;
  onAttach?: () => void;
  onRequestApproval?: () => void;
  folders?: string[];
  folder?: string;
  onFolderChange?: (folder: string | null) => void;
  apps?: ChatComposerApp[];
  connectedApps?: string[];
  onAppsChange?: (connected: string[]) => void;
  /** "auto" follows the closest `.dark` ancestor; defaults to auto. */
  theme?: "light" | "dark" | "auto";
  className?: string;
  autoFocus?: boolean;
}

const DEFAULT_MODELS: ChatComposerModel[] = [
  {
    id: "auto",
    name: "Auto",
    description: "Picks the best model for each task",
  },
  { id: "claude", name: "Claude", description: "Thoughtful writing and code" },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "Quick answers for everyday tasks",
  },
];

const DEFAULT_FOLDERS = ["Documents", "Projects", "Scratch"];

/** Brand marks for the default apps (integration logos shown in the foot row + apps menu). */
function GmailMark() {
  return (
    <svg viewBox="0 0 56.4108 44.8722" fill="none" aria-hidden="true">
      <path
        d="M44.2255 5.76727H56.4051V41.0239C56.4051 43.148 54.683 44.8701 52.5589 44.8701H46.1486C45.8961 44.8701 45.646 44.8204 45.4127 44.7237C45.1794 44.6271 44.9674 44.4854 44.7888 44.3069C44.6102 44.1283 44.4686 43.9163 44.3719 43.683C44.2753 43.4497 44.2255 43.1996 44.2255 42.947V5.76727Z"
        fill="url(#vc-gmail-a)"
      />
      <path
        d="M12.1796 5.76727H0V41.0239C0 43.148 1.72213 44.8701 3.84618 44.8701H10.2565C10.509 44.8701 10.7591 44.8204 10.9924 44.7237C11.2257 44.6271 11.4377 44.4854 11.6163 44.3069C11.7949 44.1283 11.9365 43.9163 12.0332 43.683C12.1298 43.4497 12.1796 43.1996 12.1796 42.947V5.76727Z"
        fill="#FC413D"
      />
      <path
        d="M10.0085 1.42778C7.43377 -0.736342 3.5924 -0.403647 1.42828 2.17105C-0.735843 4.74543 -0.403148 8.58681 2.17155 10.7512L26.5557 31.2479C27.0178 31.6362 27.602 31.8492 28.2056 31.8492C28.8091 31.8492 29.3934 31.6362 29.8554 31.2479L54.2396 10.7509C56.814 8.58681 57.1467 4.74543 54.9825 2.17073C52.8184 -0.403648 48.977 -0.736342 46.4027 1.42778L28.2054 16.724L10.0085 1.42778Z"
        fill="url(#vc-gmail-b)"
      />
      <defs>
        <linearGradient
          id="vc-gmail-a"
          x1="50.3153"
          y1="5.76727"
          x2="50.3153"
          y2="44.8701"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#60D673" />
          <stop offset="0.17" stopColor="#42C868" />
          <stop offset="0.39" stopColor="#0EBC5F" />
          <stop offset="0.62" stopColor="#00A9BB" />
          <stop offset="0.86" stopColor="#3C90FF" />
          <stop offset="1" stopColor="#3186FF" />
        </linearGradient>
        <linearGradient
          id="vc-gmail-b"
          x1="6.04194e-05"
          y1="6.45153"
          x2="56.4107"
          y2="6.45153"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.08" stopColor="#FF63A0" />
          <stop offset="0.3" stopColor="#FC413D" />
          <stop offset="0.5" stopColor="#FC413D" />
          <stop offset="0.65" stopColor="#FC413D" />
          <stop offset="0.72" stopColor="#FC5C30" />
          <stop offset="0.86" stopColor="#FEB10C" />
          <stop offset="0.91" stopColor="#FEC700" />
          <stop offset="0.96" stopColor="#FFDB0F" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SlackMark() {
  return (
    <svg viewBox="0 0 49.883 49.877" fill="none" aria-hidden="true">
      <g transform="translate(0 0)">
        <path
          d="M18.3549 10.4784C15.4713 10.4784 13.1157 8.12279 13.1157 5.2392C13.1157 2.35561 15.4713 0 18.3549 0C21.2385 0 23.5941 2.35561 23.5941 5.2392V10.4784H18.3549Z"
          fill="#36C5F0"
        />
        <path
          d="M18.3575 13.12C21.2411 13.12 23.5967 15.4756 23.5967 18.3592C23.5967 21.2428 21.2411 23.5984 18.3575 23.5984H5.2392C2.35561 23.5984 0 21.2428 0 18.3592C0 15.4756 2.35561 13.12 5.2392 13.12H18.3575Z"
          fill="#36C5F0"
        />
      </g>
      <g transform="translate(26.28 0)">
        <path
          d="M13.1244 18.3592C13.1244 15.4756 15.48 13.12 18.3636 13.12C21.2472 13.12 23.6028 15.4756 23.6028 18.3592C23.6028 21.2428 21.2472 23.5984 18.3636 23.5984H13.1244V18.3592Z"
          fill="#2EB67D"
        />
        <path
          d="M10.4785 18.3575C10.4785 21.2411 8.12286 23.5967 5.23927 23.5967C2.35568 23.5967 7.4362e-05 21.2411 7.4362e-05 18.3575V5.2392C7.4362e-05 2.35561 2.35568 0 5.23927 0C8.12286 0 10.4785 2.35561 10.4785 5.2392V18.3575Z"
          fill="#2EB67D"
        />
      </g>
      <g transform="translate(0 26.28)">
        <path
          d="M10.4784 5.2392C10.4784 8.12279 8.12279 10.4784 5.2392 10.4784C2.35561 10.4784 0 8.12279 0 5.2392C0 2.35561 2.35561 0 5.2392 0H10.4784V5.2392Z"
          fill="#E01E5A"
        />
        <path
          d="M13.1157 5.2392C13.1157 2.35561 15.4713 0 18.3549 0C21.2385 0 23.5941 2.35561 23.5941 5.2392V18.3575C23.5941 21.2411 21.2385 23.5967 18.3549 23.5967C15.4713 23.5967 13.1157 21.2411 13.1157 18.3575V5.2392Z"
          fill="#E01E5A"
        />
      </g>
      <g transform="translate(26.28 26.28)">
        <path
          d="M5.23927 13.1157C8.12286 13.1157 10.4785 15.4713 10.4785 18.3549C10.4785 21.2385 8.12286 23.5941 5.23927 23.5941C2.35568 23.5941 7.4362e-05 21.2385 7.4362e-05 18.3549V13.1157H5.23927Z"
          fill="#ECB22E"
        />
        <path
          d="M5.23927 10.4784C2.35568 10.4784 7.4362e-05 8.12279 7.4362e-05 5.2392C7.4362e-05 2.35561 2.35568 0 5.23927 0H18.3576C21.2412 0 23.5968 2.35561 23.5968 5.2392C23.5968 8.12279 21.2412 10.4784 18.3576 10.4784H5.23927Z"
          fill="#ECB22E"
        />
      </g>
    </svg>
  );
}

function ClickUpMark() {
  return (
    <svg viewBox="0 0 49.7096 59.6884" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 45.9002L9.1618 38.8247C14.0602 45.1745 19.2307 48.1679 24.9455 48.1679C30.6603 48.1679 35.7401 45.2652 40.3663 38.9154L49.7096 45.8094C42.997 54.8805 34.6516 59.6882 24.9455 59.6882C15.3301 59.6882 6.89403 54.8805 0 45.9002Z"
        fill="url(#vc-clickup-a)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24.9535 15.3301L8.62558 29.3903L1.09657 20.5914L25.0442 0L48.8105 20.5914L41.1908 29.2996L24.9535 15.3301Z"
        fill="url(#vc-clickup-b)"
      />
      <defs>
        <linearGradient
          id="vc-clickup-a"
          x1="0"
          y1="49.2666"
          x2="49.75"
          y2="49.2666"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8930FD" />
          <stop offset="1" stopColor="#49CCF9" />
        </linearGradient>
        <linearGradient
          id="vc-clickup-b"
          x1="1.09231"
          y1="14.6901"
          x2="48.7603"
          y2="14.6901"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF02F0" />
          <stop offset="1" stopColor="#FFC800" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const DEFAULT_APPS: ChatComposerApp[] = [
  { id: "gmail", name: "Gmail", logo: <GmailMark /> },
  { id: "slack", name: "Slack", logo: <SlackMark /> },
  { id: "clickup", name: "ClickUp", logo: <ClickUpMark /> },
];

const DEFAULT_CONNECTED = ["gmail"];
const DEFAULT_DICTATION = "Draft a short update…";
const DEFAULT_PLACEHOLDER = "Start by typing...";
const MAX_WIDTH_PX = 680;

type MenuId = "model" | "folder" | "apps";
type ApprovalState = "idle" | "loading" | "granted";

/** Palette + sizing (container-query units; 100cqw = composer width, capped at 680px). */
const THEME_VARS = {
  light: {
    "--ct-tray-bg": "#F4F4F5",
    "--ct-card-bg": "#FFFFFF",
    "--ct-card-border": "rgba(0,0,0,0.08)",
    "--ct-card-shadow": "0 1px 2px rgba(0,0,0,0.06)",
    "--ct-text": "#121212",
    "--ct-muted": "#8F8F8F",
    "--ct-send-bg": "#121212",
    "--ct-send-icon": "#EDEDED",
    "--ct-menu-bg": "#FFFFFF",
    "--ct-menu-shadow":
      "0 8px 30px -8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
    "--ct-hover-fill": "rgba(0,0,0,0.05)",
    "--ct-wash": "rgba(242,161,92,0.16)",
    "--ct-granted": "#C77A3D",
    "--ct-sq-bg": "#FFFFFF",
    "--ct-sq-border": "rgba(0,0,0,0.08)",
  },
  dark: {
    "--ct-tray-bg": "#161618",
    "--ct-card-bg": "#262629",
    "--ct-card-border": "rgba(255,255,255,0.08)",
    "--ct-card-shadow": "0 0.83px 1.67px rgba(0,0,0,0.4)",
    "--ct-text": "#EDEDED",
    "--ct-muted": "#8F8F8F",
    "--ct-send-bg": "#EDEDED",
    "--ct-send-icon": "#121212",
    "--ct-menu-bg": "#262629",
    "--ct-menu-shadow":
      "0 12px 40px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
    "--ct-hover-fill": "rgba(255,255,255,0.07)",
    "--ct-wash": "rgba(242,161,92,0.16)",
    "--ct-granted": "#F2A15C",
    "--ct-sq-bg": "#262629",
    "--ct-sq-border": "rgba(255,255,255,0.08)",
  },
};

/** Extracted cqw metrics (at the 680px cap: tray r=25, card r=17.8, send 30.2, msg 19.8px). */
const SIZES = {
  trayRadius: "3.683cqw",
  cardRadius: "2.62cqw",
  cardPadX: "2.94cqw",
  cardPadTop: "1.76cqw",
  cardPadBottom: "2.2cqw",
  msgFs: "2.914cqw",
  msgLh: "4.226cqw",
  icon: "2.7cqw",
  send: "4.44cqw",
  sendRadius: "1.27cqw",
  footPadY: "2.35cqw",
  gapToolbar: "1.853cqw",
  gapToolbarEnd: "1.588cqw",
  labelFs: "1.912cqw",
  menuPad: "0.794cqw",
  menuRadius: "3.683cqw",
};

const VC_STYLES = `
.vc-root { container-type: inline-size; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.vc-root button { cursor: pointer; }
.vc-tray { background: var(--ct-tray-bg); border-radius: ${SIZES.trayRadius}; }
.vc-card { background: var(--ct-card-bg); border: 1px solid var(--ct-card-border); border-radius: ${SIZES.cardRadius}; box-shadow: var(--ct-card-shadow); padding: ${SIZES.cardPadTop} ${SIZES.cardPadX} ${SIZES.cardPadBottom}; }
.vc-message { background: transparent; border: 0; outline: none; resize: none; width: 100%; display: block; color: var(--ct-text); font-size: ${SIZES.msgFs}; line-height: ${SIZES.msgLh}; overflow-y: auto; max-height: calc(${SIZES.msgLh} * 6); }
.vc-message::placeholder { color: var(--ct-muted); }
.vc-toolbar { display: flex; align-items: center; gap: ${SIZES.gapToolbar}; margin-top: ${SIZES.cardPadTop}; }
.vc-toolbar--end { position: relative; margin-left: auto; gap: ${SIZES.gapToolbarEnd}; }
.vc-icon-btn { display: grid; place-items: center; width: ${SIZES.icon}; height: ${SIZES.icon}; border-radius: 0.956cqw; color: var(--ct-muted); transition: color 0.15s, background-color 0.15s; }
.vc-icon-btn:hover { color: var(--ct-text); background: var(--ct-hover-fill); }
.vc-label { font-size: ${SIZES.labelFs}; line-height: 1.4; color: var(--ct-muted); }
.vc-foot { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 1.906cqw; padding: ${SIZES.footPadY} ${SIZES.cardPadX}; }
.vc-row { display: inline-flex; align-items: center; gap: 0.735cqw; font-size: ${SIZES.labelFs}; color: var(--ct-muted); border-radius: 0.956cqw; transition: color 0.15s, background-color 0.15s; padding: 0.29cqw 0.59cqw; margin: -0.29cqw -0.59cqw; }
.vc-row:hover { color: var(--ct-text); background: var(--ct-hover-fill); }
.vc-icon { display: grid; place-items: center; width: ${SIZES.icon}; height: ${SIZES.icon}; }
.vc-logos { display: inline-flex; align-items: center; gap: 0.44cqw; }
.vc-logo { display: grid; place-items: center; width: ${SIZES.icon}; height: ${SIZES.icon}; font-size: calc(${SIZES.icon} * 0.52); font-weight: 600; border-radius: 0.66cqw; color: #fff; transition: opacity 0.15s; }
.vc-logo > svg { width: 100%; height: 100%; display: block; }
.vc-approval { display: flex; align-items: center; gap: 0.865cqw; border-radius: 0.956cqw; position: relative; }
.vc-wash { position: absolute; inset: -0.66cqw -1.03cqw; border-radius: 1.32cqw; background: var(--ct-wash); opacity: 0; transition: opacity 0.2s ease-out; pointer-events: none; }
.vc-approval[data-approval="granted"] .vc-wash { opacity: 1; }
.vc-approval[data-approval="granted"] { color: var(--ct-granted); }
.vc-hand, .vc-shield { display: grid; place-items: center; width: ${SIZES.icon}; height: ${SIZES.icon}; transition: opacity 0.2s ease-out, transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), filter 0.16s; }
.vc-shield { position: absolute; inset: 0; opacity: 0; transform: scale(0.6) rotate(-12deg); }
.vc-approval[data-approval="loading"] .vc-hand { transform-origin: 70% 80%; animation: vc-wave 0.5s ease-in-out infinite; }
.vc-approval[data-approval="granted"] .vc-hand { opacity: 0; transform: translateY(-6px) rotate(18deg) scale(0.7); }
.vc-approval[data-approval="granted"] .vc-shield { opacity: 1; transform: none; }
.vc-request { transition: color 0.16s, opacity 0.2s ease-out, filter 0.2s ease-out; background: linear-gradient(100deg, var(--ct-muted) 40%, var(--ct-text) 50%, var(--ct-muted) 60%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: vc-shimmer 2.4s linear infinite; }
.vc-approval[data-approval="granted"] .vc-request { display: none; }
.vc-approval[data-approval="loading"] .vc-request { animation: none; }
.vc-granted { position: absolute; left: 0; opacity: 0; transition: opacity 0.2s ease-out, filter 0.2s ease-out; white-space: nowrap; font-weight: 500; }
.vc-approval[data-approval="granted"] .vc-granted { opacity: 1; position: static; }
@keyframes vc-shimmer { 0% { background-position: 200% 50%; } 100% { background-position: -50% 50%; } }
@keyframes vc-wave { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(14deg); } 75% { transform: rotate(-10deg); } }
.vc-model { display: flex; align-items: center; gap: 0.397cqw; font-size: ${SIZES.labelFs}; color: var(--ct-muted); border-radius: 0.956cqw; transition: color 0.15s; }
.vc-model:hover { color: var(--ct-text); }
.vc-send { display: grid; place-items: center; width: ${SIZES.send}; height: ${SIZES.send}; border-radius: ${SIZES.sendRadius}; background: var(--ct-send-bg); color: var(--ct-send-icon); border: 0; transition: opacity 0.15s, transform 0.15s; }
.vc-send:active:not(:disabled) { transform: scale(0.94); }
.vc-send:disabled { cursor: default; }
.vc-send:disabled svg { color: var(--ct-muted); }
.vc-square { display: grid; place-items: center; width: ${SIZES.send}; height: ${SIZES.send}; border-radius: ${SIZES.sendRadius}; background: var(--ct-sq-bg); border: 1px solid var(--ct-sq-border); box-shadow: 0 0.83px 1.67px rgba(0,0,0,0.4); color: var(--ct-text); }
.vc-menu { position: absolute; z-index: 30; background: var(--ct-menu-bg); border-radius: ${SIZES.menuRadius}; padding: ${SIZES.menuPad}; box-shadow: var(--ct-menu-shadow); min-width: 40cqw; transform-origin: var(--vc-origin, bottom right); animation: vc-menu-in 0.2s cubic-bezier(0.22, 1, 0.36, 1); }
.vc-menu-head { padding: 0.59cqw 1.32cqw 0.44cqw; font-size: 1.62cqw; color: var(--ct-muted); }
.vc-menu--model { right: 0.5cqw; bottom: calc(100% + 0.66cqw); left: auto; top: auto; transform-origin: bottom right; }
.vc-menu--folder { left: 0.59cqw; bottom: calc(100% + 0.66cqw); right: auto; top: auto; transform-origin: bottom left; }
.vc-menu--apps { right: 0.59cqw; bottom: calc(100% + 0.66cqw); left: auto; top: auto; transform-origin: bottom right; }
@keyframes vc-menu-in { 0% { opacity: 0; transform: scale(0.96); } 100% { opacity: 1; transform: scale(1); } }
.vc-menu-list { position: relative; display: flex; flex-direction: column; }
.vc-hover-fill { position: absolute; left: 0; right: 0; height: 0; background: var(--ct-hover-fill); border-radius: 1.32cqw; transition: top 0.15s cubic-bezier(0.22, 1, 0.36, 1), height 0.15s; opacity: 0; }
.vc-hover-fill[data-on="true"] { opacity: 1; }
.vc-option { position: relative; display: flex; align-items: flex-start; gap: 1.03cqw; width: 100%; text-align: left; border-radius: 1.32cqw; padding: 1.47cqw 1.32cqw; font-size: ${SIZES.labelFs}; color: var(--ct-text); }
.vc-option-name { font-weight: 500; display: flex; align-items: center; gap: 0.59cqw; }
.vc-option-desc { color: var(--ct-muted); font-size: 1.47cqw; margin-top: 0.15cqw; }
.vc-check { margin-left: auto; color: var(--ct-text); opacity: 0; }
.vc-option[aria-selected="true"] .vc-check, .vc-option[aria-checked="true"] .vc-check { opacity: 1; }
.vc-draft { position: absolute; inset: 0; padding: ${SIZES.cardPadTop} ${SIZES.cardPadX}; pointer-events: none; font-size: ${SIZES.msgFs}; line-height: ${SIZES.msgLh}; display: none; }
.vc-body[data-recording="true"] .vc-draft { display: block; }
.vc-body[data-recording="true"] .vc-message { visibility: hidden; }
.vc-heard { color: var(--ct-muted); }
.vc-heard[data-confirmed="true"] { color: var(--ct-text); }
.vc-trace { display: inline-flex; align-items: center; gap: 0.44cqw; overflow: hidden; }
.vc-trace i { width: 0.3cqw; height: 0.3cqw; border-radius: 999px; background: var(--ct-muted); animation: vc-trace 1.2s linear infinite; }
@keyframes vc-trace { 0% { transform: translateX(2cqw); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateX(-2cqw); opacity: 0; } }
.vc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .vc-root *, .vc-root *::before, .vc-root *::after { animation: none !important; transition: none !important; }
}
`;

function useTheme(
  resolved: "light" | "dark",
  rootRef: React.RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const vars = THEME_VARS[resolved];
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
  }, [resolved, rootRef]);
}

export function ChatComposer({
  placeholder = DEFAULT_PLACEHOLDER,
  models = DEFAULT_MODELS,
  loadMs = 1300,
  dictation = DEFAULT_DICTATION,
  onSend,
  onModelChange,
  onAttach,
  onRequestApproval,
  folders = DEFAULT_FOLDERS,
  folder,
  onFolderChange,
  apps = DEFAULT_APPS,
  connectedApps = DEFAULT_CONNECTED,
  onAppsChange,
  theme = "auto",
  className,
  autoFocus = false,
}: ChatComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [detectedTheme, setDetectedTheme] = useState<"light" | "dark">("light");
  const [value, setValue] = useState("");
  const [modelId, setModelId] = useState(
    models[0]?.id ?? models[0]?.name ?? "auto",
  );
  const [approval, setApproval] = useState<ApprovalState>("idle");
  const [recording, setRecording] = useState(false);
  const [heard, setHeard] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(0);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [connected, setConnected] = useState<string[]>(connectedApps);
  const [pickedFolder, setPickedFolder] = useState<string | undefined>(folder);
  const [announcement, setAnnouncement] = useState("");
  const approvalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dictationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hoverFillRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<number, HTMLElement>>(new Map());
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const appsButtonRef = useRef<HTMLButtonElement>(null);

  const model = useMemo(
    () => models.find((m) => m.id === modelId) ?? models[0],
    [models, modelId],
  );
  const words = useMemo(
    () => dictation.split(/\s+/).filter(Boolean),
    [dictation],
  );

  // Theme: explicit prop wins; "auto" follows the closest `.dark` ancestor and
  // reacts to html-class changes (next-themes toggles `documentElement.classList`).
  useEffect(() => {
    if (theme !== "auto") {
      setDetectedTheme(theme);
      return;
    }
    const update = () => {
      const darkAncestor = rootRef.current?.closest(".dark") != null;
      const htmlDark = document.documentElement.classList.contains("dark");
      setDetectedTheme(darkAncestor || htmlDark ? "dark" : "light");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [theme]);
  useTheme(detectedTheme, rootRef);

  useEffect(() => {
    setPickedFolder(folder);
  }, [folder]);

  // Auto-grow the textarea with content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, el.getBoundingClientRect().width)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      if (approvalTimer.current) clearTimeout(approvalTimer.current);
      if (dictationTimer.current) clearInterval(dictationTimer.current);
    };
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const canSend = value.trim().length > 0 && approval !== "loading";

  const send = useCallback(() => {
    if (!canSend || !model) return;
    onSend?.(value.trim(), { model });
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [canSend, model, onSend, value]);

  const requestApproval = useCallback(() => {
    if (approval !== "idle") return;
    setApproval("loading");
    announce("Requesting approval");
    onRequestApproval?.();
    approvalTimer.current = setTimeout(() => {
      setApproval("granted");
      announce("Approval granted. Unrestricted access.");
    }, loadMs);
  }, [announce, approval, loadMs, onRequestApproval]);

  const startRecording = useCallback(() => {
    setRecording(true);
    setHeard([]);
    setConfirmed(0);
    announce("Recording");
    let index = 0;
    dictationTimer.current = setInterval(() => {
      index += 1;
      setHeard(words.slice(0, index));
      if (index > 1) setConfirmed(index - 1);
      if (index >= words.length && dictationTimer.current) {
        clearInterval(dictationTimer.current);
        dictationTimer.current = null;
      }
    }, 350);
  }, [announce, words]);

  const stopRecording = useCallback(
    (commit: boolean) => {
      if (dictationTimer.current) {
        clearInterval(dictationTimer.current);
        dictationTimer.current = null;
      }
      setRecording(false);
      if (commit && heard.length > 0) {
        setValue((current) =>
          current ? `${current} ${heard.join(" ")}` : heard.join(" "),
        );
      }
      setHeard([]);
      setConfirmed(0);
    },
    [heard],
  );

  const closeMenu = useCallback(
    (returnFocus: boolean) => {
      setOpenMenu(null);
      if (returnFocus) {
        const focusTarget =
          openMenu === "model"
            ? '[data-composer-button="model"]'
            : openMenu === "folder"
              ? '[data-composer-button="folder"]'
              : '[data-composer-button="apps"]';
        rootRef.current?.querySelector<HTMLButtonElement>(focusTarget)?.focus();
      }
    },
    [openMenu],
  );

  const toggleMenu = useCallback(
    (menu: MenuId) => {
      if (openMenu === menu) {
        closeMenu(true);
        return;
      }
      setOpenMenu(menu);
      setActiveIndex(0);
      setHoverIndex(null);
      if (menu === "model") announce("Model menu opened");
      if (menu === "folder") announce("Folder menu opened");
      if (menu === "apps") announce("Apps menu opened");
    },
    [announce, closeMenu, openMenu],
  );

  const pickModel = useCallback(
    (entry: ChatComposerModel) => {
      setModelId(entry.id);
      announce(`Model ${entry.name} picked`);
      onModelChange?.(entry);
      closeMenu(true);
    },
    [announce, closeMenu, onModelChange],
  );

  const pickFolder = useCallback(
    (name: string) => {
      const next = pickedFolder === name ? null : name;
      setPickedFolder(next ?? undefined);
      announce(next ? `Folder ${next} picked` : "Folder cleared");
      onFolderChange?.(next);
      closeMenu(true);
    },
    [announce, closeMenu, onFolderChange, pickedFolder],
  );

  const toggleApp = useCallback(
    (id: string) => {
      const next = connected.includes(id)
        ? connected.filter((c) => c !== id)
        : [...connected, id];
      setConnected(next);
      const app = apps.find((a) => a.id === id);
      announce(
        `${app?.name ?? id} ${next.includes(id) ? "connected" : "disconnected"}`,
      );
      onAppsChange?.(next);
    },
    [announce, apps, connected, onAppsChange],
  );

  // Menu keyboard handling (per the documented contract).
  const onMenuButtonKeyDown = useCallback(
    (event: React.KeyboardEvent, menu: MenuId) => {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        toggleMenu(menu);
      }
    },
    [toggleMenu],
  );

  const onMenuKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!openMenu) return;
      const count =
        openMenu === "model"
          ? models.length
          : openMenu === "folder"
            ? folders.length
            : apps.length;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      } else if (event.key === "Tab") {
        closeMenu(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, count - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(count - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (openMenu === "model") pickModel(models[activeIndex] ?? models[0]);
        else if (openMenu === "folder")
          pickFolder(folders[activeIndex] ?? folders[0]);
        else toggleApp(apps[activeIndex]?.id ?? "");
      }
    },
    [
      activeIndex,
      apps,
      closeMenu,
      folders,
      models,
      openMenu,
      pickFolder,
      pickModel,
      toggleApp,
    ],
  );

  // Glide the hover fill under the hovered/active row.
  useLayoutEffect(() => {
    const fill = hoverFillRef.current;
    if (!fill || !openMenu) return;
    const target =
      hoverIndex != null
        ? optionRefs.current.get(hoverIndex)
        : optionRefs.current.get(activeIndex);
    if (!target) {
      fill.dataset.on = "false";
      return;
    }
    fill.style.top = `${target.offsetTop}px`;
    fill.style.height = `${target.offsetHeight}px`;
    fill.dataset.on = "true";
  }, [activeIndex, hoverIndex, openMenu]);

  const menuItems =
    openMenu === "model"
      ? models
      : openMenu === "folder"
        ? folders.map((f) => ({ id: f, name: f }))
        : apps;

  const cardClicked = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest(".vc-menu")) return;
    textareaRef.current?.focus();
  }, []);

  const menuPanel =
    openMenu === null ? null : (
      <div
        className={cn(
          "vc-menu",
          openMenu === "model"
            ? "vc-menu--model"
            : openMenu === "folder"
              ? "vc-menu--folder"
              : "vc-menu--apps",
        )}
        role={openMenu === "apps" ? "menu" : "listbox"}
        aria-label={
          openMenu === "model"
            ? "Model picker"
            : openMenu === "folder"
              ? "Folder picker"
              : "Connect apps"
        }
        aria-activedescendant={`vc-opt-${activeIndex}`}
        tabIndex={-1}
        ref={(el) => {
          // Placement is pure CSS (vc-menu--model/folder/apps open the
          // panel upward, edge-aligned to the trigger inside the
          // positioned foot/toolbar containers). Only focus here, and
          // never let focus scroll the page.
          if (el) el.focus({ preventScroll: true });
        }}
        onKeyDown={onMenuKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            closeMenu(true);
        }}
      >
        {openMenu !== "model" && (
          <div className="vc-menu-head">
            {openMenu === "apps" ? "Apps" : "Work in a folder"}
          </div>
        )}
        <div className="vc-menu-list">
          <div
            ref={hoverFillRef}
            className="vc-hover-fill"
            data-on="false"
            aria-hidden="true"
          />
          {menuItems.map((item, index) => {
            const id = `vc-opt-${index}`;
            const isModel = openMenu === "model" && "description" in item;
            const isApp = openMenu === "apps" && "logo" in item;
            const description = isModel
              ? (item as ChatComposerModel).description
              : undefined;
            const selected =
              openMenu === "model"
                ? (item as ChatComposerModel).id === modelId
                : openMenu === "folder"
                  ? (item as { id: string }).id === pickedFolder
                  : connected.includes((item as ChatComposerApp).id);
            return (
              <div
                key={item.id}
                id={id}
                ref={(el) => {
                  if (el) optionRefs.current.set(index, el);
                  else optionRefs.current.delete(index);
                }}
                role={openMenu === "apps" ? "menuitemcheckbox" : "option"}
                aria-checked={openMenu === "apps" ? selected : undefined}
                aria-selected={openMenu === "apps" ? undefined : selected}
                className="vc-option"
                data-hover={
                  hoverIndex === index ||
                  (hoverIndex == null && activeIndex === index)
                }
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
                onClick={() => {
                  if (openMenu === "model")
                    pickModel(item as ChatComposerModel);
                  else if (openMenu === "folder")
                    pickFolder((item as { id: string; name: string }).name);
                  else toggleApp((item as ChatComposerApp).id);
                }}
              >
                {isApp && (item as ChatComposerApp).logo ? (
                  <span className="vc-icon" aria-hidden="true">
                    {(item as ChatComposerApp).logo}
                  </span>
                ) : null}
                {openMenu === "folder" && (
                  <span className="vc-icon" aria-hidden="true">
                    <Folder
                      style={{
                        width: "1.76cqw",
                        height: "1.76cqw",
                        color: "var(--ct-muted)",
                      }}
                    />
                  </span>
                )}
                <span>
                  <span className="vc-option-name">{item.name}</span>
                  {description && (
                    <span className="vc-option-desc block">{description}</span>
                  )}
                </span>
                <Check
                  className="vc-check"
                  style={{
                    width: "1.76cqw",
                    height: "1.76cqw",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  return (
    <div
      ref={rootRef}
      className={cn("vc-root w-full", className)}
      style={{ maxWidth: MAX_WIDTH_PX }}
      data-theme={detectedTheme}
    >
      <style dangerouslySetInnerHTML={{ __html: VC_STYLES }} />
      <div aria-live="polite" className="vc-sr">
        {announcement}
      </div>
      <div className="vc-tray">
        <section
          className="vc-body"
          data-approval={approval}
          data-recording={recording}
          aria-label="Message composer"
          onClick={cardClicked}
        >
          <div className="vc-card">
            <textarea
              ref={textareaRef}
              className="vc-message"
              aria-label="Message"
              placeholder={placeholder}
              rows={1}
              value={value}
              autoFocus={autoFocus}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="vc-draft" aria-hidden="true">
              {heard.map((word, i) => (
                <span
                  key={`${word}-${i}`}
                  className="vc-heard"
                  data-confirmed={i < confirmed ? "true" : "false"}
                >
                  {word}{" "}
                </span>
              ))}
              <span className="vc-trace" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
            </div>
            <div className="vc-toolbar">
              <button
                type="button"
                className="vc-icon-btn"
                aria-label="Add attachment"
                onClick={() => onAttach?.()}
              >
                <Plus style={{ width: SIZES.icon, height: SIZES.icon }} />
              </button>
              <button
                type="button"
                className="vc-approval"
                data-approval={approval}
                aria-busy={approval === "loading"}
                onClick={requestApproval}
              >
                <span className="vc-wash" aria-hidden="true" />
                <span className="vc-hand" aria-hidden="true">
                  <svg
                    viewBox="0 0 68.155 68.155"
                    fill="none"
                    style={{ width: SIZES.icon, height: SIZES.icon }}
                  >
                    <path
                      d="M52.5305 32.6557V24.8463C52.5305 22.1016 54.7555 19.8766 57.5001 19.8766C60.2448 19.8766 62.4698 22.1016 62.4698 24.8463V42.027C62.4698 53.3194 53.3154 62.4735 42.0233 62.4735H34.2388M22.7127 39.7552L15.94 31.8537C14.8314 30.5602 13.2129 29.8159 11.5094 29.8159H11.1235C8.11379 29.8159 5.67395 32.2558 5.67395 35.2655C5.67395 36.3412 5.99241 37.393 6.58919 38.2881L16.4118 53.0221C20.3482 58.9269 26.9753 62.4735 34.0719 62.4735"
                      stroke="currentColor"
                      strokeWidth="4.25969"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M52.534 24.1378V16.3284C52.534 13.5837 50.3091 11.3588 47.5644 11.3588C44.8197 11.3588 42.5948 13.5837 42.5948 16.3284V29.8174"
                      stroke="currentColor"
                      strokeWidth="4.25969"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M42.5958 29.8198V10.6513C42.5958 7.90661 40.3708 5.68163 37.6262 5.68163C34.8815 5.68163 32.6565 7.90661 32.6565 10.6513V28.4"
                      stroke="currentColor"
                      strokeWidth="4.25969"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M32.6576 28.3975V16.3284C32.6576 13.5837 30.4326 11.3588 27.6879 11.3588C24.9433 11.3588 22.7183 13.5837 22.7183 16.3284V39.7567"
                      stroke="currentColor"
                      strokeWidth="4.25969"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="vc-shield" aria-hidden="true">
                  <svg
                    viewBox="0 0 66.543 66.543"
                    fill="none"
                    style={{ width: SIZES.icon, height: SIZES.icon }}
                  >
                    <path
                      d="M33.2482 22.1795V33.27"
                      stroke="#F44900"
                      strokeWidth="4.15894"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M33.5966 43.67H33.2501M33.9432 43.67C33.9432 44.0529 33.633 44.3631 33.2501 44.3631C32.8672 44.3631 32.5569 44.0529 32.5569 43.67C32.5569 43.2871 32.8672 42.9768 33.2501 42.9768C33.633 42.9768 33.9432 43.2871 33.9432 43.67Z"
                      stroke="#F44900"
                      strokeWidth="4.15894"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M58.202 31.0087V22.9595C58.202 18.4124 58.202 16.1389 57.0816 14.6555C55.9612 13.1722 53.4278 12.452 48.3612 11.0118C44.8995 10.0278 41.848 8.84228 39.41 7.76002C36.0859 6.28445 34.4237 5.54666 33.2484 5.54666C32.0728 5.54666 30.4109 6.28445 27.0868 7.76002C24.6487 8.84228 21.5973 10.0278 18.1357 11.0118C13.069 12.452 10.5356 13.1722 9.4152 14.6555C8.29475 16.1389 8.29475 18.4124 8.29475 22.9595V31.0087C8.29475 46.605 22.3319 55.9626 29.3498 59.6666C31.0331 60.5549 31.8748 60.9991 33.2484 60.9991C34.622 60.9991 35.4635 60.5549 37.1467 59.6666C44.1648 55.9626 58.202 46.605 58.202 31.0087Z"
                      stroke="#F44900"
                      strokeWidth="4.15894"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="vc-approval-text">
                  <span className="vc-request">Request approval</span>
                  <span className="vc-granted">Unrestricted access</span>
                </span>
              </button>
              <div className="vc-toolbar vc-toolbar--end">
                <button
                  type="button"
                  ref={modelButtonRef}
                  data-composer-button="model"
                  className="vc-model"
                  aria-haspopup="listbox"
                  aria-expanded={openMenu === "model"}
                  onKeyDown={(event) => onMenuButtonKeyDown(event, "model")}
                  onClick={() => toggleMenu("model")}
                >
                  <span className="vc-label vc-model-name">
                    {model?.name ?? "Auto"}
                  </span>
                  <ChevronDown
                    style={{ width: "1.32cqw", height: "1.32cqw" }}
                  />
                </button>
                <button
                  type="button"
                  className="vc-icon-btn"
                  aria-label={recording ? "Stop recording" : "Voice input"}
                  onClick={() =>
                    recording ? stopRecording(false) : startRecording()
                  }
                >
                  <Mic style={{ width: SIZES.icon, height: SIZES.icon }} />
                </button>
                {recording ? (
                  <>
                    <button
                      type="button"
                      className="vc-square"
                      aria-label="Discard recording"
                      onClick={() => stopRecording(false)}
                    >
                      <X style={{ width: "2.2cqw", height: "2.2cqw" }} />
                    </button>
                    <button
                      type="button"
                      className="vc-square"
                      aria-label="Use recording"
                      onClick={() => stopRecording(true)}
                    >
                      <Square
                        style={{
                          width: "1.9cqw",
                          height: "1.9cqw",
                          fill: "currentColor",
                        }}
                      />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="vc-send"
                    aria-label="Send message"
                    disabled={!canSend}
                    onClick={send}
                  >
                    <ArrowUp style={{ width: "2.2cqw", height: "2.2cqw" }} />
                  </button>
                )}
                {openMenu === "model" && menuPanel}
              </div>
            </div>
          </div>
          <div className="vc-foot">
            <button
              type="button"
              ref={folderButtonRef}
              data-composer-button="folder"
              className="vc-row"
              aria-haspopup="listbox"
              aria-expanded={openMenu === "folder"}
              onKeyDown={(event) => onMenuButtonKeyDown(event, "folder")}
              onClick={() => toggleMenu("folder")}
            >
              <span className="vc-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 67 67"
                  fill="none"
                  style={{ width: "2.2cqw", height: "2.2cqw" }}
                >
                  <path
                    d="M11.1704 15.3527V30.7069H55.837V23.7277C55.837 19.8732 52.7123 16.7485 48.8578 16.7485H33.5037L29.5778 10.8598C28.5423 9.30649 26.799 8.37352 24.9322 8.37352H18.1495C14.295 8.37352 11.1704 11.4982 11.1704 15.3527Z"
                    fill="#00A1FF"
                  />
                  <path
                    d="M33.5037 16.7485L29.5778 10.8598C28.5423 9.30649 26.799 8.37352 24.9322 8.37352H18.1495C14.295 8.37352 11.1704 11.4982 11.1704 15.3527V30.7068H55.837V23.7277C55.837 19.8732 52.7123 16.7485 48.8578 16.7485H33.5037ZM33.5037 16.7485H23.7328"
                    stroke="#00A1FF"
                    strokeWidth="4.1875"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    opacity="0.4"
                    d="M6.59197 42.3758C5.54336 37.1185 5.01906 34.4899 6.50878 32.7085C6.6081 32.5899 6.71315 32.4751 6.82359 32.3646C8.47975 30.71 11.4107 30.71 17.2725 30.71H49.7312C55.5931 30.71 58.5238 30.71 60.1801 32.3646C60.2904 32.4751 60.3957 32.5899 60.495 32.7085C61.9847 34.4899 61.4604 37.1185 60.4118 42.3758C58.9041 49.9348 58.15 53.7144 55.3073 56.0363C55.1133 56.1945 54.9134 56.3467 54.7076 56.4921C51.6932 58.6266 47.4792 58.6266 39.0506 58.6266H27.9531C19.5246 58.6266 15.3104 58.6266 12.296 56.4921C12.0904 56.3467 11.8904 56.1945 11.6965 56.0363C8.85353 53.7144 8.09969 49.9348 6.59197 42.3758Z"
                    fill="#929292"
                  />
                  <path
                    d="M6.59197 42.3758C5.54336 37.1185 5.01906 34.4899 6.50878 32.7085C6.6081 32.5899 6.71315 32.4751 6.82359 32.3646C8.47975 30.71 11.4107 30.71 17.2725 30.71H49.7312C55.5931 30.71 58.5238 30.71 60.1801 32.3646C60.2904 32.4751 60.3957 32.5899 60.495 32.7085C61.9847 34.4899 61.4604 37.1185 60.4118 42.3758C58.9041 49.9348 58.15 53.7144 55.3073 56.0363C55.1133 56.1945 54.9134 56.3467 54.7076 56.4921C51.6932 58.6266 47.4792 58.6266 39.0506 58.6266H27.9531C19.5246 58.6266 15.3104 58.6266 12.296 56.4921C12.0904 56.3467 11.8904 56.1945 11.6965 56.0363C8.85353 53.7144 8.09969 49.9348 6.59197 42.3758Z"
                    fill="#3CC7FF"
                    stroke="#3CC7FF"
                    strokeWidth="4.1875"
                  />
                </svg>
              </span>
              <span
                className="vc-label"
                style={{
                  maxWidth: "22cqw",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={pickedFolder ?? "Work in a folder"}
              >
                {pickedFolder ?? "Work in a folder"}
              </span>
            </button>
            <button
              type="button"
              ref={appsButtonRef}
              data-composer-button="apps"
              className="vc-row"
              aria-haspopup="menu"
              aria-expanded={openMenu === "apps"}
              onKeyDown={(event) => onMenuButtonKeyDown(event, "apps")}
              onClick={() => toggleMenu("apps")}
            >
              <span className="vc-label">Connect apps</span>
              <span className="vc-logos" aria-hidden="true">
                {apps.slice(0, 3).map((app) => {
                  const isConnected = connected.includes(app.id);
                  if (app.logo) {
                    return (
                      <span
                        key={app.id}
                        className="vc-logo"
                        style={{ opacity: isConnected ? 1 : 0.45 }}
                      >
                        {app.logo}
                      </span>
                    );
                  }

                  return (
                    <span
                      key={app.id}
                      className="vc-logo"
                      style={{
                        background: isConnected ? "#0E7AD6" : "transparent",
                        border: "1px solid var(--ct-muted)",
                      }}
                    >
                      {app.name.slice(0, 1).toUpperCase()}
                    </span>
                  );
                })}
              </span>
            </button>
            {(openMenu === "folder" || openMenu === "apps") && menuPanel}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ChatComposer;
