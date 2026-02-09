import AsyncStorage from '@react-native-async-storage/async-storage';
import { RegionConfig, RegionId } from './types';
import krRegion from './kr';
import usRegion from './us';
import arRegion from './ar';
import jpRegion from './jp';

const REGION_KEY = 'app_region';

const REGIONS: Record<RegionId, RegionConfig> = {
  kr: krRegion,
  us: usRegion,
  ar: arRegion,
  jp: jpRegion,
};

export const SUPPORTED_REGIONS: Array<{
  id: RegionId;
  flag: string;
  nameKey: string;
  currency: string;
}> = [
  { id: 'kr', flag: '🇰🇷', nameKey: 'regions.korea', currency: 'KRW' },
  { id: 'us', flag: '🇺🇸', nameKey: 'regions.usa', currency: 'USD' },
  { id: 'ar', flag: '🇦🇷', nameKey: 'regions.argentina', currency: 'ARS' },
  { id: 'jp', flag: '🇯🇵', nameKey: 'regions.japan', currency: 'JPY' },
];

let currentRegionId: RegionId = 'kr';

export function getCurrentRegion(): RegionConfig {
  return REGIONS[currentRegionId];
}

export function getCurrentRegionId(): RegionId {
  return currentRegionId;
}

export function setRegion(regionId: RegionId): void {
  currentRegionId = regionId;
  AsyncStorage.setItem(REGION_KEY, regionId).catch(console.error);
}

export async function loadSavedRegion(): Promise<RegionId> {
  try {
    const saved = await AsyncStorage.getItem(REGION_KEY);
    if (saved && saved in REGIONS) {
      currentRegionId = saved as RegionId;
    }
  } catch (error) {
    console.error('[Region] Failed to load saved region:', error);
  }
  return currentRegionId;
}

export function getRegionConfig(regionId: RegionId): RegionConfig {
  return REGIONS[regionId];
}

export { RegionConfig, RegionId };
