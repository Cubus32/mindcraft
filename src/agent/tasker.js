import { writeFile, readFile, mkdirSync } from 'fs';
import { sendRequest } from '../utils/gpt.js';
import { Examples } from '../utils/examples.js';
import taskerPrompt from './taskerPrompt.js';
import { containsCommand, commandExists, executeCommand } from './commands/index.js';

function flipRoles(data) {
    const newData = data.map(item => {
    if (item.role === 'user') {
        return { role: 'assistant', content: item.content };
    } else if (item.role === 'assistant') {
        return { role: 'user', content: item.content };
    } else {
        return item;
    }
    });
    
    return newData;
}

export class Tasker {
    constructor(agent) {
        this.agent = agent;
        this.turns = [];
        this.generatingTasks = false;

        this.max_messages = 80;
    }

    async load() {
        /*
        this.examples = new Examples();
        await this.examples.load('./src/examples_coder.json');

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
        */
    }

    async createTask(history) {
        if(this.generatingTasks)
        {
            console.log("Trying to start task when task is already running");
            return;
        }

        this.clear();

        let goal = await sendRequest(history, taskerPrompt.GenerateTaskGoal);
        if(!goal) {
            this.agent.bot.chat(`Error when generating task goal.`);
            return;
        }
        if(goal.slice(0, 5).toLocaleUpperCase() == "BREAK") {
            console.log("Goal got stopped by BREAK!");
            this.agent.cleanChat(`I don't want to do this task`);
            return;
        }
        this.agent.history.add(this.agent.name, goal);
        this.add('system', `${goal} - Originating from the message "${history[history.length-1].content}"`); // Passing the original message may screw up AddToTasks prompt
        console.log('TASK Goal:', goal);

        const maxIterations = 12;
        let i = 0;
        this.generatingTasks = true;
        while (this.generatingTasks) {
            
            let task = await sendRequest(this.turns, taskerPrompt.AddToTasks); // Ultimately this should generate the commands directly rather than a separate GPT
            this.add("assistant", task);
            if(task.slice(0, 4).toLocaleUpperCase() == "DONE") {
                console.log("Task is DONE!");
                this.agent.cleanChat(`I finished the task!`);
                break;
            }
            if(task.slice(0, 5).toLocaleUpperCase() == "BREAK") {
                console.log("Task got stopped by BREAK!");
                this.agent.cleanChat(`Stopping this task as it got too sidetracked`);
                break;
            }
            console.log('TASK Task:', task);
            

            let flippedTurns = flipRoles(this.turns);
            //console.log("--------------------------TURNS TURNS TURNS TURNS");
            //console.log(flippedTurns);
            let res = await sendRequest(flippedTurns, this.agent.history.getSystemMessage());
            console.log('TASK Res:', res);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log('Command message:', res);
                if (!commandExists(command_name)) {
                    this.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name);
                    continue;
                }

                let pre_message = res.substring(0, res.indexOf(command_name)).trim();

                this.agent.cleanChat(`${pre_message}  *used ${command_name.substring(1)}*`);
                let execute_res = await executeCommand(this.agent, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                {
                    this.add('user', `${res}`);
                    this.add('system', `The command returned: ${execute_res}`);
                }
                else
                {
                    console.log('No return value when executing command', res);
                    this.add('user', `Failure when running command: ${command_name}`);
                }
            }
            else { // conversation response
                this.agent.cleanChat(`${res}`);
                this.add('user', res);
            }

            i++;
            if(i > maxIterations)
                break;
        }
        console.log(this.turns);
        this.clear();

        this.agent.cleanChat(`Finished the task: "${goal}"`);
    }

    async add(role, content) {
        this.turns.push({role, content});

        if (this.turns.length >= this.max_messages) {
            console.log("TASKER MAX MESSAGES REACHED");
            this.turns.shift(); // TODO: This will remove the system message. It should only remove user/assistant messages.
        }
    }

    async clear() {
        this.turns.length = 0;
        this.generatingTasks = false;
    }

    async stop() {
        this.clear();
    }
}