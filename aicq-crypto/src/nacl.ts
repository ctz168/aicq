/**
 * Thin wrappers around tweetnacl and tweetnacl-util so the rest of the
 * library never imports those packages directly.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

// Re-export the entire nacl module for advanced usage.
export { nacl };

/* ------------------------------------------------------------------ */
/*  UTF-8 helpers                                                      */
/* ------------------------------------------------------------------ */

/** Decode a JavaScript UTF-16 string into a Uint8Array. */
export const decodeUTF8 = naclUtil.decodeUTF8;

/** Encode a Uint8Array into a JavaScript UTF-16 string. */
export const encodeUTF8 = naclUtil.encodeUTF8;

/* ------------------------------------------------------------------ */
/*  Base64 helpers                                                     */
/* ------------------------------------------------------------------ */

/** Decode a Base64-encoded string into a Uint8Array. */
export const decodeBase64 = naclUtil.decodeBase64;

/** Encode a Uint8Array into a Base64 string (URL-safe variant). */
export const encodeBase64 = naclUtil.encodeBase64;
