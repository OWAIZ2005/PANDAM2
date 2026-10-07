import { type Ionicons } from '@expo/vector-icons';

import { type ItemType } from '@pandam/types';

export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Category slug → icon. Cards and category tiles carry no photography, so the
 * icon is what makes a category recognisable at a glance; an unmapped slug
 * falls back to a neutral tag rather than rendering nothing.
 */
const CATEGORY_ICON: Record<string, IconName> = {
  technology: 'hardware-chip',
  electronics: 'phone-portrait',
  design: 'color-palette',
  'web-design': 'browsers',
  photography: 'camera',
  video: 'videocam',
  music: 'musical-notes',
  writing: 'create',
  education: 'school',
  'skills-and-tutoring': 'bulb',
  services: 'construct',
  books: 'book',
  clothing: 'shirt',
  furniture: 'bed',
  'home-and-garden': 'leaf',
  'sports-and-outdoors': 'bicycle',
  food: 'restaurant',
  grocery: 'basket',
  gaming: 'game-controller',
  other: 'ellipsis-horizontal',
};

export function categoryIcon(slug: string): IconName {
  return CATEGORY_ICON[slug] ?? 'pricetag';
}

/** Item type → icon, used on badges and detail headers. */
const TYPE_ICON: Record<ItemType, IconName> = {
  product: 'cube',
  service: 'hammer',
  skill: 'sparkles',
};

export function typeIcon(type: ItemType): IconName {
  return TYPE_ICON[type];
}
