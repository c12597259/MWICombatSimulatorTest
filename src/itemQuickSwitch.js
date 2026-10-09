// Resolve variants from game definitions, never from translated display names.
export function drinkQualityTarget(hrid, direction, items) {
    if (!hrid) return null;
    const base = hrid.replace(/^\/items\/(super_|ultra_)/, '/items/');
    const variants = [base, base.replace('/items/', '/items/super_'), base.replace('/items/', '/items/ultra_')]
        .filter(id => items[id]?.categoryHrid === '/item_categories/drink'
            && items[id]?.consumableDetail?.usableInActionTypeMap?.['/action_types/combat']);
    const index = variants.indexOf(hrid);
    return index < 0 ? null : variants[index + direction] || null;
}

export function refinementTargets(items) {
    const targets = new Map();
    for (const item of Object.values(items)) {
        const base = items[item.alchemyDetail?.unrefineDetail?.baseItemHrid];
        if (!base?.equipmentDetail || base.equipmentDetail.type !== item.equipmentDetail?.type) continue;
        targets.set(base.hrid, { hrid: item.hrid, refined: false });
        targets.set(item.hrid, { hrid: base.hrid, refined: true });
    }
    return targets;
}
