import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const PAGES_DEPLOY_WORKFLOW = "Deploy GitHub Pages";

/**
 * VITE_LS_QA=1 compiles the test checkout into a production build.
 * The page passes qaBuild for that build, so ?lstest=1 reveals the link.
 * The Pages deploy workflow forces this off, including a value from the
 * runner environment or an env file.
 */
function ribbonwrenLsQa(mode) {
  if (process.env.GITHUB_WORKFLOW === PAGES_DEPLOY_WORKFLOW) return "";
  const fromFile = loadEnv(mode, process.cwd(), "VITE_").VITE_LS_QA === "1";
  if (process.env.VITE_LS_QA === "1" || fromFile) return "1";
  return "";
}

/**
 * Dev, Vitest, and a VITE_LS_QA=1 build may contain the test checkout.
 * A normal production build, and every Pages deploy, must not.
 */
function includeTestCheckout(command, mode) {
  if (process.env.GITHUB_WORKFLOW === PAGES_DEPLOY_WORKFLOW) return false;
  if (process.env.VITEST || command === "serve") return true;
  return ribbonwrenLsQa(mode) === "1";
}

export default defineConfig(({ command, mode }) => ({
  define: {
    __INCLUDE_TEST_CHECKOUT__: JSON.stringify(includeTestCheckout(command, mode)),
  },
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
}));
