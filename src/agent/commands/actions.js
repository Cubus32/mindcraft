import * as skills from '../library/skills.js';
import settings from '../../settings.js';

function wrapExecution(func, timeout=-1, resume_name=null) {
    return async function (agent, ...args) {
        let code_return;
        if (resume_name != null) {
            code_return = await agent.coder.executeResume(async () => {
                await func(agent, ...args);
            }, resume_name, timeout);
        } else {
            code_return = await agent.coder.execute(async () => {
                await func(agent, ...args);
            }, timeout);
        }
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }
}

export const actionsList = [
    /*{
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command by writing code.', 
        perform: async function (agent) {
            if (!settings.allow_insecure_coding)
                return 'Agent is not allowed to write code.';
            return await agent.coder.generateCode(agent.history);
        }
    },*/
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            await agent.tasker.stop();
            return 'Agent stopped.';
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            process.exit(1);
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment. Ex: !setMode("hunting", true)',
        params: {
            'mode_name': '(string) The name of the mode to enable.',
            'on': '(bool) Whether to enable or disable the mode.'
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
                return `Mode ${mode_name} does not exist.` + modes.getStr();
            if (modes.isOn(mode_name) === on)
                return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goToPosition',
        description: 'Go to the given position. Ex: !goToPosition(47, 32, -5, 3)',
        params: {
            'x': '(number) The X coordinate.',
            'y': '(number) The Y coordinate.',
            'z': '(number) The Z coordinate.',
            'closeness': '(number) How close to the position it needs to get.'
        },
        perform: async function (agent, x, y, z, closeness) {
            return await skills.goToPosition(agent.bot, x, y, z, closeness);
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player. Ex: !goToPlayer("steve", 3)',
        params: {
            'player_name': '(string) The name of the player to go to.',
            'closeness': '(number) How close to get to the player.'
        },
        perform: async function (agent, player_name, closeness) {
            return await skills.goToPlayer(agent.bot, player_name, closeness);
        }
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player. Will defend that player if self_defense mode is on. Ex: !followPlayer("stevie", 4)',
        params: {
            'player_name': '(string) The name of the player to follow.',
            'follow_dist': '(number) The distance to follow from.'
        },
        perform: wrapExecution(async (agent, player_name, follow_dist) => {
            return await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, -1, 'followPlayer')
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance. Ex: !moveAway(2)',
        params: {'distance': '(number) The distance to move away.'},
        perform: async function (agent, distance) {
            return await skills.moveAway(agent.bot, distance);
        }
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player. Ex: !givePlayer("steve", "stone_pickaxe", 1)',
        params: { 
            'player_name': '(string) The name of the player to give the item to.', 
            'item_name': '(string) The name of the item to give.' ,
            'num': '(number) The number of items to give.'
        },
        perform: async function (agent, player_name, item_name, num) {
            return await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        }
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': '(string) The block type to collect. Ex: !collectBlocks("stone", 10)',
            'num': '(number) The number of blocks to collect.'
        },
        perform: async function (agent, type, num) {
            return await skills.collectBlock(agent.bot, type, num);
        }
    },
    // Commented as it doesn't work well with the tasker
    /*{
        name: '!collectAllBlocks',
        description: 'Collect all the nearest blocks of a given type until told to stop.',
        params: {
            'type': '(string) The block type to collect. Ex: !collectAllBlocks("stone")'
        },
        perform: wrapExecution(async (agent, type) => {
            let success = await skills.collectBlock(agent.bot, type, 1);
            if (success === "Failed to collect blocks.")
                agent.coder.cancelResume();
            else
                return success;
        }, 10, 'collectAllBlocks') // 10 minute timeout
    },*/
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times. Ex: I will craft 8 sticks !craftRecipe("stick", 2)',
        params: {
            'recipe_name': '(string) The name of the output item to craft.',
            'num': '(number) The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.'
        },
        perform: async function (agent, recipe_name, num) {
            for (let i=0; i<num; i++) {
                return await skills.craftRecipe(agent.bot, recipe_name);
            }
        }
    },
    {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches. Ex: !placeBlockHere("crafting_table")',
        params: {'type': '(string) The block type to place.'},
        perform: async function (agent, type) {
            let pos = agent.bot.entity.position;
            return await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        }
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': '(string) The type of entity to attack.'},
        perform: async function (agent, type) {
            return await skills.attackNearest(agent.bot, type, true);
        }
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: async function (agent) {
            return await skills.goToBed(agent.bot);
        }
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        perform: wrapExecution(async (agent) => {
            return await skills.stay(agent.bot);
        })
    }
];
