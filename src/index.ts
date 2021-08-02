import * as Discord from 'discord.js';
const intents = new Discord.Intents().add('GUILDS', 'GUILD_BANS', 'DIRECT_MESSAGES', 'GUILD_MEMBERS', 'GUILD_MESSAGES');
const client = new Discord.Client({intents: intents});

import * as dotenv from 'dotenv';
dotenv.config();
import * as util from './util';

// import * as interactionHelper from './interactionHelper';
client.once('ready', async () => {
    console.log(`[${util.colors.fg.green}✓${util.colors.reset}] ${client.user.tag} is now up`);
    client.user.setActivity({
        type: 'WATCHING',
        name: 'you'
    });

    // interactionHelper.setup(client.user.id.toString());
    // interactionHelper.printCommands(client.user.id.toString());
});

client.on('guildCreate', guild => {
    util.sendGuildJoinNotification(guild, client);
});

import { handleButton } from './buttonHandler';
import { handleCommand } from './commandHandler';
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        handleButton(interaction, client);
    } else if (interaction.isCommand()) {
        handleCommand(interaction, client);
    }
});

client.login(process.env.token);
