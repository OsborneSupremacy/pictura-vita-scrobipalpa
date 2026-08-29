import { describe, expect, it } from 'vitest';
import { removalImpact, totalOrphaned } from './categoryImpact';
import type { ApiEpisode } from '../api/types';

const episode = (...categoryIds: string[]) => ({ categoryIds }) as unknown as ApiEpisode;

describe('removalImpact', () => {
  const episodes = [
    episode('work'),
    episode('work', 'health'),
    episode('health'),
    episode('travel')
  ];

  it('counts everything tagged with the category', () => {
    expect(removalImpact(episodes, 'work').tagged).toBe(2);
  });

  it('counts only the ones left with no other category as orphaned', () => {
    // The episode tagged work+health survives through health.
    expect(removalImpact(episodes, 'work').orphaned).toBe(1);
  });

  it('treats a category with nothing in it as costless', () => {
    expect(removalImpact(episodes, 'empty')).toEqual({ tagged: 0, orphaned: 0 });
  });

  it('accounts for other categories already marked for removal', () => {
    // With health going too, the work+health episode has nothing left to be drawn through.
    expect(removalImpact(episodes, 'work', new Set(['health']))).toEqual({
      tagged: 2,
      orphaned: 2
    });
  });

  it('is unaffected by removals the episode does not reference', () => {
    expect(removalImpact(episodes, 'work', new Set(['travel']))).toEqual(
      removalImpact(episodes, 'work')
    );
  });
});

describe('totalOrphaned', () => {
  const episodes = [
    episode('work'),
    episode('work', 'health'),
    episode('health'),
    episode('travel')
  ];

  it('is zero when nothing is being removed', () => {
    expect(totalOrphaned(episodes, new Set())).toBe(0);
  });

  it('counts episodes losing every one of their categories', () => {
    expect(totalOrphaned(episodes, new Set(['work']))).toBe(1);
    expect(totalOrphaned(episodes, new Set(['work', 'health']))).toBe(3);
    expect(totalOrphaned(episodes, new Set(['work', 'health', 'travel']))).toBe(4);
  });

  it('does not double count an episode in two removed categories', () => {
    expect(totalOrphaned([episode('a', 'b')], new Set(['a', 'b']))).toBe(1);
  });

  it('ignores an episode with no categories at all', () => {
    // Already undrawable; removing a category does not change its fate.
    expect(totalOrphaned([episode()], new Set(['a']))).toBe(0);
  });
});
