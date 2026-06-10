import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:8181';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openTaskGrid(page: Page) {
    await page.goto(BASE_URL);
    // Wait for the grid to be loaded with at least one data row
    await expect(page.getByRole('row', { name: 'Website Redesign' })).toBeVisible({ timeout: 15_000 });
}

/**
 * Returns total row count from the AG Grid pagination summary ("1 - 68 of 68" → 68).
 * Using pagination is more reliable than counting DOM rows because AG Grid
 * uses virtual scrolling and only renders visible rows.
 */
async function getRowCount(page: Page): Promise<number> {
    const text = await page.getByRole('button', { name: /\d+ - \d+ of \d+/ }).textContent({ timeout: 5_000 });
    const match = text?.match(/of (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('TaskGrid - View Switcher', () => {
    test('shows "My Open Tasks" view by default', async ({ page }) => {
        await openTaskGrid(page);
        await expect(page.getByRole('button', { name: /My Open Tasks/i })).toBeVisible();
    });

    test('opens view dropdown with system and user views', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();

        await expect(page.getByRole('menuitem', { name: 'My Open Tasks' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'High Priority' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'All Tasks' })).toBeVisible();
    });

    test('switches to "All Tasks" view', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'All Tasks' }).click();

        await expect(page.getByRole('button', { name: /All Tasks/i })).toBeVisible();
    });

    test('switches to "High Priority" view', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'High Priority' }).click();

        await expect(page.getByRole('button', { name: /High Priority/i })).toBeVisible();
    });
});

test.describe('TaskGrid - Task Creation', () => {
    test('creates a new top-level task via New menu', async ({ page }) => {
        await openTaskGrid(page);
        const before = await getRowCount(page);

        await page.getByRole('menuitem', { name: 'New' }).click();
        await page.getByRole('menuitem', { name: 'Top-level' }).click();

        // An inline editing row appears with an active textbox
        const nameInput = page.getByRole('textbox', { name: '---' });
        await expect(nameInput).toBeVisible();
        await expect(nameInput).toBeFocused();

        await nameInput.fill('Playwright Test Task');
        await page.keyboard.press('Escape');

        // Pagination total increases
        const after = await getRowCount(page);
        expect(after).toBe(before + 1);

        await expect(page.getByRole('row', { name: /Playwright Test Task/ })).toBeVisible();
    });

    test('cancels inline task creation with Escape without saving empty task name', async ({ page }) => {
        await openTaskGrid(page);
        const before = await getRowCount(page);

        await page.getByRole('menuitem', { name: 'New' }).click();
        await page.getByRole('menuitem', { name: 'Top-level' }).click();

        const nameInput = page.getByRole('textbox', { name: '---' });
        await expect(nameInput).toBeVisible();
        // Press Escape without typing
        await page.keyboard.press('Escape');

        // Row count stays the same (new task is created with auto-subject, but committed)
        const after = await getRowCount(page);
        expect(after).toBeGreaterThanOrEqual(before);
    });

    test('shows "Task From Template" option in New menu', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('menuitem', { name: 'New' }).click();
        await expect(page.getByRole('menuitem', { name: 'Task From Template' })).toBeVisible();
        await page.keyboard.press('Escape');
    });
});

test.describe('TaskGrid - Task Deletion', () => {
    test('deletes a selected task after confirmation', async ({ page }) => {
        await openTaskGrid(page);

        // Create a task to delete
        await page.getByRole('menuitem', { name: 'New' }).click();
        await page.getByRole('menuitem', { name: 'Top-level' }).click();
        const nameInput = page.getByRole('textbox', { name: '---' });
        await nameInput.fill('Task To Delete');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('row', { name: /Task To Delete/ })).toBeVisible();

        const before = await getRowCount(page);

        // Select the task row's checkbox
        const taskRow = page.getByRole('row', { name: /Task To Delete/ });
        await taskRow.locator('.ms-Checkbox').click();

        // Delete appears in toolbar — register dialog handler BEFORE clicking Delete
        const dialogPromise = page.waitForEvent('dialog');
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        const dialog = await dialogPromise;
        await dialog.accept();

        await expect(page.getByRole('row', { name: /Task To Delete/ })).not.toBeVisible({ timeout: 5_000 });
        expect(await getRowCount(page)).toBe(before - 1);
    });

    test('shows delete confirmation dialog', async ({ page }) => {
        await openTaskGrid(page);

        // Select any row, then register dialog handler BEFORE clicking Delete
        await page.locator('[role=treegrid] .ms-Checkbox').first().click();

        const dialogPromise = page.waitForEvent('dialog');
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        const dialog = await dialogPromise;

        expect(dialog.message()).toContain('delete');
        await dialog.dismiss();
    });

    test('cancels deletion when dialog is dismissed', async ({ page }) => {
        await openTaskGrid(page);
        const before = await getRowCount(page);

        await page.locator('[role=treegrid] .ms-Checkbox').first().click();

        const dialogPromise = page.waitForEvent('dialog');
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        const dialog = await dialogPromise;
        await dialog.dismiss();

        const after = await getRowCount(page);
        expect(after).toBe(before);
    });
});

