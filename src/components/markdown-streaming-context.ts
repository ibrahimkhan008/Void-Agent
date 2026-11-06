import { createContext } from "react";

/** True only for the final markdown block while its message is streaming. */
export const MarkdownStreamingContext = createContext(false);
