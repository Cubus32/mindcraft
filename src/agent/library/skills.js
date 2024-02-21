import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';


export function log(bot, message, chat=false) {
    bot.output += message + '\n';
    if (chat)
        bot.chat(message);
}

async function autoLight(bot) {
    if (bot.modes.isOn('torch_placing') && !bot.interrupt_code) {
        let nearest_torch = world.getNearestBlock(bot, 'torch', 6);
        if (!nearest_torch) {
            let has_torch = bot.inventory.items().find(item => item.name === 'torch');
            if (has_torch) {
                try {
                    log(bot, `Placing torch at ${bot.entity.position}.`);
                    await placeBlock(bot, 'torch', bot.entity.position.x, bot.entity.position.y, bot.entity.position.z);
                    return true;
                } catch (err) {return true;}
            }
        }
    }
    return false;
}

async function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => item.name.includes('sword') || (item.name.includes('axe') && !item.name.includes('pickaxe')));
    if (weapons.length === 0)
        weapons = bot.inventory.items().filter(item => item.name.includes('pickaxe') || item.name.includes('shovel'));
    if (weapons.length === 0)
        return;
    weapons.sort((a, b) => a.attackDamage < b.attackDamage);
    let weapon = weapons[0];
    if (weapon)
        await bot.equip(weapon, 'hand');

    log(bot, `Equipped ${weapon}`);
}


export async function craftRecipe(bot, itemName) {
    /**
     * Attempt to craft the given item name from a recipe. May craft many items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to craft.
     * @returns {Promise<string>} true if the recipe was crafted, false otherwise.
     * @example
     * await skills.craftRecipe(bot, "stick");
     **/
    let placedTable = false;
    
    // Get recipes that don't require a crafting table
    let itemID = mc.getItemId(itemName);
    let recipes = bot.recipesFor(itemID, null, 1, null); // Recipes that can currently be crafted
    let allRecipes = mc.getItemCraftingRecipes(itemName); // All recipes to craft the item
    //console.log("--------- ALL RECIPES");
    //console.log(allRecipes);
    //console.log("--------- FIRST RECIPE");
    //console.log(allRecipes[0]);
    if(!allRecipes || allRecipes.length === 0)
        return `Unable to find recipes related to ${itemName}.`;
    let craftingTable = null;
    // If the recipe isn't craftable from inventory
    if (!recipes || recipes.length === 0) {
        // Look for crafting table
        craftingTable = world.getNearestBlock(bot, 'crafting_table', 6);
        if (craftingTable === null) {
            // Try to place crafting table
            let hasTable = world.getInventoryCounts(bot)['crafting_table'] > 0;
            if (hasTable) {
                let pos = world.getNearestFreeSpace(bot, 1, 6);
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                craftingTable = world.getNearestBlock(bot, 'crafting_table', 6);
                if (craftingTable) {
                    recipes = bot.recipesFor(itemID, null, 1, craftingTable);
                    placedTable = true;
                } else {
                    return `You for some reason couldn't place down the crafting table in your inventory`;
                }
            } else {
                // You're either missing ingredients, or you don't have a crafting table.
                const missing = missingIngredients(bot, allRecipes[0]); // TODO: Not optimal to always take index 0. Might want to search for the closest to being able to craft recipe.
                if(missing)
                    return `You're missing the ingredients: ${JSON.stringify(missing)}`;
                else
                    return `You're missing a crafting table.`;
            }
        } else {
            recipes = bot.recipesFor(itemID, null, 1, craftingTable);
        }
    }
    
    // Update recipes after finding crafting table
    if (!recipes || recipes.length === 0) {
        if (placedTable) {
             await collectBlock(bot, 'crafting_table', 1);
        }
        const missing = missingIngredients(bot, allRecipes[0]); // TODO: Not optimal to always take index 0. Might want to search for the closest to being able to craft recipe.
        if(missing)
            return `You're missing the ingredients: ${JSON.stringify(missing)}`;
        else
            return `You do not have the resources to craft a ${itemName}.`;
    }
    
    const recipe = recipes[0];
    console.log('crafting...');
    await bot.craft(recipe, 1, craftingTable);
    
    if (placedTable) {
        await collectBlock(bot, 'crafting_table', 1);
    }
    return `Successfully crafted ${itemName}.`; //, you now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}
}

