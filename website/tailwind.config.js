import { fileURLToPath } from "node:url";
import path from "node:path";

const websiteRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = path.resolve(websiteRoot, "..");

/** fast-glob (inside Tailwind) wants forward slashes, including on Windows. */
const glob = (value) => value.replace(/\\/g, "/");

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    glob(`${websiteRoot}index.html`),
    glob(`${websiteRoot}video.html`),
    glob(`${websiteRoot}src/**/*.{ts,tsx}`),
    // The demo reuses the application's components, so their classes have to be
    // scanned too. The app build uses its own config.
    glob(`${appRoot}/src/**/*.{ts,tsx}`),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
