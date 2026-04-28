import { test, expect } from '@playwright/test';

// Public, no-auth route — does not pass through /gate.

test.describe('Pathfinder roadmap page', () => {
  test('renders hero, all 47 cards, and 14 category sections at desktop', async ({
    page,
    baseURL,
  }) => {
    await page.goto(new URL('/pathfinder-roadmap', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveTitle(/Pathfinder Roadmap/);
    await expect(page.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeVisible();

    const cards = page.getByTestId('feature-card');
    await expect(cards).toHaveCount(47);

    const sections = page.getByTestId('category-section');
    await expect(sections).toHaveCount(14);
  });

  test('status filter pills filter the grid client-side', async ({
    page,
    baseURL,
  }) => {
    await page.goto(new URL('/pathfinder-roadmap', baseURL).toString(), {
      waitUntil: 'networkidle',
    });

    // All pill is the default — click Live, expect 10 cards.
    await page.getByTestId('filter-live').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(10);

    // Building → 7
    await page.getByTestId('filter-building').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(7);

    // Planned → 9
    await page.getByTestId('filter-planned').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(9);

    // Considering → 11
    await page.getByTestId('filter-considering').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(11);

    // Future → 10
    await page.getByTestId('filter-future').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(10);

    // All → 47 again
    await page.getByTestId('filter-all').click();
    await expect(page.getByTestId('feature-card')).toHaveCount(47);
  });

  test('mobile viewport renders without horizontal scroll', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto(new URL('/pathfinder-roadmap', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.docWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

    // All 47 cards still render at mobile (just stacked).
    await expect(page.getByTestId('feature-card')).toHaveCount(47);

    await context.close();
  });

  test('footer renders all three links + email', async ({ page, baseURL }) => {
    await page.goto(new URL('/pathfinder-roadmap', baseURL).toString(), {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('link', { name: 'Pathfinder dashboard' }),
    ).toHaveAttribute('href', 'https://pathfinder.unicron.systems');
    await expect(
      page.getByRole('link', { name: 'unicron.systems' }),
    ).toHaveAttribute('href', 'https://unicron.systems');
    await expect(
      page.getByRole('link', { name: 'kyle@freakngenius.com' }),
    ).toHaveAttribute('href', 'mailto:kyle@freakngenius.com');
  });
});