function missingIngredients(bot, recipe) {
    const inventory = world.getInventoryCounts(bot);
    const missing = [];

    if (!recipe) {
        console.log("There is no recipe");
        return null;
    }

    for (const ingredient in recipe) {
        //console.log(`Looking at ingredient ${ingredient}. Inventory has ${inventory[ingredient]} while recipe needs ${recipe[ingredient]} which is ${inventory[ingredient] < recipe[ingredient]}`);
        if (!inventory[ingredient] || inventory[ingredient] < recipe[ingredient]) {
            missing.push(ingredient);
        }
    }

    return missing.length > 0 ? missing : null;
}


export async function smeltItem(bot, itemName, num=1) {
    /**
     * Puts 1 coal in furnace and smelts the given item name, waits until the furnace runs out of fuel or input items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to smelt. Ores must contain "raw" like raw_iron.
     * @param {number} num, the number of items to smelt. Defaults to 1.
     * @returns {Promise<string>} true if the item was smelted, false otherwise. Fail
     * @example
     * await skills.smeltItem(bot, "raw_iron");
     * await skills.smeltItem(bot, "beef");
     **/
    const foods = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish'];
    if (!itemName.includes('raw') && !foods.includes(itemName)) {
        return `Cannot smelt ${itemName}. Must be a "raw" item, like "raw_iron".`;
    } // TODO: allow cobblestone, sand, clay, etc.

    let furnaceBlock = undefined;
    furnaceBlock = world.getNearestBlock(bot, 'furnace', 6);
    if (!furnaceBlock){
        return `There is no furnace nearby.`;
    }
    await bot.lookAt(furnaceBlock.position);

    console.log('smelting...');
    const furnace = await bot.openFurnace(furnaceBlock);
    // check if the furnace is already smelting something
    let input_item = furnace.inputItem();
    if (input_item && input_item.type !== mc.getItemId(itemName) && input_item.count > 0) {
        // TODO: check if furnace is currently burning fuel. furnace.fuel is always null, I think there is a bug.
        // This only checks if the furnace has an input item, but it may not be smelting it and should be cleared.
        return `The furnace is currently smelting ${mc.getItemName(input_item.type)}.`;
    }
    // check if the bot has enough items to smelt
    let inv_counts = world.getInventoryCounts(bot);
    if (!inv_counts[itemName] || inv_counts[itemName] < num) {
        return `You do not have enough ${itemName} to smelt.`;
    }

    // fuel the furnace
    if (!furnace.fuelItem()) {
        let fuel = bot.inventory.items().find(item => item.name === 'coal' || item.name === 'charcoal');
        let put_fuel = Math.ceil(num / 8);
        if (!fuel || fuel.count < put_fuel) {
            return `You do not have enough coal or charcoal to smelt ${num} ${itemName}, you need ${put_fuel} coal or charcoal`;
        }
        await furnace.putFuel(fuel.type, null, put_fuel);
        log(bot, `Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`);
        console.log(`Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`)
    }
    // put the items in the furnace
    await furnace.putInput(mc.getItemId(itemName), null, num);
    // wait for the items to smelt
    let total = 0;
    let collected_last = true;
    let smelted_item = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log('checking...');
        let collected = false;
        if (furnace.outputItem()) {
            smelted_item = await furnace.takeOutput();
            if (smelted_item) {
                total += smelted_item.count;
                collected = true;
            }
        }
        if (!collected && !collected_last) {
            break; // if nothing was collected this time or last time
        }
        collected_last = collected;
        if (bot.interrupt_code) {
            break;
        }
    }

    if (total === 0) {
        return `Failed to smelt ${itemName}.`;
    }
    if (total < num) {
        return `Only smelted ${total} ${mc.getItemName(smelted_item.type)}.`;
    }
    return `Successfully smelted ${itemName}, got ${total} ${mc.getItemName(smelted_item.type)}.`;
}

