import { writeFile, readFile, mkdirSync } from 'fs';
import { sendRequest } from '../utils/gpt.js';
import { Examples } from '../utils/examples.js';
import taskerPrompt from './taskerPrompt.js';
import { containsCommand, commandExists, executeCommand } from './commands/index.js';


export class Tasker {
    constructor(agent) {
        this.agent = agent;
        this.turns = [];

        this.max_messages = 30;
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
        let res = await sendRequest(history, taskerPrompt.GenerateTaskPrompt); // this.history.getSystemMessage()
        console.log('-------- RES RESPONSE:', res);
        console.log('--------');

        // Split the list into an array
        //const stepsArray = res.split('\n');
        const stepsArray = res.split(/\s*\n\s*/);
        const goal = stepsArray[0];

        this.agent.history.add(this.agent.name, goal);
        this.add('system', goal)

        let i = 1;
        if (stepsArray.length == 1)
            i = 0;
        while (i < stepsArray.length) {
            const step = stepsArray[i];
            
            this.add("user", step)
            //console.log(`Step ${i+1}: ${step}`);



            let res = await sendRequest(this.turns, this.agent.history.getSystemMessage());
            this.add('assistant', res);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log('Command message:', res);
                if (!commandExists(command_name)) {
                    this.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name)
                    continue;
                }

                let pre_message = res.substring(0, res.indexOf(command_name)).trim();

                this.agent.cleanChat(`${pre_message}  *used ${command_name.substring(1)}*`);
                let execute_res = await executeCommand(this.agent, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    this.add('assistant', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.agent.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
            

            // TODO: Check if it should update the task list
            

            i++;
        }

        this.clear()
    }

    async add(role, content) {
        this.turns.push({role, content});

        if (this.turns.length >= this.max_messages) {
            this.turns.shift();
        }
    }

    async clear() {
        this.turns.length = 0;
    }
}