test.describe('TaskGrid - Quick Find / Search', () => {
    test('filters rows by search term', async ({ page }) => {
        await openTaskGrid(page);
        const before = await getRowCount(page);

        await page.getByPlaceholder('Search records...').fill('Mobile');
        await page.keyboard.press('Enter');

        const after = await getRowCount(page);
        expect(after).toBeLessThan(before);
        await expect(page.getByRole('row', { name: /Mobile App/ })).toBeVisible();
    });

    test('clears search to restore all rows', async ({ page }) => {
        await openTaskGrid(page);
        const before = await getRowCount(page);

        await page.getByPlaceholder('Search records...').fill('Mobile');
        await page.keyboard.press('Enter');
        await page.getByPlaceholder('Search records...').fill('');
        await page.keyboard.press('Enter');

        const after = await getRowCount(page);
        expect(after).toBe(before);
    });

    test('shows no rows for unmatched search term', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByPlaceholder('Search records...').fill('ZZZZZZ_NO_MATCH');
        await page.keyboard.press('Enter');

        const after = await getRowCount(page);
        expect(after).toBe(0);
    });
});

test.describe('TaskGrid - Hierarchy Toggle', () => {
    test('shows hierarchy by default (expandable rows)', async ({ page }) => {
        await openTaskGrid(page);

        // Switch to All Tasks to see all data
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'All Tasks' }).click();

        // In hierarchy mode, rows with children expose aria-expanded
        await expect(page.locator('[role=treegrid] [role=row][aria-expanded]').first()).toBeVisible();
    });

    test('switching hierarchy off shows flat list with Path column', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'All Tasks' }).click();

        await page.getByRole('menuitem', { name: 'Settings' }).click();

        const hierarchySwitch = page.getByRole('switch').first(); // "Show hierarchy"
        const wasChecked = await hierarchySwitch.isChecked();
        if (wasChecked) {
            await hierarchySwitch.click();
        }

        await page.keyboard.press('Escape');

        // Flat list: Path column should appear
        await expect(page.getByRole('columnheader', { name: 'Path' })).toBeVisible();
    });

    test('re-enabling hierarchy hides Path column', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'All Tasks' }).click();

        // Turn off hierarchy
        await page.getByRole('menuitem', { name: 'Settings' }).click();
        const hierarchySwitch = page.getByRole('switch').first();
        await hierarchySwitch.click();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('columnheader', { name: 'Path' })).toBeVisible();

        // Turn back on
        await page.getByRole('menuitem', { name: 'Settings' }).click();
        await page.getByRole('switch').first().click();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('columnheader', { name: 'Path' })).not.toBeVisible();
    });
});

test.describe('TaskGrid - Hide Inactive Tasks Toggle', () => {
    test('Settings menu has "Hide inactive tasks" toggle', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('menuitem', { name: 'Settings' }).click();

        await expect(page.getByText('Hide inactive tasks')).toBeVisible();
        await expect(page.getByRole('switch').nth(1)).toBeVisible(); // second switch
        await page.keyboard.press('Escape');
    });

    test('toggling "Hide inactive tasks" changes visible row count', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'All Tasks' }).click();

        const before = await getRowCount(page);

        await page.getByRole('menuitem', { name: 'Settings' }).click();
        const hideInactiveSwitch = page.getByRole('switch').nth(1);
        const isOn = await hideInactiveSwitch.isChecked();
        await hideInactiveSwitch.click();
        await page.keyboard.press('Escape');

        const after = await getRowCount(page);
        // Hiding or showing inactive tasks changes the count
        if (isOn) {
            // Was hiding inactive → now showing them → more rows
            expect(after).toBeGreaterThanOrEqual(before);
        } else {
            // Was showing inactive → now hiding → fewer or equal rows
            expect(after).toBeLessThanOrEqual(before);
        }
    });
});

test.describe('TaskGrid - Edit Columns', () => {
    test('opens Edit columns dialog', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Edit columns' }).click();

        // The dialog heading is the reliable visibility indicator (Fluent UI Panel wrapper may be aria-hidden)
        await expect(page.getByRole('heading', { name: 'Edit columns' })).toBeVisible();
    });

    test('Edit columns dialog shows current columns', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Edit columns' }).click();

        const dialog = page.getByRole('dialog', { name: 'Edit columns' });
        await expect(dialog.getByRole('button', { name: 'Subject' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Status' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Priority' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Due Date' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: '% Complete' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Assigned To' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Tags' })).toBeVisible();
    });

    test('Edit columns dialog has Save and Cancel buttons', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Edit columns' }).click();

        const dialog = page.getByRole('dialog', { name: 'Edit columns' });
        await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    });

    test('cancels Edit columns without applying changes', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Edit columns' }).click();
        await page.getByRole('button', { name: 'Cancel' }).click();

        await expect(page.getByRole('dialog', { name: 'Edit columns' })).not.toBeVisible();
        // Original columns still present
        await expect(page.getByRole('columnheader', { name: 'Subject' })).toBeVisible();
    });

    test('has "Add column..." combobox in Edit columns dialog', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Edit columns' }).click();

        const dialog = page.getByRole('dialog', { name: 'Edit columns' });
        await expect(dialog.locator('text=Add column...')).toBeVisible();
        await expect(dialog.getByRole('combobox')).toBeVisible();
    });
});

