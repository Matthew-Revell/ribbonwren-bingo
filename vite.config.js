import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/ribbonwren-bingo/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        owner: "owner.html",
        help: "help.html",
        privacy: "privacy.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js", "tests/pdf/**/*.test.js"],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
