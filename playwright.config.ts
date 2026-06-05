import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './TaskGrid/tests',
    fullyParallel: false,
    retries: 0,
    reporter: [['html'], ['list']],
    use: {
        baseURL: 'http://localhost:8181',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // webServer is used in both headless (`npm test`) and UI mode (`npm run test:ui`).
    // In UI mode the server starts on the first test run, not when the UI opens.
    // If the dev server is already running on 8181, it will be reused automatically.
    webServer: {
        command: 'npm run start',
        url: 'http://localhost:8181',
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