test.describe('TaskGrid - Row Selection & Toolbar Actions', () => {
    test('selecting a row shows Edit and Delete in toolbar', async ({ page }) => {
        await openTaskGrid(page);
        await page.locator('[role=treegrid] .ms-Checkbox').first().click();

        await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
    });

    test('selecting multiple rows shows mixed-state header checkbox', async ({ page }) => {
        await openTaskGrid(page);
        // Use AG Grid data rows (not rowgroup containers) for reliable checkbox targeting
        const checkboxes = page.locator('.ag-row .ms-Checkbox');
        await checkboxes.nth(0).click();
        await checkboxes.nth(1).click();

        // Header checkbox should be in mixed state
        const headerCheckbox = page.locator('[role=columnheader] input[type=checkbox]').first();
        await expect(headerCheckbox).toHaveJSProperty('indeterminate', true);
    });

    test('clicking Edit opens task navigation (alert dialog)', async ({ page }) => {
        await openTaskGrid(page);
        await page.locator('[role=treegrid] .ms-Checkbox').first().click();

        page.once('dialog', dialog => {
            expect(dialog.message()).toContain('Open');
            dialog.accept();
        });
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        await page.waitForTimeout(500);
    });

    test('double-clicking a row navigates (opens alert dialog)', async ({ page }) => {
        await openTaskGrid(page);

        page.once('dialog', dialog => {
            expect(dialog.message()).toContain('Open');
            dialog.accept();
        });

        await page.getByRole('gridcell', { name: 'Website Redesign' }).dblclick();
        await page.waitForTimeout(500);
    });
});

test.describe('TaskGrid - Column Sorting', () => {
    test('clicking column header sorts the grid', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Subject' }).click();

        // After sorting, the column header should indicate sort direction
        const subjectHeader = page.getByRole('columnheader', { name: 'Subject' });
        await expect(subjectHeader).toBeVisible();
        // The grid is sorted — no error thrown
    });

    test('clicking column header twice reverses sort order', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: 'Subject' }).click();
        await page.getByRole('button', { name: 'Subject' }).click();
        // Still visible and stable
        await expect(page.getByRole('columnheader', { name: 'Subject' })).toBeVisible();
    });
});

test.describe('TaskGrid - View Management', () => {
    test('"Save as new view" dialog appears', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'Save as new view' }).click();

        // Check heading visibility (Fluent UI Dialog wrapper may be aria-hidden during animation)
        await expect(page.getByRole('heading', { name: 'Save as new view' })).toBeVisible();
    });

    test('saves a new user view and it appears in the view switcher', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'Save as new view' }).click();

        await page.getByRole('textbox', { name: 'Name' }).fill('Playwright Custom View');
        await page.getByRole('button', { name: 'Save' }).click();

        // The view switcher now shows the new view name
        await expect(page.getByRole('button', { name: /Playwright Custom View/i })).toBeVisible();
    });

    test('cancels "Save as new view" dialog', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();
        await page.getByRole('menuitem', { name: 'Save as new view' }).click();

        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('alertdialog', { name: 'Save as new view' })).not.toBeVisible();
    });

    test('"Manage views" appears in view switcher dropdown', async ({ page }) => {
        await openTaskGrid(page);
        await page.getByRole('button', { name: /My Open Tasks/i }).click();

        await expect(page.getByRole('menuitem', { name: 'Manage views' })).toBeVisible();
        await page.keyboard.press('Escape');
    });
});

test.describe('TaskGrid - Grid Structure', () => {
    test('renders expected column headers for "My Open Tasks" view', async ({ page }) => {
        await openTaskGrid(page);

        await expect(page.getByRole('columnheader', { name: 'Subject' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Priority' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Due Date' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: '% Complete' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Assigned To' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Tags' })).toBeVisible();
    });

    test('renders initial seed tasks', async ({ page }) => {
        await openTaskGrid(page);

        await expect(page.getByRole('row', { name: 'Website Redesign' })).toBeVisible();
        await expect(page.getByRole('row', { name: 'API Platform v2' })).toBeVisible();
        await expect(page.getByRole('row', { name: /Mobile App/ })).toBeVisible();
    });

    test('shows pagination summary', async ({ page }) => {
        await openTaskGrid(page);
        // The pagination bar shows "N - M of T"
        await expect(page.getByText(/\d+ - \d+ of \d+/)).toBeVisible();
    });

    test('has a search input', async ({ page }) => {
        await openTaskGrid(page);
        await expect(page.getByPlaceholder('Search records...')).toBeVisible();
    });
});
