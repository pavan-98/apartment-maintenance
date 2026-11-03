/**
 * Deployment settings. Set these as environment variables (e.g. in Vercel)
 * to brand the app for your apartment; the name can also be changed later
 * in Admin → Settings.
 */
export const APARTMENT_NAME = process.env.NEXT_PUBLIC_APARTMENT_NAME?.trim() || "Sunrise Residency";

/** Short name for the home-screen icon; defaults to the last two words of the name. */
export const APARTMENT_SHORT_NAME =
  process.env.NEXT_PUBLIC_APARTMENT_SHORT_NAME?.trim() || APARTMENT_NAME.split(/\s+/).slice(-2).join(" ");