export async function clearNearestFurnace(bot) {
    /**
     * Clears the nearest furnace of all items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<string>} true if the furnace was cleared, false otherwise.
     * @example
     * await skills.clearNearestFurnace(bot);
     **/
    let furnaceBlock = world.getNearestBlock(bot, 'furnace', 6); 
    if (!furnaceBlock){
        return `There is no furnace nearby.`;
    }

    console.log('clearing furnace...');
    const furnace = await bot.openFurnace(furnaceBlock);
    console.log('opened furnace...')
    // take the items out of the furnace
    let smelted_item, intput_item, fuel_item;
    if (furnace.outputItem())
        smelted_item = await furnace.takeOutput();
    if (furnace.inputItem())
        intput_item = await furnace.takeInput();
    if (furnace.fuelItem())
        fuel_item = await furnace.takeFuel();
    console.log(smelted_item, intput_item, fuel_item)
    let smelted_name = smelted_item ? `${smelted_item.count} ${smelted_item.name}` : `0 smelted items`;
    let input_name = intput_item ? `${intput_item.count} ${intput_item.name}` : `0 input items`;
    let fuel_name = fuel_item ? `${fuel_item.count} ${fuel_item.name}` : `0 fuel items`;
    return `Cleared furnace, recieved ${smelted_name}, ${input_name}, and ${fuel_name}.`;

}


export async function attackNearest(bot, mobType, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} mobType, the type of mob to attack.
     * @param {boolean} kill, whether or not to continue attacking until the mob is dead. Defaults to true.
     * @returns {Promise<string>} true if the mob was attacked, false if the mob type was not found.
     * @example
     * await skills.attackNearest(bot, "zombie", true);
     **/
    const mob = bot.nearestEntity(entity => entity.name && entity.name.toLowerCase() === mobType.toLowerCase());
    if (mob) {
        return await attackEntity(bot, mob, kill);
    }
    return `Could not find any ${mobType} to attack.`;
}

export async function attackEntity(bot, entity, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Entity} entity, the entity to attack.
     * @returns {Promise<string>} true if the entity was attacked, false if interrupted
     * @example
     * await skills.attackEntity(bot, entity);
     **/

    let pos = entity.position;
    console.log(bot.entity.position.distanceTo(pos))

    await equipHighestAttack(bot)

    if (!kill) {
        if (bot.entity.position.distanceTo(pos) > 5) {
            console.log('moving to mob...')
            await goToPosition(bot, pos.x, pos.y, pos.z);
        }
        console.log('attacking mob...')
        await bot.attack(entity);
    }
    else {
        bot.pvp.attack(entity);
        while (world.getNearbyEntities(bot, 16).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
        }
        await pickupNearbyItems(bot);
        return `Successfully killed ${entity.name}.`;
    }
}

export async function defendSelf(bot, range=9) {
    /**
     * Defend yourself from all nearby hostile mobs until there are no more.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} range, the range to look for mobs. Defaults to 8.
     * @returns {Promise<string>} true if the bot found any enemies and has killed them, false if no entities were found.
     * @example
     * await skills.defendSelf(bot);
     * **/
    bot.modes.pause('self_defense');
    let attacked = false;
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    while (enemy) {
        await equipHighestAttack(bot);
        if (bot.entity.position.distanceTo(enemy.position) > 4 && enemy.name !== 'creeper' && enemy.name !== 'phantom') {
            try {
                bot.pathfinder.setMovements(new pf.Movements(bot));
                await bot.pathfinder.goto(new pf.goals.GoalFollow(enemy, 2), true);
            } catch (err) {/* might error if entity dies, ignore */}
        }
        bot.pvp.attack(enemy);
        attacked = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
        if (bot.interrupt_code) {
            bot.pvp.stop();
            return `Unsuccessful`;
        }
    }
    bot.pvp.stop();
    if (attacked)
        return `Successfully defended self.`;
    else
        return `No enemies nearby to defend self from.`;
}



