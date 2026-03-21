import webAppEslintConfig from "@linky/config/eslint";

export default [
  ...webAppEslintConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "simple-import-sort/imports": "off",
      "simple-import-sort/exports": "off",
      "unused-imports/no-unused-imports": "off",
      "unused-imports/no-unused-vars": "off",
    },
  },
];
