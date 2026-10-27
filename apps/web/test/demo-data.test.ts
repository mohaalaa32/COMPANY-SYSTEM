import { describe, expect, it } from 'vitest';
import { KARBALA_BRANCH_ID } from '@tel/adapters';
import {
  CUSTOMER_PREVIEW,
  dashboardProductViews,
  DEMO_BRANCH,
  DEMO_CONVERSATIONS,
  getDemoProduct,
  karbalaQuantity,
} from '../src/lib/demo-data';
import { filterConversations } from '../src/lib/dashboard-model';

describe('demo-data integrity and single-branch restriction', () => {
  it('restricts the deployment branch to Karbala only', () => {
    expect(DEMO_BRANCH.id).toBe(KARBALA_BRANCH_ID);
    expect(DEMO_BRANCH.city).toBe('كربلاء');
  });

  it('guarantees all customer preview suggestions exist and fit budget', () => {
    for (const pid of CUSTOMER_PREVIEW.suggestionIds) {
      const prod = getDemoProduct(pid);
      expect(prod).toBeDefined();
      const price = prod.salePriceIQD ?? prod.basePriceIQD;
      expect(price).toBeLessThanOrEqual(CUSTOMER_PREVIEW.budgetIQD);
      expect(karbalaQuantity(prod)).toBeGreaterThanOrEqual(0);
    }
  });

  it('guarantees the customer preview accessory exists', () => {
    const accessory = getDemoProduct(CUSTOMER_PREVIEW.accessoryId);
    expect(accessory).toBeDefined();
    expect(accessory.category).toBe('accessory');
  });

  it('ensures all linked products across demo conversations exist and only have Karbala branch', () => {
    for (const conv of DEMO_CONVERSATIONS) {
      expect(conv.cityAr).toBe('كربلاء');
      for (const pid of conv.linkedProductIds) {
        const prod = getDemoProduct(pid);
        expect(prod).toBeDefined();
        // Check that products only reference branch-karbala
        expect(prod.branches.every((b) => b.branchId === KARBALA_BRANCH_ID)).toBe(true);
      }
      for (const msg of conv.messages) {
        if (msg.productIds) {
          for (const pid of msg.productIds) {
            const prod = getDemoProduct(pid);
            expect(prod).toBeDefined();
          }
        }
      }
    }
  });

  it('correctly projects product views without leaking cost prices', () => {
    const views = dashboardProductViews();
    expect(Object.keys(views).length).toBeGreaterThan(0);
    for (const view of Object.values(views)) {
      expect(view.priceIQD).toBeGreaterThan(0);
      expect(view.karbalaQty).toBeGreaterThanOrEqual(0);
      // Ensure costIQD or margin is NOT in ProductView
      expect((view as unknown as Record<string, unknown>).costIQD).toBeUndefined();
      expect((view as unknown as Record<string, unknown>).minMarginPct).toBeUndefined();
    }
  });

  it('filters conversations correctly', () => {
    const all = filterConversations(DEMO_CONVERSATIONS, 'all');
    expect(all.length).toBe(DEMO_CONVERSATIONS.length);

    const waiting = filterConversations(DEMO_CONVERSATIONS, 'waiting');
    expect(waiting.every((c) => c.status === 'WAITING_STAFF')).toBe(true);
    expect(waiting.length).toBeGreaterThan(0);

    const resolved = filterConversations(DEMO_CONVERSATIONS, 'resolved');
    expect(resolved.every((c) => c.status === 'RESOLVED')).toBe(true);
  });
});