export async function collectBlock(bot, blockType, num=1) {
    /**
     * Collect one of the given block type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to collect.
     * @param {number} num, the number of blocks to collect. Defaults to 1.
     * @returns {Promise<string>} true if the block was collected, false if the block type was not found.
     * @example
     * await skills.collectBlock(bot, "oak_log");
     **/
    if (num < 1) {
        return `Invalid number of blocks to collect: ${num}.`;
    }
    let blocktypes = [blockType];
    if (blockType.endsWith('ore'))
        blocktypes.push('deepslate_'+blockType);

    let collected = 0;

    for (let i=0; i<num; i++) {
        const blocks = world.getNearestBlocks(bot, blocktypes, 64, 1);
        if (blocks.length === 0) {
            if (collected === 0)
                log(bot, `No ${blockType} nearby to collect.`);
            else
                log(bot, `No more ${blockType} nearby to collect.`);
            break;
        }
        const block = blocks[0];
        await bot.tool.equipForBlock(block);
        const itemId = bot.heldItem ? bot.heldItem.type : null
        if (!block.canHarvest(itemId)) {
            log(bot, `Don't have right tools to harvest ${blockType}.`);
            return "Failed to collect blocks.";
        }
        try {
            await bot.collectBlock.collect(block);
            collected++;
            await autoLight(bot);
        }
        catch (err) {
            if (err.name === 'NoChests') {
                log(bot, `Failed to collect ${blockType}: Inventory full, no place to deposit.`);
                break;
            }
            else {
                log(bot, `Failed to collect ${blockType}: ${err}.`);
                continue;
            }
        }
        
        if (bot.interrupt_code)
            break;  
    }
    if(collected == 0)
        return "Failed to collect blocks.";
    return `Collected ${collected} ${blockType}.`;
}

export async function pickupNearbyItems(bot) {
    /**
     * Pick up all nearby items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<string>} true if the items were picked up, false otherwise.
     * @example
     * await skills.pickupNearbyItems(bot);
     **/
    const distance = 8;
    const getNearestItem = bot => bot.nearestEntity(entity => entity.name === 'item' && bot.entity.position.distanceTo(entity.position) < distance);
    let nearestItem = getNearestItem(bot);
    let pickedUp = 0;
    while (nearestItem) {
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalFollow(nearestItem, 0.8), true);
        await new Promise(resolve => setTimeout(resolve, 200));
        let prev = nearestItem;
        nearestItem = getNearestItem(bot);
        if (prev === nearestItem) {
            break;
        }
        pickedUp++;
    }
    return `Picked up ${pickedUp} items.`;
}


export async function breakBlockAt(bot, x, y, z) {
    /**
     * Break the block at the given position. Will use the bot's equipped item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate of the block to break.
     * @param {number} y, the y coordinate of the block to break.
     * @param {number} z, the z coordinate of the block to break.
     * @returns {Promise<string>} true if the block was broken, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.breakBlockAt(bot, position.x, position.y - 1, position.x);
     **/
    if (x == null || y == null || z == null) throw new Error('Invalid position to break block at.');
    let block = bot.blockAt(Vec3(x, y, z));
    if (block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            let pos = block.position;
            let movements = new pf.Movements(bot);
            movements.canPlaceOn = false;
            movements.allow1by1towers = false;
            bot.pathfinder.setMovements(movements);
            await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
        }
        await bot.tool.equipForBlock(block);
        const itemId = bot.heldItem ? bot.heldItem.type : null
        if (!block.canHarvest(itemId)) {
            return `Don't have right tools to break ${block.name}.`;
        }
        await bot.dig(block, true);
        return `Broke ${block.name} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`;
    }
    else {
        return `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)} because it is ${block.name}.`;
    }
}


