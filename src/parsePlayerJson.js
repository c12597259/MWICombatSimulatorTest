import Equipment from "./combatsimulator/equipment.js";
import Player from "./combatsimulator/player.js";
import Consumable from "./combatsimulator/consumable.js";
import Ability from "./combatsimulator/ability.js";
import { resolveGuildCombatShrineLevels } from "./guildCombatShrines.js";

export default function parsePlayerJson(playerJson, hrid) {
    const guildCombatBuffs = Array.isArray(playerJson.guildCombatBuffs)
        ? playerJson.guildCombatBuffs
        : [];
    let playerData = {
        hrid: hrid,
        food: [],
        drinks: [],
        abilities: [],
        ...playerJson.player,
        houseRooms: playerJson.houseRooms,
        achievements: playerJson.achievements ?? {},
        guildCombatBuffs,
        guildCombatBuffLevels: resolveGuildCombatShrineLevels(
            playerJson.guildCombatBuffLevels ?? playerJson.guildShrineLevels,
            guildCombatBuffs,
        ),
    };
    playerData.equipment = {};
    const triggerMap = playerJson.triggerMap;
    ["head", "body", "legs", "feet", "hands", "off_hand", "pouch", "neck", "earrings", "ring", "back", "main_hand", "two_hand", "charm"].forEach((type) => {
        let currentEquipment = playerJson.player.equipment.find(item => item.itemLocationHrid === "/item_locations/" + type);
        if (currentEquipment){
            playerData.equipment[`/equipment_types/${type}`] = new Equipment(currentEquipment.itemHrid, currentEquipment.enhancementLevel);
        }
    });

    for (const foodHrid of playerJson.food["/action_types/combat"]) {
        if (foodHrid.itemHrid === "") continue;
        const food = new Consumable(foodHrid.itemHrid, triggerMap[foodHrid.itemHrid]);
        playerData.food.push(food);
    }
    for (const drinkHrid of playerJson.drinks["/action_types/combat"]) {
        if (drinkHrid.itemHrid === "") continue;
        const drink = new Consumable(drinkHrid.itemHrid, triggerMap[drinkHrid.itemHrid]);
        playerData.drinks.push(drink);
    }
    for (const ability of playerJson.abilities) {
        if (ability.abilityHrid === "") continue;
        const abilityLevel = Number(ability.level);
        const abilityHrid = ability.abilityHrid;
        if (abilityLevel > 0) {
            const abilityObj = new Ability(abilityHrid, abilityLevel, triggerMap[abilityHrid]);
            playerData.abilities.push(abilityObj);
        }
    }
    const player = Player.createFromDTO(playerData)
    player.updateCombatDetails();
    player.houseRooms = playerJson.houseRooms;
    player.achievements = playerJson.achievements ?? {};
    return player;
}
