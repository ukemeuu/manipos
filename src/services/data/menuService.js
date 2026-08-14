import { supabase } from '../../lib/supabase';
import { getLocalCollection, setLocalCollection } from './localStoreService';
import { isOnline } from './connectivityService';

/**
 * Menu & Catalog Data Service
 */
export async function getMenuItems() {
    // 1. Return local cached catalog instantly
    const localMenu = getLocalCollection('pos_menu');

    // 2. Background delta fetch if online
    if (isOnline()) {
        try {
            const { data, error } = await supabase
                .from('pos_menu')
                .select('*')
                .order('name');
            
            if (!error && data && data.length > 0) {
                setLocalCollection('pos_menu', data);
                return data;
            }
        } catch (e) {
            console.warn('[MenuService] Remote menu sync notice, returning local catalog:', e);
        }
    }

    return localMenu;
}

export async function getCategories() {
    const localCategories = getLocalCollection('pos_categories');

    if (isOnline()) {
        try {
            const { data, error } = await supabase
                .from('pos_categories')
                .select('*')
                .order('display_order', { ascending: true });

            if (!error && data && data.length > 0) {
                setLocalCollection('pos_categories', data);
                return data;
            }
        } catch (e) {}
    }

    return localCategories;
}

export async function getModifierGroups() {
    const localGroups = getLocalCollection('menu_modifier_groups');

    if (isOnline()) {
        try {
            const { data, error } = await supabase
                .from('menu_modifier_groups')
                .select('*');

            if (!error && data) {
                setLocalCollection('menu_modifier_groups', data);
                return data;
            }
        } catch (e) {}
    }

    return localGroups;
}
