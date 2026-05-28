/**
 * Tailwind CSS configuration.
 *
 * content — tells Tailwind which files to scan for class names.
 * Only classes that appear in these files are included in the final
 * CSS bundle (automatic tree-shaking). All .jsx files under src/
 * plus index.html are included.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {}
  },
  plugins: []
};