export async function placeBlock(bot, blockType, x, y, z) {
    /**
     * Place the given block type at the given position. It will build off from any adjacent blocks. Will fail if there is a block in the way or nothing to build off of.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to place.
     * @param {number} x, the x coordinate of the block to place.
     * @param {number} y, the y coordinate of the block to place.
     * @param {number} z, the z coordinate of the block to place.
     * @returns {Promise<string>} true if the block was placed, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.placeBlock(bot, "oak_log", position.x + 1, position.y - 1, position.x);
     **/
    const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    const empty_blocks = ['air', 'water', 'lava', 'grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    const targetBlock = bot.blockAt(target_dest);
    if (!empty_blocks.includes(targetBlock.name)) {
        return `Cannot place block at ${targetBlock.position} because ${targetBlock.name} is in the way.`;
    }
    // get the buildoffblock and facevec based on whichever adjacent block is not empty
    let buildOffBlock = null;
    let faceVec = null;
    const dirs = [Vec3(0, -1, 0), Vec3(0, 1, 0), Vec3(1, 0, 0), Vec3(-1, 0, 0), Vec3(0, 0, 1), Vec3(0, 0, -1)];
    for (let d of dirs) {
        const block = bot.blockAt(target_dest.plus(d));
        if (!empty_blocks.includes(block.name)) {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z);
            break;
        }
    }
    if (!buildOffBlock) {
        return `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`;
    }

    let block = bot.inventory.items().find(item => item.name === blockType);
    if (!block) {
        return `Don't have any ${blockType} to place.`;
    }
    const pos = bot.entity.position;
    const pos_above = pos.plus(Vec3(0,1,0));
    const dont_move_for = ['torch', 'redstone_torch', 'redstone', 'lever', 'button', 'rail', 'detector_rail', 'powered_rail', 'activator_rail', 'tripwire_hook', 'tripwire'];
    if (!dont_move_for.includes(blockType) && (pos.distanceTo(targetBlock.position) < 1 || pos_above.distanceTo(targetBlock.position) < 1)) {
        // too close
        let goal = new pf.goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
        let inverted_goal = new pf.goals.GoalInvert(goal);
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(inverted_goal);
    }
    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        // too far
        let pos = targetBlock.position;
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }
    
    await bot.equip(block, 'hand');
    await bot.lookAt(buildOffBlock.position);

    // will throw error if an entity is in the way, and sometimes even if the block was placed
    try {
        await bot.placeBlock(buildOffBlock, faceVec);
        await new Promise(resolve => setTimeout(resolve, 200));
        return `Successfully placed ${blockType} at ${target_dest}.`;
    } catch (err) {
        return `Failed to place ${blockType} at ${target_dest}.`;
    }
}

export async function equip(bot, itemName, bodyPart) {
    /**
     * Equip the given item to the given body part, like tools or armor.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to equip.
     * @param {string} bodyPart, the body part to equip the item to.
     * @returns {Promise<string>} true if the item was equipped, false otherwise.
     * @example
     * await skills.equip(bot, "iron_pickaxe", "hand");
     * await skills.equip(bot, "diamond_chestplate", "torso");
     **/
    let item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        return `You do not have any ${itemName} to equip.`;
    }
    await bot.equip(item, bodyPart);
    return `You equipped ${itemName}.`;
}

export async function discard(bot, itemName, num=-1) {
    /**
     * Discard the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to discard.
     * @param {number} num, the number of items to discard. Defaults to -1, which discards all items.
     * @returns {Promise<string>} true if the item was discarded, false otherwise.
     * @example
     * await skills.discard(bot, "oak_log");
     **/
    let discarded = 0;
    while (true) {
        let item = bot.inventory.items().find(item => item.name === itemName);
        if (!item) {
            break;
        }
        let to_discard = num === -1 ? item.count : Math.min(num - discarded, item.count);
        await bot.toss(item.type, null, to_discard);
        discarded += to_discard;
        if (num !== -1 && discarded >= num) {
            break;
        }
    }
    if (discarded === 0) {
        return `Failed to discart ${itemName}.`;
    }
    return `Successfully discarded ${discarded} ${itemName}.`;
}

export async function eat(bot, foodName="") {
    /**
     * Eat the given item. If no item is given, it will eat the first food item in the bot's inventory.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} item, the item to eat.
     * @returns {Promise<string>} true if the item was eaten, false otherwise.
     * @example
     * await skills.eat(bot, "apple");
     **/
    let item, name;
    if (foodName) {
        item = bot.inventory.items().find(item => item.name === foodName);
        name = foodName;
    }
    else {
        item = bot.inventory.items().find(item => item.foodRecovery > 0);
        name = "food";
    }
    if (!item) {
        return `You do not have any ${name} to eat.`;
    }
    await bot.equip(item, 'hand');
    await bot.consume();
    return `Successfully ate ${item.name}.`;
}


