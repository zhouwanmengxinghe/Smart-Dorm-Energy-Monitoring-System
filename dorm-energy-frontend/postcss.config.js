/**
 * PostCSS configuration.
 *
 * Pipeline: Tailwind CSS → Autoprefixer.
 * Tailwind processes the @tailwind directives into utility classes.
 * Autoprefixer adds vendor prefixes for cross-browser compatibility.
 */

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
