import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
    {
        extends: "./vitest.config.ts",
        test: {
            name: "web",
            include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
    },
    {
        extends: "./chrome-extension/vitest.config.ts",
        test: {
            name: "chrome-extension",
            root: "./chrome-extension",
            include: ["tests/**/*.{test,spec}.ts"],
        },
    },
]);