export async function giveToPlayer(bot, itemType, username, num=1) {
    /**
     * Give one of the specified item to the specified player
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemType, the name of the item to give.
     * @param {string} username, the username of the player to give the item to.
     * @param {number} num, the number of items to give. Defaults to 1.
     * @returns {Promise<string>} true if the item was given, false otherwise.
     * @example
     * await skills.giveToPlayer(bot, "oak_log", "player1");
     **/
    let player = bot.players[username].entity
    if (!player){
        return `Could not find player: ${username}.`;
    }
    await goToPlayer(bot, username);
    await bot.lookAt(player.position);
    let discardReturn = await discard(bot, itemType, num);
    if (discardReturn.charAt(0) == "F")
        return `Failed to give ${username} ${itemType}`
    return `Gave ${username} ${num} ${itemType}`;
}


export async function goToPosition(bot, x, y, z, min_distance=2) {
    /**
     * Navigate to the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to navigate to. If null, the bot's current x coordinate will be used.
     * @param {number} y, the y coordinate to navigate to. If null, the bot's current y coordinate will be used.
     * @param {number} z, the z coordinate to navigate to. If null, the bot's current z coordinate will be used.
     * @param {number} distance, the distance to keep from the position. Defaults to 2.
     * @returns {Promise<string>} true if the position was reached, false otherwise.
     * @example
     * let position = world.world.getNearestBlock(bot, "oak_log", 64).position;
     * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
     **/
    if (x == null || y == null || z == null) {
        log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(x, y, z, min_distance));
    return `You have reached at ${x}, ${y}, ${z}.`;
}


export async function goToPlayer(bot, username, distance=3) {
    /**
     * Navigate to the given player.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to navigate to.
     * @param {number} distance, the goal distance to the player.
     * @returns {Promise<string>} true if the player was found, false otherwise.
     * @example
     * await skills.goToPlayer(bot, "player");
     **/
    bot.modes.pause('self_defense');
    let player = bot.players[username].entity
    if (!player) {
        return `Could not find ${username}.`;
    }
    
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalFollow(player, distance), true);

    console.log("Returning: ", `You have reached ${username}.`);
    return `You have reached ${username}.`;
}


export async function followPlayer(bot, username, distance=4) {
    /**
     * Follow the given player endlessly. Will not return until the code is manually stopped.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to follow.
     * @returns {Promise<string>} true if the player was found, false otherwise.
     * @example
     * await skills.followPlayer(bot, "player");
     **/
    let player = bot.players[username].entity
    if (!player)
        return `A player by name ${username} does not exist`;

    bot.pathfinder.setMovements(new pf.Movements(bot));
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);
    log(bot, `You are now actively following player ${username}.`);

    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return `You are now actively following player ${username}.`; // Is this correct? I'm not fully sure what the promise above is doing
}


export async function moveAway(bot, distance) {
    /**
     * Move away from current position in any direction.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<string>} true if the bot moved away, false otherwise.
     * @example
     * await skills.moveAway(bot, 8);
     **/
    const pos = bot.entity.position;
    let goal = new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance);
    let inverted_goal = new pf.goals.GoalInvert(goal);
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(inverted_goal);
    let new_pos = bot.entity.position;
    return `Moved away from nearest entity to ${new_pos}.`;
}

export async function stay(bot) {
    /**
     * Stay in the current position until interrupted. Disables all modes.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<string>} true if the bot stayed, false otherwise.
     * @example
     * await skills.stay(bot);
     **/
    bot.modes.pause('self_defense');
    bot.modes.pause('hunting');
    bot.modes.pause('torch_placing');
    bot.modes.pause('item_collecting');
    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return `Successfully staying in place`;
}


export async function goToBed(bot) {
    /**
     * Sleep in the nearest bed.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<string>} true if the bed was found, false otherwise.
     * @example
     * await skills.goToBed(bot);
     **/
    const beds = bot.findBlocks({
        matching: (block) => {
            return block.name.includes('bed');
        },
        maxDistance: 32,
        count: 1
    });
    if (beds.length === 0) {
        return `Could not find a bed to sleep in.`;
    }
    let loc = beds[0];
    await goToPosition(bot, loc.x, loc.y, loc.z);
    const bed = bot.blockAt(loc);
    await bot.sleep(bed);
    log(bot, `You are in bed.`);
    while (bot.isSleeping) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log(bot, `You have woken up.`);
    return `You have woken up.`;
}
